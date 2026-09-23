import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "./supabase/server";

const linkId = z.uuid();
const linkSignature = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const projectSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(250),
  address: z.string().trim().max(250),
  client: z.string().trim().max(250),
  startDate: z.string().max(10),
  endDate: z.string().max(10),
  completedDate: z.string().max(10).optional(),
  status: z.enum(["Planning", "In progress", "On hold", "Completed"]),
  description: z.string().trim().max(15000),
  category: z.string().trim().max(250),
  cover: z.enum([
    "",
    "/images/kitchen.jpg",
    "/images/bathroom.jpg",
    "/images/basement.jpg",
    "/images/outdoor.jpg",
    "/images/home.jpg",
  ]),
  coverAttachmentId: z.union([z.uuid(), z.literal("")]).optional(),
  updatedAt: z.iso.datetime(),
});
const taskSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(250),
  dueDate: z.string().max(10),
  workType: z
    .enum(["Task", "Inspection", "Delivery", "Contractor visit"])
    .optional(),
  startTime: z.string().max(5).optional(),
  endTime: z.string().max(5).optional(),
  status: z.enum(["To do", "In progress", "Done"]),
  completion: z
    .object({
      at: z.iso.datetime(),
    })
    .optional(),
  updatedAt: z.iso.datetime(),
});

export type ClientPortalProject = z.infer<typeof projectSchema>;
export type ClientPortalTask = z.infer<typeof taskSchema>;
export interface ClientPortalData {
  project: ClientPortalProject;
  completed: ClientPortalTask[];
  upcoming: ClientPortalTask[];
  progress: number;
  latestUpdate: string;
}

function clientPortalSecret() {
  const value = process.env.CLIENT_PORTAL_SECRET?.trim();
  if (!value || value.length < 32)
    throw new Error("Client portal signing is not configured.");
  return value;
}

function signatureFor(id: string) {
  return createHmac("sha256", clientPortalSecret())
    .update(`premium-remodel-client:${id}`)
    .digest("base64url");
}

export function createClientPortalToken(id: string = randomUUID()) {
  return `${id}.${signatureFor(id)}`;
}

export function parseClientPortalToken(value: string) {
  const [rawId, rawSignature, extra] = value.split(".");
  const id = linkId.safeParse(rawId);
  const signature = linkSignature.safeParse(rawSignature);
  if (!id.success || !signature.success || extra !== undefined) return null;
  const expected = Buffer.from(signatureFor(id.data), "base64url");
  const received = Buffer.from(signature.data, "base64url");
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  )
    return null;
  return id.data;
}

export async function readClientPortal(token: string) {
  const id = parseClientPortalToken(token);
  if (!id) return null;

  const admin = supabaseAdmin();
  const { data: link, error: linkError } = await admin
    .from("remodel_client_links")
    .select("id,organization_id,project_id")
    .eq("id", id)
    .is("revoked_at", null)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link) return null;

  const [projectResult, taskResult] = await Promise.all([
    admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", link.organization_id)
      .eq("id", link.project_id)
      .eq("kind", "project")
      .maybeSingle(),
    admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", link.organization_id)
      .eq("project_id", link.project_id)
      .eq("kind", "task")
      .order("updated_at", { ascending: false })
      .limit(500),
  ]);
  if (projectResult.error) throw projectResult.error;
  if (taskResult.error) throw taskResult.error;
  const project = projectSchema.safeParse(projectResult.data?.data);
  if (!project.success) return null;
  const tasks = taskResult.data
    .map((row) => taskSchema.safeParse(row.data))
    .filter((result) => result.success)
    .map((result) => result.data);
  const completed = tasks
    .filter((task) => task.status === "Done")
    .sort((a, b) =>
      (b.completion?.at || b.updatedAt).localeCompare(
        a.completion?.at || a.updatedAt,
      ),
    );
  const upcoming = tasks
    .filter((task) => task.status !== "Done")
    .sort(
      (a, b) =>
        (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31") ||
        (a.startTime || "99:99").localeCompare(b.startTime || "99:99"),
    );
  const progress = tasks.length
    ? Math.round((completed.length / tasks.length) * 100)
    : project.data.status === "Completed"
      ? 100
      : 0;
  const latestUpdate = [
    project.data.updatedAt,
    ...tasks.map((t) => t.updatedAt),
  ]
    .sort()
    .at(-1)!;

  // Viewing statistics contain no client identity and never affect portal access.
  // Wait for the database call so serverless runtimes do not end the request first.
  await admin.rpc("remodel_note_client_portal_view", { target_link: id });

  return {
    project: project.data,
    completed,
    upcoming,
    progress,
    latestUpdate,
  } satisfies ClientPortalData;
}
