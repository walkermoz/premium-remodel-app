import { apiError, checkOrigin, limitAttempts, requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { createOrganizationExportArchive } from "@/lib/organization-archive";
import {
  buildOrganizationExport,
  requireOrganizationOwner,
} from "@/lib/organization-lifecycle";

export const runtime = "nodejs";
export const maxDuration = 60;

function downloadName(name: string, exportedAt: string) {
  const slug =
    name
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "organization";
  return `${slug}-servicebuddy-export-${exportedAt.slice(0, 10)}.zip`;
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    requireOrganizationOwner(user);
    await limitAttempts(`organization-export:${user.id}`, 3);
    const exported = await buildOrganizationExport(user);
    const archive = await createOrganizationExportArchive(
      user.organizationId,
      exported,
    );
    await recordAuditEvent(user, {
      action: "created",
      entityKind: "organization_export",
      entityId: user.organizationId,
      subject: "Exported organization data",
      afterData: {
        format: exported.format,
        version: exported.version,
        exportedAt: exported.exportedAt,
        fileCount: archive.fileCount,
      },
    });

    return new Response(archive.stream, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${downloadName(exported.organization.displayName, exported.exportedAt)}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
