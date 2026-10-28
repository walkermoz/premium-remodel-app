import {
  apiError,
  appOrigin,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
  type WorkspaceUser,
} from "@/lib/auth";
import {
  allocateQuoteNumber,
  deleteRecord,
  findRecord,
  getWorkspace,
  insertRecord,
  updateRecord,
} from "@/lib/repository";
import { schemas } from "@/lib/schemas";
import type {
  EntityKind,
  Contractor,
  Project,
  Quote,
  ScopeItem,
  Task,
  WorkspaceAlert,
} from "@/lib/types";
import { preserveScopeCosts } from "@/lib/project-finances";
import { FILE_VALIDATION_VERSION } from "@/lib/file-policy";
import type { Attachment } from "@/lib/types";
import { preserveProjectHistory } from "@/lib/quotes";
import { newestCustomerLead } from "@/lib/contacts";
import {
  leadDisposition,
  leadPatchFromQuote,
  withDispositionChange,
} from "@/lib/leads";
import { syncLeadStageFromQuote } from "@/lib/lead-records";
import type { Lead } from "@/lib/types";
import { preserveWorkSchedule } from "@/lib/work";
import { projectDates } from "@/lib/project-timing";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { validatePricebookSources } from "@/lib/pricebook-source";
import { validateStoredFile } from "@/lib/validate-file";
import { syncOrganizationGoogleCalendars } from "@/lib/google-calendar";
import { stripeClient } from "@/lib/stripe-payments";
import { after } from "next/server";
import { getBusinessConfig } from "@/lib/business-config";
import {
  canEditWorkspaceRecord,
  filterWorkspaceForTabs,
} from "@/lib/workspace-tab-access";
export const runtime = "nodejs";
export const maxDuration = 60;
const filesBucket = "remodel-files";

async function validateLegacyCover(user: WorkspaceUser, cover: Attachment) {
  if (!cover.path.startsWith(`${user.organizationId}/${cover.projectId}/`))
    throw new HttpError(400, "This photo could not be verified.");

  const storage = supabaseAdmin().storage.from(filesBucket);
  const { data: storedFile, error: downloadError } = await storage.download(
    cover.path,
  );
  if (downloadError || !storedFile)
    throw new HttpError(400, "This photo is unavailable. Upload it again.");

  let validated;
  try {
    validated = await validateStoredFile(
      new File([await storedFile.arrayBuffer()], cover.name, {
        type: cover.mime,
      }),
    );
  } catch {
    throw new HttpError(
      400,
      "This older photo could not pass the current safety checks. Upload the original JPG, PNG, or WebP again.",
    );
  }
  if (!validated.mime.startsWith("image/"))
    throw new HttpError(400, "Choose a supported image.");

  const { error: storageError } = await storage.update(
    cover.path,
    validated.bytes,
    {
      contentType: validated.mime,
      upsert: true,
    },
  );
  if (storageError) throw storageError;

  return updateRecord(
    user,
    cover,
    {
      ...cover,
      name: validated.name,
      mime: validated.mime,
      size: validated.bytes.length,
      validationVersion: validated.validationVersion,
    },
    cover.updatedAt,
  );
}

export async function GET() {
  try {
    const user = await requireUser();
    const [workspace, config] = await Promise.all([
      getWorkspace(user),
      getBusinessConfig(user),
    ]);
    return Response.json(
      filterWorkspaceForTabs(workspace, config, user.group),
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  return save(request, false);
}
export async function PATCH(request: Request) {
  return save(request, true);
}
async function save(request: Request, editing: boolean) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.group === "doorknocker")
      throw new HttpError(
        403,
        "Door-knocker records must be saved from the Door knocking page.",
      );
    const body = await request.json();
    const kind = body.kind as keyof typeof schemas;
    if (!Object.prototype.hasOwnProperty.call(schemas, kind))
      throw new HttpError(400, "Unknown record type.");
    if (
      !canEditWorkspaceRecord(await getBusinessConfig(user), user.group, kind)
    )
      throw new HttpError(
        403,
        "This workspace section is not available to your role.",
      );
    const current = editing
      ? await findRecord(user, String(body.id), kind)
      : null;
    if (editing && !current) throw new HttpError(404, "Record not found.");
    if (kind === "quote" && (current as Quote | null)?.status === "Accepted")
      throw new HttpError(
        409,
        "The signed quote is locked. MSA terms can be edited in the agreement section.",
      );
    if (kind === "scope") {
      const parentId = String(
        (body.data as { projectId?: unknown } | undefined)?.projectId ||
          (current as ScopeItem | null)?.projectId ||
          "",
      );
      const parentQuote = (await findRecord(
        user,
        parentId,
        "quote",
      )) as Quote | null;
      if (parentQuote?.status === "Accepted")
        throw new HttpError(409, "The signed quote scope cannot be changed.");
    }
    if (kind === "alert") {
      if (user.role !== "admin")
        throw new HttpError(403, "Only administrators can manage alerts.");
      await limitAttempts(`alerts:${user.id}`, 60);
    }
    let input = body.data;
    if (
      body.data &&
      typeof body.data === "object" &&
      !Array.isArray(body.data)
    ) {
      if (kind === "task")
        input = preserveWorkSchedule(body.data, current as Task | undefined);
      if (kind === "project")
        input = projectDates(body.data, current as Project | null);
      if (kind === "scope")
        input = preserveScopeCosts(body.data, current as ScopeItem | null);
      if (kind === "alert" && editing && current) {
        const alert = current as WorkspaceAlert;
        input = {
          message: body.data.message,
          audiences: alert.audiences,
          durationMinutes: alert.durationMinutes,
          expiresAt: body.data.expiresAt,
        };
      }
    }
    const parsed = schemas[kind].safeParse(input);
    if (!parsed.success)
      throw new HttpError(400, parsed.error.issues[0].message);
    let data = parsed.data as Record<string, unknown>;
    if (
      kind === "lead" &&
      !(await findRecord(user, String(data.contactId), "contact"))
    )
      throw new HttpError(
        400,
        "Create the customer contact before saving this lead.",
      );
    if (kind === "contractor" && current) {
      const contact = current as Contractor;
      if (contact.photoPath) {
        data.photoPath = contact.photoPath;
        data.photoUpdatedAt = contact.photoUpdatedAt;
      }
    }
    if (
      kind === "scope" &&
      data.pricebookItemId &&
      data.pricebookItemId !== (current as ScopeItem | null)?.pricebookItemId
    )
      await validatePricebookSources(user, [data]);
    if (kind === "quote" && data.status === "Accepted")
      throw new HttpError(
        409,
        "Only a customer signature can accept the quote scope.",
      );
    if (kind === "lead" && current) {
      const currentLead = current as Lead;
      for (const key of [
        "discordNotification",
        "leadWebhook",
        "dispositionHistory",
        "smsAppointmentOptIn",
        "smsMarketingOptIn",
        "otherSubmittedFields",
        "leadAttribution",
      ] as const) {
        if (key in currentLead && !(key in data))
          (data as Record<string, unknown>)[key] =
            currentLead[key as keyof Lead];
      }
      const nextDisposition =
        (data.disposition as Lead["disposition"]) ||
        leadDisposition(currentLead);
      const priorDisposition = leadDisposition(currentLead);
      if (nextDisposition !== priorDisposition) {
        Object.assign(
          data,
          withDispositionChange(currentLead, nextDisposition, {
            id: user.id,
            name: user.name,
          }),
        );
      } else {
        data.disposition = nextDisposition;
      }
    }
    if (kind === "project" && data.coverAttachmentId) {
      const cover = (await findRecord(
        user,
        String(data.coverAttachmentId),
        "attachment",
      )) as Attachment | null;
      if (
        !current ||
        !cover ||
        cover.projectId !== current.id ||
        !cover.mime.startsWith("image/")
      )
        throw new HttpError(
          400,
          "Choose a supported image from this project's Photos & files.",
        );
      if (cover.validationVersion !== FILE_VALIDATION_VERSION)
        await validateLegacyCover(user, cover);
    }
    if (kind === "alert") {
      if (editing && current) {
        const alert = current as WorkspaceAlert;
        const expiresAt = Date.parse(String(data.expiresAt || ""));
        const now = Date.now();
        if (!Number.isFinite(expiresAt) || expiresAt <= now)
          throw new HttpError(400, "Choose an expiration time in the future.");
        if (expiresAt > now + 525_600 * 60_000)
          throw new HttpError(
            400,
            "Alerts can expire up to one year from now.",
          );
        data = {
          ...data,
          durationMinutes: Math.max(1, Math.ceil((expiresAt - now) / 60_000)),
          expiresAt: new Date(expiresAt).toISOString(),
          authorId: alert.authorId,
          authorName: alert.authorName,
          lastEditedById: user.id,
          lastEditedByName: user.name,
          lastEditedAt: new Date(now).toISOString(),
        };
      } else {
        data.expiresAt = new Date(
          Date.now() + Number(data.durationMinutes) * 60_000,
        ).toISOString();
        data.authorId = user.id;
        data.authorName = user.name;
      }
    }
    if (kind === "project" || kind === "quote") {
      data = preserveProjectHistory(data, current as Project | Quote | null);
      if (kind === "quote") {
        const prior = current as Quote | null;
        data.quoteNumber =
          prior?.quoteNumber || (await allocateQuoteNumber(user));
        data.preparedBy = prior?.preparedBy || user.name || "Premium Remodel";
        const contactId = String(data.contactId || "").trim();
        if (contactId && !(await findRecord(user, contactId, "contact")))
          throw new HttpError(
            400,
            "Choose a customer contact in this organization.",
          );
        if (!contactId) delete data.contactId;
        const requestedLeadId = String(
          data.leadId || prior?.leadId || "",
        ).trim();
        const requestedLead = requestedLeadId
          ? ((await findRecord(user, requestedLeadId, "lead")) as Lead | null)
          : null;
        if (requestedLeadId && !requestedLead)
          throw new HttpError(
            400,
            "The associated lead is no longer available.",
          );
        if (contactId) {
          const associatedLead =
            requestedLead?.contactId === contactId
              ? requestedLead
              : newestCustomerLead(contactId, (await getWorkspace(user)).leads);
          if (associatedLead) data.leadId = associatedLead.id;
          else delete data.leadId;
        } else if (requestedLead) data.leadId = requestedLead.id;
        else delete data.leadId;
        if (data.status === "Sent" && prior?.status !== "Sent")
          data.quoteSentAt = new Date().toISOString();
        if (
          (data.status === "Declined" || data.status === "Expired") &&
          prior?.status !== data.status
        )
          data.outcomeAt = new Date().toISOString();
      }
    }
    if (kind === "activity") {
      if (editing)
        throw new HttpError(
          400,
          "Activity entries cannot be edited. Delete an incorrect entry and log a correction.",
        );
      if (
        typeof body.requestId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          body.requestId,
        )
      )
        throw new HttpError(400, "An activity request identifier is required.");
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          String(data.actorId),
        )
      )
        throw new HttpError(
          400,
          "Choose an active teammate from this company.",
        );
      const membership = await supabaseAdmin()
        .from("remodel_memberships")
        .select("profile_id")
        .eq("organization_id", user.organizationId)
        .eq("profile_id", data.actorId)
        .eq("active", true)
        .maybeSingle();
      if (membership.error) throw membership.error;
      const actor = membership.data
        ? await supabaseAdmin()
            .from("profiles")
            .select("id,full_name")
            .eq("id", data.actorId)
            .eq("active", true)
            .maybeSingle()
        : null;
      if (actor?.error) throw actor.error;
      if (!actor?.data)
        throw new HttpError(
          400,
          "Choose an active teammate from this company.",
        );
      data.actorName = actor.data.full_name;
      data.authorId = user.id;
      data.authorName = user.name;
    }
    if (kind === "activity" || kind === "comment") {
      for (const id of data.attachmentIds as string[]) {
        const attachment = await findRecord(user, id, "attachment");
        if (
          !attachment ||
          !("projectId" in attachment) ||
          attachment.projectId !== data.projectId
        )
          throw new HttpError(400, "Attachments must belong to this project.");
        if (
          kind === "comment" &&
          (attachment as Attachment).validationVersion !==
            FILE_VALIDATION_VERSION
        )
          throw new HttpError(
            400,
            "Upload this file again so it can pass the current file checks before attaching it to a note.",
          );
      }
    }
    if (kind === "quote" && data.quotePhotos) {
      for (const photo of data.quotePhotos as {
        attachmentId: string;
      }[]) {
        const attachment = (await findRecord(
          user,
          photo.attachmentId,
          "attachment",
        )) as Attachment | null;
        if (
          !attachment ||
          attachment.projectId !== current?.id ||
          !attachment.mime.startsWith("image/") ||
          attachment.validationVersion !== FILE_VALIDATION_VERSION
        )
          throw new HttpError(400, "Choose photos uploaded to this quote.");
      }
    }
    if (kind === "task") {
      const previous = current as Task | null;
      if (data.status === "Done" && previous?.status !== "Done")
        data.completion = {
          id: randomUUID(),
          at: new Date().toISOString(),
          byId: user.id,
          byName: user.name,
        };
      else if (previous?.completion) data.completion = previous.completion;
    }
    if (
      data.projectId &&
      !(await findRecord(user, String(data.projectId), "project")) &&
      !(
        kind === "scope" &&
        (await findRecord(user, String(data.projectId), "quote"))
      )
    )
      throw new HttpError(404, "Project not found.");
    if (
      data.contractorId &&
      !(await findRecord(user, String(data.contractorId), "contractor"))
    )
      throw new HttpError(400, "Choose an existing contractor.");
    if (kind === "comment") {
      data.authorId = user.id;
      data.authorName = user.name;
      if (
        body.requestId !== undefined &&
        (typeof body.requestId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            body.requestId,
          ))
      )
        throw new HttpError(400, "Invalid note request identifier.");
    }
    const responseWithActivity = async (
      entity: Record<string, unknown> | import("@/lib/types").Entity,
      status: number,
    ) => {
      if (kind === "quote") {
        const quote = entity as Quote;
        if (quote.leadId) {
          const linked = (await findRecord(
            user,
            quote.leadId,
            "lead",
          )) as Lead | null;
          if (linked) {
            await syncLeadStageFromQuote(
              user,
              quote.leadId,
              leadPatchFromQuote(linked, quote),
            );
          }
        }
      }
      if (["project", "task", "lead", "contact"].includes(kind)) {
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
      }
      if (
        kind === "activity" &&
        data.activityType === "Payment received" &&
        data.paymentMethod === "Check" &&
        process.env.STRIPE_SECRET_KEY
      ) {
        after(async () => {
          try {
            const project = (await findRecord(
              user,
              String(data.projectId),
              "project",
            )) as Project | null;
            const sessionId = project?.msaAgreement?.depositCheckout?.sessionId;
            if (sessionId)
              await stripeClient(user.organizationId).checkout.sessions.expire(
                sessionId,
              );
          } catch {
            // A recorded check remains valid; an already-completed or expired
            // checkout session cannot be expired again.
          }
        });
      }
      const task = entity as Task;
      const relatedActivity =
        kind === "task" &&
        data.status === "Done" &&
        (current as Task | null)?.status !== "Done" &&
        task.completion
          ? await findRecord(user, task.completion.id, "activity")
          : null;
      return Response.json(
        { ...entity, ...(relatedActivity ? { relatedActivity } : {}) },
        { status },
      );
    };
    if (!editing)
      return await responseWithActivity(
        await insertRecord(
          user,
          kind,
          data,
          kind === "activity" || kind === "comment"
            ? body.requestId
            : undefined,
        ),
        201,
      );
    if (kind === "comment")
      throw new HttpError(400, "Comments cannot be edited.");
    if (!current) throw new HttpError(404, "Record not found.");
    return await responseWithActivity(
      await updateRecord(user, current, data, String(body.updatedAt || "")),
      200,
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.group === "doorknocker")
      throw new HttpError(403, "Door-knocker records cannot be removed here.");
    const body = await request.json();
    const kind = body.kind as EntityKind;
    if (!["task", "scope", "comment", "activity", "alert"].includes(kind))
      throw new HttpError(
        400,
        "This record cannot be deleted. Projects can be marked completed.",
      );
    if (
      !canEditWorkspaceRecord(await getBusinessConfig(user), user.group, kind)
    )
      throw new HttpError(
        403,
        "This workspace section is not available to your role.",
      );
    const current = await findRecord(user, String(body.id), kind);
    if (!current) throw new HttpError(404, "Record not found.");
    if (kind === "scope") {
      const parentQuote = (await findRecord(
        user,
        (current as ScopeItem).projectId,
        "quote",
      )) as Quote | null;
      if (parentQuote?.status === "Accepted")
        throw new HttpError(409, "The signed quote scope cannot be changed.");
    }
    if (kind === "activity" && "stripeSessionId" in current)
      throw new HttpError(
        403,
        "Stripe payments cannot be deleted from the activity log.",
      );
    if (kind === "alert" && user.role !== "admin")
      throw new HttpError(403, "Only administrators can manage alerts.");
    if (
      (kind === "comment" || kind === "activity") &&
      "authorId" in current &&
      current.authorId !== user.id &&
      user.role !== "admin"
    )
      throw new HttpError(403, "You can only delete entries you logged.");
    await deleteRecord(user, current.id);
    if (kind === "task") {
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
    }
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
