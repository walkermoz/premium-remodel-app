import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin, supabaseServer } from "./supabase/server";
import { HttpError, type WorkspaceUser } from "./auth";
import {
  emptyWorkspace,
  kindKey,
  type Entity,
  type EntityKind,
  type Workspace,
  type Quote,
  type WorkspaceAlert,
} from "./types";
import { acceptedQuote } from "./quotes";
export async function getWorkspace(user: WorkspaceUser): Promise<Workspace> {
  const result = structuredClone(emptyWorkspace);
  const supabase = await supabaseServer();
  // Paginate so growing workspaces are not truncated by the Data API row limit.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("remodel_records")
      .select("kind,data,created_by")
      .eq("organization_id", user.organizationId)
      .order("updated_at", { ascending: false })
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    for (const row of data) {
      const key = kindKey[row.kind as EntityKind];
      if (!key) continue;
      if (
        user.group === "doorknocker" &&
        row.kind !== "door_visit" &&
        row.kind !== "alert" &&
        !(
          (row.kind === "lead" || row.kind === "contact") &&
          row.created_by === user.id
        )
      )
        continue;
      if (row.kind === "alert") {
        const alert = row.data as WorkspaceAlert;
        if (Date.parse(alert.expiresAt) <= Date.now()) continue;
        if (
          user.role !== "admin" &&
          !alert.audiences?.includes(
            user.group === "owner" || user.group === "admin"
              ? "administrators"
              : user.group,
          )
        )
          continue;
      }
      (result[key] as Entity[]).push(row.data);
    }
    if (data.length < 500) break;
  }
  return result;
}
export async function findRecord(
  user: WorkspaceUser,
  id: string,
  kind?: EntityKind,
): Promise<Entity | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await (
    await supabaseServer()
  )
    .from("remodel_records")
    .select("kind,data")
    .eq("organization_id", user.organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data && (!kind || data.kind === kind) ? data.data : null;
}
export async function insertRecord(
  user: WorkspaceUser,
  kind: EntityKind,
  data: Record<string, unknown>,
  requestedId?: string,
) {
  const now = new Date().toISOString();
  const entity = {
    ...data,
    id: requestedId || randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  const { error } = await supabaseAdmin()
    .from("remodel_records")
    .insert({
      id: entity.id,
      organization_id: user.organizationId,
      created_by: user.id,
      updated_by: user.id,
      kind,
      project_id: data.projectId || null,
      data: entity,
      updated_at: now,
    });
  if (error) {
    if (
      (kind === "activity" || kind === "comment") &&
      requestedId &&
      error.code === "23505"
    ) {
      const existing = await findRecord(user, requestedId, kind);
      if (existing && "authorId" in existing && existing.authorId === user.id)
        return existing;
      throw new HttpError(
        409,
        "This entry identifier is already in use. Refresh and try again.",
      );
    }
    throw error;
  }
  return entity;
}
export async function updateRecord(
  user: WorkspaceUser,
  current: Entity,
  data: Record<string, unknown>,
  expectedVersion: string,
) {
  const now = new Date(
    Math.max(Date.now(), Date.parse(current.updatedAt) + 1),
  ).toISOString();
  const entity = {
    ...data,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: now,
  };
  const { data: updated, error } = await supabaseAdmin()
    .from("remodel_records")
    .update({
      data: entity,
      project_id: data.projectId || null,
      updated_at: now,
      updated_by: user.id,
    })
    .eq("organization_id", user.organizationId)
    .eq("id", current.id)
    .eq("updated_at", expectedVersion)
    .select("id");
  if (error) throw error;
  if (!updated.length)
    throw new HttpError(
      409,
      "Someone updated this record. Refresh the workspace and try again.",
    );
  return entity;
}
export async function deleteRecord(user: WorkspaceUser, id: string) {
  const { data, error } = await supabaseAdmin().rpc("remodel_delete_record", {
    target_organization: user.organizationId,
    target_id: id,
    target_actor: user.id,
  });
  if (error) throw error;
  if (!data) throw new HttpError(404, "Record not found.");
}

export async function acceptQuote(
  user: WorkspaceUser,
  quote: Quote,
  expectedVersion: string,
) {
  const now = new Date(
    Math.max(Date.now(), Date.parse(quote.updatedAt) + 1),
  ).toISOString();
  const project = acceptedQuote(quote, user.id, now);
  const { data, error } = await supabaseAdmin()
    .from("remodel_records")
    .update({
      kind: "project",
      data: project,
      updated_at: now,
      updated_by: user.id,
    })
    .eq("organization_id", user.organizationId)
    .eq("id", quote.id)
    .eq("kind", "quote")
    .eq("updated_at", expectedVersion)
    .select("id");
  if (error) throw error;
  if (!data.length)
    throw new HttpError(
      409,
      "This quote changed. Refresh the workspace before accepting it.",
    );
  return project;
}
