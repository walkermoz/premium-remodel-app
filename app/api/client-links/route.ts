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
import { createClientPortalToken } from "@/lib/client-portal";
import { findRecord } from "@/lib/repository";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";

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

function requireAdministrator(user: Awaited<ReturnType<typeof requireUser>>) {
  if (user.role !== "admin")
    throw new HttpError(
      403,
      "Only administrators can manage client portal links.",
    );
}

function portalResponse(
  request: Request,
  link: {
    id: string;
    created_at: string;
    last_viewed_at: string | null;
    view_count: number;
    revoked_at: string | null;
  },
) {
  const active = !link.revoked_at;
  return {
    active,
    url: active
      ? `${appOrigin(request)}/client/${createClientPortalToken(link.id)}`
      : null,
    createdAt: link.created_at,
    lastViewedAt: link.last_viewed_at,
    viewCount: Number(link.view_count || 0),
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requireAdministrator(user);
    const projectId = projectIdFrom(request);
    if (!(await findRecord(user, projectId, "project")))
      throw new HttpError(404, "Project not found.");
    const { data, error } = await supabaseAdmin()
      .from("remodel_client_links")
      .select("id,created_at,last_viewed_at,view_count,revoked_at")
      .eq("organization_id", user.organizationId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) throw error;
    return Response.json(
      data
        ? portalResponse(request, data)
        : {
            active: false,
            url: null,
            createdAt: null,
            lastViewedAt: null,
            viewCount: 0,
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
    requireAdministrator(user);
    await limitAttempts(`client-links:${user.id}`, 30);
    const body = await request.json();
    const projectId = String(body.projectId || "");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        projectId,
      )
    )
      throw new HttpError(400, "Choose a valid project.");
    const project = (await findRecord(
      user,
      projectId,
      "project",
    )) as Project | null;
    if (!project) throw new HttpError(404, "Project not found.");

    const admin = supabaseAdmin();
    const { data: current, error: currentError } = await admin
      .from("remodel_client_links")
      .select("id,created_at,last_viewed_at,view_count,revoked_at")
      .eq("organization_id", user.organizationId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (currentError) throw currentError;
    const rotate = body.rotate === true;
    if (current && !current.revoked_at && !rotate)
      return Response.json(portalResponse(request, current), {
        headers: { "Cache-Control": "private, no-store" },
      });

    const id = randomUUID();
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("remodel_client_links")
      .upsert(
        {
          id,
          organization_id: user.organizationId,
          project_id: projectId,
          created_by: user.id,
          created_at: now,
          revoked_at: null,
          last_viewed_at: null,
          view_count: 0,
        },
        { onConflict: "organization_id,project_id" },
      )
      .select("id,created_at,last_viewed_at,view_count,revoked_at")
      .single();
    if (error) throw error;
    await recordAuditEvent(user, {
      action: current ? "updated" : "created",
      entityKind: "client_link",
      entityId: project.id,
      projectId: project.id,
      subject: project.name,
      afterData: { active: true },
    });
    return Response.json(portalResponse(request, data), {
      status: current ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    requireAdministrator(user);
    const body = await request.json();
    const projectId = String(body.projectId || "");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        projectId,
      )
    )
      throw new HttpError(400, "Choose a valid project.");
    const project = (await findRecord(
      user,
      projectId,
      "project",
    )) as Project | null;
    if (!project) throw new HttpError(404, "Project not found.");
    const { data, error } = await supabaseAdmin()
      .from("remodel_client_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("organization_id", user.organizationId)
      .eq("project_id", projectId)
      .is("revoked_at", null)
      .select("id");
    if (error) throw error;
    if (data.length)
      await recordAuditEvent(user, {
        action: "deleted",
        entityKind: "client_link",
        entityId: project.id,
        projectId: project.id,
        subject: project.name,
        beforeData: { active: true },
        afterData: { active: false },
      });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
