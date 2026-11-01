import { apiError, limitAttempts } from "@/lib/auth";
import { getRoomScanLogoBytes } from "@/lib/room-scans";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    await limitAttempts(`room-scan-logo:${token}`, 120);
    return new Response(Buffer.from(await getRoomScanLogoBytes(token)), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
