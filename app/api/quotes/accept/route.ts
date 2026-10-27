import {
  apiError,
  appOrigin,
  checkOrigin,
  HttpError,
  requireUser,
} from "@/lib/auth";
import { findRecord } from "@/lib/repository";
import { promotePaidQuote } from "@/lib/quote-promotion";
import type { Project } from "@/lib/types";
import { syncOrganizationGoogleCalendars } from "@/lib/google-calendar";
import { after } from "next/server";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Quotes");
    const body = await request.json();
    const id = String(body.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw new HttpError(400, "Choose a valid quote.");
    const quote = await findRecord(user, id, "quote");
    if (!quote) {
      // A retry after a lost response returns the same project, never a duplicate.
      const project = (await findRecord(user, id, "project")) as Project | null;
      if (project?.quoteAcceptedAt) return Response.json(project);
      throw new HttpError(404, "Quote not found.");
    }
    if (quote.updatedAt !== body.updatedAt)
      throw new HttpError(
        409,
        "Quote changed. Refresh before moving it to Projects.",
      );
    let project: Project;
    try {
      const ready = await promotePaidQuote(user.organizationId, id);
      if (!ready) throw new Error("The deposit has not been fully received.");
      project = ready;
    } catch (cause) {
      throw new HttpError(
        409,
        cause instanceof Error
          ? cause.message
          : "Quote is not ready for Projects.",
      );
    }
    const origin = appOrigin(request);
    after(() =>
      syncOrganizationGoogleCalendars(user.organizationId, origin).catch(
        (error) =>
          console.error(
            "Automatic Google Calendar sync failed",
            error instanceof Error ? error.name : "CalendarSyncError",
          ),
      ),
    );
    return Response.json(project);
  } catch (error) {
    return apiError(error);
  }
}
