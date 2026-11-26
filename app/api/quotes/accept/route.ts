import {
  apiError,
  appOrigin,
  checkOrigin,
  HttpError,
  requireUser,
} from "@/lib/auth";
import { findRecord } from "@/lib/repository";
import { createProjectFromQuote } from "@/lib/quote-project";
import { attachConfiguredPaperwork } from "@/lib/paperwork";
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
    await requireWorkspaceTabs(user, "Projects");
    const project = await createProjectFromQuote(
      user,
      id,
      String(body.updatedAt || ""),
    );
    await attachConfiguredPaperwork(user, id, "project_created");
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
