import {
  apiError,
  appOrigin,
  checkOrigin,
  HttpError,
  requireUser,
} from "@/lib/auth";
import { acceptQuote, findRecord } from "@/lib/repository";
import { syncLeadStageFromQuote } from "@/lib/lead-records";
import type { Project, Quote } from "@/lib/types";
import { syncOrganizationGoogleCalendars } from "@/lib/google-calendar";
import { after } from "next/server";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const body = await request.json();
    const quote = (await findRecord(
      user,
      String(body.id),
      "quote",
    )) as Quote | null;
    if (!quote) {
      // A retry after a lost response returns the same project, never a duplicate.
      const project = (await findRecord(
        user,
        String(body.id),
        "project",
      )) as Project | null;
      if (project?.quoteAcceptedAt) return Response.json(project);
      throw new HttpError(404, "Quote not found.");
    }
    const project = await acceptQuote(
      user,
      quote,
      String(body.updatedAt || ""),
    );
    if (quote.leadId) {
      await syncLeadStageFromQuote(user, quote.leadId, { status: "Won" });
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
