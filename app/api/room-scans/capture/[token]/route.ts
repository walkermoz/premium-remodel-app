import {
  apiError,
  limitAttempts,
} from "@/lib/auth";
import {
  finalizeRoomScan,
  getRoomScanCaptureSession,
} from "@/lib/room-scans";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    await limitAttempts(`room-scan-capture:${token}`, 120);
    return Response.json(await getRoomScanCaptureSession(token), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    await limitAttempts(`room-scan-finalize:${token}`, 20);
    return Response.json(await finalizeRoomScan(token, await request.json()), {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
