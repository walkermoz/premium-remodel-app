import "server-only";
import { HttpError, type WorkspaceUser } from "./auth";
import { supabaseAdmin } from "./supabase/server";
import type { Project } from "./types";
import { enqueueWorkflowEvent } from "./workflows/events";

export async function createProjectFromQuote(
  user: WorkspaceUser,
  id: string,
  updatedAt: string,
) {
  const result = await supabaseAdmin().rpc(
    "remodel_create_project_from_quote",
    {
      p_org: user.organizationId,
      p_quote: id,
      p_actor: user.id,
      p_version: updatedAt,
    },
  );
  if (result.error) {
    const message = result.error.message;
    throw new HttpError(
      message.includes("quote_not_found") ? 404 : 409,
      message.includes("quote_scope_missing")
        ? "Add quote items before creating a project."
        : message.includes("quote_changed")
          ? "This quote changed. Refresh before creating its project."
          : "Could not create the project. Refresh and try again.",
    );
  }
  const project = result.data as Project;
  await enqueueWorkflowEvent({
    organizationId: user.organizationId,
    type: "project.created",
    objectType: "project",
    objectId: project.id,
    actor: { type: "user", id: user.id, name: user.name },
    idempotencyKey: `project-created:${project.id}`,
    payload: { quoteId: id, status: project.status },
  }).catch(() => console.error("Could not enqueue project creation."));
  return project;
}
