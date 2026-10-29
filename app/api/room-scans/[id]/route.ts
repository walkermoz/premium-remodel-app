import {
  apiError,
  checkOrigin,
  HttpError,
  requireUser,
} from "@/lib/auth";
import { deleteRoomScan, findRoomScan } from "@/lib/room-scans";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Quotes");
    const { id } = await context.params;
    const scan = await findRoomScan(user.organizationId, id);
    if (!scan) throw new HttpError(404, "Room scan not found.");
    await deleteRoomScan(user.organizationId, id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
