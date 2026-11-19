import { getBusinessConfig } from "@/lib/business-config";
import { randomUUID } from "node:crypto";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { findRecord, getWorkspace } from "@/lib/repository";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import {
  applyJobAction,
  estimateBookingIssue,
  jobOperations,
  jobActionSchema,
} from "@/lib/job-operations";
import type { Project, Quote } from "@/lib/types";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Projects");
    const { id } = await context.params;
    const body = await request.json();
    const current = (await findRecord(user, id, "project")) as Project | null;
    if (!current || current.recordType === "project")
      throw new HttpError(404, "Job not found.");
    if (body.updatedAt !== current.updatedAt)
      throw new HttpError(409, "This job changed. Refresh before continuing.");
    const workspace = await getWorkspace(user);
    const now = new Date(
      Math.max(Date.now(), Date.parse(current.updatedAt) + 1),
    ).toISOString();
    let next: Project;
    let quote: Quote | undefined;
    if (body.action === "book-estimate") {
      await requireWorkspaceTabs(user, "Quotes");
      quote = workspace.quotes?.find(
        (item) => item.id === body.quoteId && item.jobId === id,
      );
      if (!quote) throw new HttpError(404, "Estimate not found on this job.");
      if (quote.bookedJobId === id) return Response.json(current);
      const issue = estimateBookingIssue(quote, workspace);
      if (issue) throw new HttpError(409, issue);
      if (
        current.status === "Completed" ||
        jobOperations(current).invoice.status !== "Draft"
      )
        throw new HttpError(
          409,
          "Reopen the job and invoice before booking work.",
        );
      next = { ...current, job: jobOperations(current), updatedAt: now };
      next.job!.history.unshift({
        at: now,
        by: user.name,
        detail: `Booked estimate #${quote.quoteNumber || quote.id}`,
      });
    } else {
      const parsed = jobActionSchema.safeParse(body);
      if (!parsed.success)
        throw new HttpError(400, parsed.error.issues[0].message);
      try {
        next = applyJobAction(
          current,
          workspace,
          parsed.data,
          user,
          now,
          randomUUID(),
          (await getBusinessConfig(user)).regional.timezone,
        );
      } catch (error) {
        throw new HttpError(
          409,
          error instanceof Error ? error.message : "Could not update this job.",
        );
      }
    }
    const { data, error } = await supabaseAdmin().rpc(
      "remodel_save_job_operation",
      {
        target_organization: user.organizationId,
        target_actor: user.id,
        target_job: id,
        expected_version: current.updatedAt,
        next_data: next,
        completing: body.action === "complete",
        estimate_id: quote?.id || null,
        estimate_version: quote?.updatedAt || null,
      },
    );
    if (error) {
      if (error.code === "PGRST202")
        throw new HttpError(
          503,
          "Job operations require the PR's database migration before this environment can save changes.",
        );
      throw new HttpError(409, error.message);
    }
    return Response.json(data);
  } catch (error) {
    return apiError(error);
  }
}
