import { z } from "zod";
import {
  apiError,
  appOrigin,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { findRecord } from "@/lib/repository";
import {
  createRoomScanSession,
  listRoomScans,
} from "@/lib/room-scans";
import type { Quote } from "@/lib/types";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

const quoteRequest = z.object({ quoteId: z.uuid() });

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Quotes");
    const quoteId = z.uuid().parse(new URL(request.url).searchParams.get("quoteId"));
    if (!(await findRecord(user, quoteId, "quote")))
      throw new HttpError(404, "Quote not found.");
    return Response.json(
      { scans: await listRoomScans(user.organizationId, quoteId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Quotes");
    await limitAttempts(`room-scan-session:${user.id}`, 30);
    const { quoteId } = quoteRequest.parse(await request.json());
    const quote = (await findRecord(user, quoteId, "quote")) as Quote | null;
    if (!quote) throw new HttpError(404, "Quote not found.");
    if (quote.status === "Accepted")
      throw new HttpError(409, "Room scans cannot be added to a signed quote.");
    const session = await createRoomScanSession(user, quote);
    const server = appOrigin(request);
    const params = new URLSearchParams({ token: session.token, server });
    return Response.json(
      {
        launchUrl: `premiumremodelfield://room-scan?${params}`,
        expiresAt: session.expiresAt,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
