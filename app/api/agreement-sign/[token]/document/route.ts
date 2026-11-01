import { agreementSigningDocument } from "@/lib/agreement-packets";
import { apiError, limitAttempts } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    await limitAttempts(`agreement-document:${token}`, 120);
    const document = await agreementSigningDocument(token);
    const download = new URL(request.url).searchParams.has("download");
    return new Response(new Uint8Array(document.bytes).buffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${document.filename.replace(/["\\]/g, "")}"`,
        "Content-Type": "application/pdf",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
