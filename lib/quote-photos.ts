import "server-only";

import sharp from "sharp";
import { HttpError } from "./auth";
import { supabaseAdmin } from "./supabase/server";
import type { Attachment, Quote, QuotePhoto } from "./types";

const bucket = "remodel-files";

export async function readQuotePhoto(
  organizationId: string,
  quoteId: string,
  photo: QuotePhoto,
) {
  const admin = supabaseAdmin();
  const { data: row, error: lookupError } = await admin
    .from("remodel_records")
    .select("data")
    .eq("organization_id", organizationId)
    .eq("id", photo.attachmentId)
    .eq("kind", "attachment")
    .maybeSingle();
  if (lookupError) throw lookupError;
  const attachment = row?.data as Attachment | undefined;
  if (
    !attachment ||
    attachment.projectId !== quoteId ||
    !["image/jpeg", "image/png", "image/webp"].includes(attachment.mime) ||
    !attachment.path.startsWith(`${organizationId}/${quoteId}/`)
  )
    throw new HttpError(
      409,
      "A selected quote photo is missing. Remove it or upload it again.",
    );
  const { data, error } = await admin.storage
    .from(bucket)
    .download(attachment.path);
  if (error || !data)
    throw new HttpError(
      409,
      "A selected quote photo is unavailable. Try again shortly.",
    );
  return { attachment, bytes: Buffer.from(await data.arrayBuffer()) };
}

export async function loadQuotePhotos(quote: Quote, organizationId: string) {
  return Promise.all(
    (quote.quotePhotos || []).map(async (photo) => {
      const { bytes } = await readQuotePhoto(organizationId, quote.id, photo);
      const image = await sharp(bytes, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 82 })
        .toBuffer();
      return { ...photo, bytes: image };
    }),
  );
}
