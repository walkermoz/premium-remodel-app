import { readClientQuoteSource } from "@/lib/client-quote";
import { getBusinessConfigForOrganization } from "@/lib/business-config";
import { getBusinessBrandingBytes } from "@/lib/business-branding";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const source = await readClientQuoteSource(token);
  if (!source) return new Response(null, { status: 404 });
  const config = await getBusinessConfigForOrganization(source.organizationId);
  if (config.profile.bannerUrl !== "/api/business-branding/banner")
    return new Response(null, { status: 404 });
  const bytes = await getBusinessBrandingBytes(source.organizationId, "banner");
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
