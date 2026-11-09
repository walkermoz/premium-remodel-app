import { randomUUID } from "node:crypto";
import {
  apiError,
  appOrigin,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import {
  createClientEmailToken,
  createClientPortalToken,
} from "@/lib/client-portal";
import { isValidClientQuoteSnapshot } from "@/lib/client-quote";
import { createQuoteRevision } from "@/lib/client-quote-link";
import { findRecord } from "@/lib/repository";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Project, Quote } from "@/lib/types";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

function linkKind(value: unknown): "project" | "quote" {
  if (value === "project" || value === "quote") return value;
  throw new HttpError(400, "Choose a valid customer portal type.");
}

function projectIdFrom(request: Request) {
  const value = new URL(request.url).searchParams.get("projectId") || "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new HttpError(400, "Choose a valid project.");
  return value;
}

async function requirePortalAccess(
  user: Awaited<ReturnType<typeof requireUser>>,
  kind: "project" | "quote",
) {
  await requireWorkspaceTabs(user, kind === "project" ? "Projects" : "Quotes");
  await requireOrganizationCapability(user, "quotes.manage");
}

async function findLinkTarget(
  user: Awaited<ReturnType<typeof requireUser>>,
  id: string,
  kind: "project" | "quote",
) {
  const record = (await findRecord(user, id, kind)) as Project | Quote | null;
  if (record || kind === "project") return record;
  const accepted = (await findRecord(user, id, "project")) as Project | null;
  return accepted?.quoteAcceptedAt ? accepted : null;
}

function portalResponse(
  request: Request,
  kind: "project" | "quote",
  clientEmail: string | undefined,
  link: {
    id: string;
    created_at: string;
    last_viewed_at: string | null;
    view_count: number;
    revoked_at: string | null;
    document_revision?: number | null;
  },
) {
  const active = !link.revoked_at;
  const token = active
    ? kind === "quote" && clientEmail
      ? createClientEmailToken(link.id, clientEmail)
      : createClientPortalToken(link.id)
    : null;
  return {
    active,
    url: active
      ? `${appOrigin(request)}/client/${token}${kind === "quote" ? "/quote" : ""}`
      : null,
    createdAt: link.created_at,
    lastViewedAt: link.last_viewed_at,
    viewCount: Number(link.view_count || 0),
    revision: link.document_revision || null,
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const kind = linkKind(new URL(request.url).searchParams.get("kind"));
    await requirePortalAccess(user, kind);
    const projectId = projectIdFrom(request);
    const record = await findLinkTarget(user, projectId, kind);
    if (!record)
      throw new HttpError(
        404,
        `${kind === "quote" ? "Quote" : "Project"} not found.`,
      );
    const { data, error } = await supabaseAdmin()
      .from("remodel_client_links")
      .select(
        "id,created_at,last_viewed_at,view_count,revoked_at,document_revision",
      )
      .eq("organization_id", user.organizationId)
      .eq("project_id", projectId)
      .eq("kind", kind)
      .maybeSingle();
    if (error) throw error;
    return Response.json(
      data
        ? portalResponse(request, kind, record.clientEmail, data)
        : {
            active: false,
            url: null,
            createdAt: null,
            lastViewedAt: null,
            viewCount: 0,
            revision: null,
          },
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
    await limitAttempts(`client-links:${user.id}`, 30);
    const body = await request.json();
    const kind = linkKind(body.kind);
    await requirePortalAccess(user, kind);
    const projectId = String(body.projectId || "");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        projectId,
      )
    )
      throw new HttpError(400, "Choose a valid project.");
    const record = await findLinkTarget(user, projectId, kind);
    if (!record)
      throw new HttpError(
        404,
        `${kind === "quote" ? "Quote" : "Project"} not found.`,
      );
    if (kind === "quote" && record.status !== "Sent" && !record.quoteAcceptedAt)
      throw new HttpError(
        400,
        "Mark the quote as sent before sharing its client link.",
      );

    const admin = supabaseAdmin();
    const { data: current, error: currentError } = await admin
      .from("remodel_client_links")
      .select(
        "id,created_at,last_viewed_at,view_count,revoked_at,document_revision",
      )
      .eq("organization_id", user.organizationId)
      .eq("project_id", projectId)
      .eq("kind", kind)
      .maybeSingle();
    if (currentError) throw currentError;
    const rotate = body.rotate === true;
    if (current && !current.revoked_at && !rotate)
      return Response.json(
        portalResponse(request, kind, record.clientEmail, current),
        {
          headers: { "Cache-Control": "private, no-store" },
        },
      );

    let quoteSnapshot: { quote: Project | Quote; items: unknown[] } | null =
      null;
    if (kind === "quote") {
      const { data: scopeRows, error: scopeError } = await admin
        .from("remodel_records")
        .select("data")
        .eq("organization_id", user.organizationId)
        .eq("project_id", projectId)
        .eq("kind", "scope")
        .order("updated_at", { ascending: true })
        .limit(501);
      if (scopeError) throw scopeError;
      if (scopeRows.length > 500)
        throw new HttpError(
          413,
          "This quote has too many items to share online.",
        );
      quoteSnapshot = {
        quote: record.quoteAcceptedAt ? { ...record, status: "Sent" } : record,
        items: scopeRows.map((row) => row.data),
      };
      if (!isValidClientQuoteSnapshot(quoteSnapshot))
        throw new HttpError(400, "Check this quote's scope before sharing it.");
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const revision = quoteSnapshot
      ? await createQuoteRevision(
          user,
          projectId,
          quoteSnapshot as unknown as Record<string, unknown>,
        )
      : null;
    const { data, error } = await admin
      .from("remodel_client_links")
      .upsert(
        {
          id,
          organization_id: user.organizationId,
          project_id: projectId,
          kind,
          quote_snapshot: quoteSnapshot,
          created_by: user.id,
          created_at: now,
          revoked_at: null,
          last_viewed_at: null,
          view_count: 0,
          document_revision_id: revision?.id || null,
          document_revision: revision?.revision || null,
        },
        { onConflict: "organization_id,project_id,kind" },
      )
      .select(
        "id,created_at,last_viewed_at,view_count,revoked_at,document_revision",
      )
      .single();
    if (error) {
      if (revision)
        await admin
          .from("remodel_quote_document_revisions")
          .delete()
          .eq("organization_id", user.organizationId)
          .eq("id", revision.id);
      throw error;
    }
    await recordAuditEvent(user, {
      action: current ? "updated" : "created",
      entityKind: "client_link",
      entityId: record.id,
      projectId: record.id,
      subject: record.name,
      afterData: { active: true },
    });
    return Response.json(
      portalResponse(request, kind, record.clientEmail, data),
      {
        status: current ? 200 : 201,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const body = await request.json();
    const kind = linkKind(body.kind);
    await requirePortalAccess(user, kind);
    const projectId = String(body.projectId || "");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        projectId,
      )
    )
      throw new HttpError(400, "Choose a valid project.");
    const record = await findLinkTarget(user, projectId, kind);
    if (!record)
      throw new HttpError(
        404,
        `${kind === "quote" ? "Quote" : "Project"} not found.`,
      );
    const { data, error } = await supabaseAdmin()
      .from("remodel_client_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("organization_id", user.organizationId)
      .eq("project_id", projectId)
      .eq("kind", kind)
      .is("revoked_at", null)
      .select("id");
    if (error) throw error;
    if (data.length)
      await recordAuditEvent(user, {
        action: "deleted",
        entityKind: "client_link",
        entityId: record.id,
        projectId: record.id,
        subject: record.name,
        beforeData: { active: true },
        afterData: { active: false },
      });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
