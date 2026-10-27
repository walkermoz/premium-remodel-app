import { readClientQuoteSource } from "@/lib/client-quote";
import { getBusinessLogoBytes } from "@/lib/business-logo";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const source = await readClientQuoteSource(token);
  if (!source) return new Response(null, { status: 404 });
  const logo = await getBusinessLogoBytes(source.organizationId);
  if (!logo) return new Response(null, { status: 404 });
  return new Response(Buffer.from(logo), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
