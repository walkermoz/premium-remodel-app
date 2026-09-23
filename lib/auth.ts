import "server-only";
import { createHash } from "node:crypto";
import { ZodError } from "zod";
import {
  supabaseAdmin,
  supabaseForAccessToken,
  supabaseServer,
} from "./supabase/server";
import { hasSupabaseConfig } from "./supabase/config";
import type { User } from "./types";
export interface WorkspaceUser extends User {
  organizationId: string;
  authUserId: string;
}
export async function getUser(): Promise<WorkspaceUser | null> {
  if (!hasSupabaseConfig()) return null;
  const supabase = await supabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data, error: memberError } = await supabase.rpc(
    "remodel_current_member",
  );
  if (memberError) throw memberError;
  const profile = data?.[0];
  if (
    !profile ||
    (process.env.SUPABASE_ORGANIZATION_ID &&
      profile.organization_id !== process.env.SUPABASE_ORGANIZATION_ID)
  )
    return null;
  return {
    id: profile.id,
    authUserId: user.id,
    organizationId: profile.organization_id,
    name: profile.full_name,
    email: user.email || profile.email || "",
    role: ["owner", "admin"].includes(profile.role) ? "admin" : "member",
    group: profile.role,
  };
}
export async function getRequestUser(
  request: Request,
): Promise<WorkspaceUser | null> {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return getUser();
  if (!hasSupabaseConfig()) return null;
  const supabase = supabaseForAccessToken(match[1]);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(match[1]);
  if (error || !user) return null;
  const { data, error: memberError } = await supabase.rpc(
    "remodel_current_member",
  );
  if (memberError) throw memberError;
  const profile = data?.[0];
  if (
    !profile ||
    (process.env.SUPABASE_ORGANIZATION_ID &&
      profile.organization_id !== process.env.SUPABASE_ORGANIZATION_ID)
  )
    return null;
  return {
    id: profile.id,
    authUserId: user.id,
    organizationId: profile.organization_id,
    name: profile.full_name,
    email: user.email || profile.email || "",
    role: ["owner", "admin"].includes(profile.role) ? "admin" : "member",
    group: profile.role,
  };
}
export async function requireUser() {
  const user = await getUser();
  if (!user)
    throw new HttpError(401, "Please sign in with an active company account.");
  return user;
}
export async function requireRequestUser(request: Request) {
  const user = await getRequestUser(request);
  if (!user)
    throw new HttpError(401, "Please sign in with an active company account.");
  return user;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const protocol = process.env.VERCEL
    ? "https"
    : request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
      url.protocol.slice(0, -1);
  return `${protocol}://${request.headers.get("host") || url.host}`;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== requestOrigin(request))
    throw new HttpError(403, "This request must come from the app.");
}
export function checkOriginOrBearer(request: Request) {
  if (/^Bearer\s+\S+$/i.test(request.headers.get("authorization") || ""))
    return;
  checkOrigin(request);
}
export function appOrigin(request: Request) {
  return process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : requestOrigin(request);
}
export async function limitAttempts(key: string, max = 15) {
  const { data, error } = await supabaseAdmin().rpc("remodel_rate_limit", {
    limit_key: createHash("sha256").update(key).digest("hex"),
  });
  if (error) throw error;
  if (Number(data) > max)
    throw new HttpError(
      429,
      "Too many attempts. Please try again in 15 minutes.",
    );
}
export function apiError(error: unknown) {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError || error instanceof ZodError)
    return Response.json({ error: "Invalid request." }, { status: 400 });
  console.error(
    "Workspace request failed",
    error instanceof Error ? error.name : "DatabaseError",
  );
  return Response.json(
    {
      error:
        "The company workspace is temporarily unavailable. Please try again.",
    },
    { status: 503 },
  );
}
