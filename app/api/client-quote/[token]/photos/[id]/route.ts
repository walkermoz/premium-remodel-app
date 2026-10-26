import { readClientQuoteSource } from "@/lib/client-quote";
import { readQuotePhoto } from "@/lib/quote-photos";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const source = await readClientQuoteSource(token, { recordView: false });
  const photo = source?.view.quote.quotePhotos?.find(
    (item) => item.attachmentId === id,
  );
  if (!source || !photo) return new Response("Not found", { status: 404 });
  try {
    const { attachment, bytes } = await readQuotePhoto(
      source.organizationId,
      source.view.quote.id,
      photo,
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": attachment.mime,
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
