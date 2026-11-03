import "server-only";

import ZipStream from "zip-stream";
import { createHash } from "node:crypto";
import { PassThrough, Readable } from "node:stream";
import { HttpError } from "./auth";
import { supabaseAdmin } from "./supabase/server";

const bucket = "remodel-files";
const pageSize = 100;
const maxFiles = 10_000;
const maxBytes = 2 * 1024 * 1024 * 1024;

type StorageObject = {
  name: string;
  id?: string | null;
  metadata?: { size?: number } | null;
};

function safeArchivePath(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.split("/").some((part) => part === ".." || !part) ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  )
    throw new HttpError(
      409,
      "An organization file has an invalid storage path.",
    );
  return normalized;
}

async function listOrganizationFiles(organizationId: string) {
  const storage = supabaseAdmin().storage.from(bucket);
  const files: string[] = [];
  const folders = [organizationId];

  while (folders.length) {
    const folder = folders.pop()!;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await storage.list(folder, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;
      const page = (data || []) as StorageObject[];
      for (const entry of page) {
        const path = `${folder}/${entry.name}`;
        if (entry.id) files.push(path);
        else folders.push(path);
        if (files.length > maxFiles)
          throw new HttpError(
            413,
            `This organization has more than ${maxFiles.toLocaleString("en-US")} files. Contact ServiceBuddy support for a managed export.`,
          );
      }
      if (page.length < pageSize) break;
    }
  }
  return files;
}

export async function deleteOrganizationStorage(organizationId: string) {
  const paths = await listOrganizationFiles(organizationId);
  const storage = supabaseAdmin().storage.from(bucket);
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await storage.remove(paths.slice(index, index + 100));
    if (error) throw error;
  }
  const remaining = await listOrganizationFiles(organizationId);
  if (remaining.length)
    throw new HttpError(
      409,
      "Some organization uploads could not be removed. Deletion was paused.",
    );
  return paths.length;
}

export async function createOrganizationExportArchive(
  organizationId: string,
  organizationExport: Record<string, unknown>,
) {
  const paths = await listOrganizationFiles(organizationId);
  const output = new PassThrough();
  const archive = new ZipStream({ zlib: { level: 6 } });
  archive.pipe(output);

  const addEntry = (source: string | Buffer, name: string) =>
    new Promise<void>((resolve, reject) => {
      archive.entry(source, { name }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

  const completion = (async () => {
    const fileManifest: Array<{
      path: string;
      size: number;
      sha256: string;
    }> = [];
    let totalBytes = 0;
    await addEntry(
      JSON.stringify(organizationExport, null, 2),
      "data/organization.json",
    );

    for (const path of paths) {
      if (!path.startsWith(`${organizationId}/`))
        throw new HttpError(
          409,
          "An export file escaped the organization boundary.",
        );
      const { data, error } = await supabaseAdmin()
        .storage.from(bucket)
        .download(path);
      if (error || !data)
        throw new HttpError(409, `Could not export organization file ${path}.`);
      const bytes = Buffer.from(await data.arrayBuffer());
      totalBytes += bytes.length;
      if (totalBytes > maxBytes)
        throw new HttpError(
          413,
          "This organization has more than 2 GB of uploads. Contact ServiceBuddy support for a managed export.",
        );
      const relativePath = safeArchivePath(
        path.slice(organizationId.length + 1),
      );
      await addEntry(bytes, `files/${relativePath}`);
      fileManifest.push({
        path: relativePath,
        size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }

    await addEntry(
      JSON.stringify(
        {
          bucket,
          organizationPrefix: `${organizationId}/`,
          fileCount: fileManifest.length,
          totalBytes,
          files: fileManifest,
        },
        null,
        2,
      ),
      "data/files-manifest.json",
    );
    archive.finalize();
  })();

  void completion.catch((error) => archive.destroy(error));
  return {
    stream: Readable.toWeb(output) as ReadableStream<Uint8Array>,
    fileCount: paths.length,
  };
}
