import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { HttpError, type WorkspaceUser } from "./auth";
import {
  apiKeyScopes,
  type ApiKeyRecord,
  type ApiKeyScope,
} from "./api-key-types";
import { supabaseAdmin } from "./supabase/server";

export type { ApiKeyRecord } from "./api-key-types";

const KEY_PREFIX = "sbk_";

export interface ApiKeyPrincipal {
  keyId: string;
  organizationId: string;
  name: string;
  scopes: ApiKeyScope[];
  /** Synthetic admin actor for write-back attribution. */
  actor: WorkspaceUser;
}

function hashKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export function mintApiKeySecret() {
  const secret = randomBytes(24).toString("base64url");
  const raw = `${KEY_PREFIX}${secret}`;
  return {
    raw,
    prefix: raw.slice(0, 12),
    hash: hashKey(raw),
  };
}

export async function listApiKeys(
  organizationId: string,
): Promise<ApiKeyRecord[]> {
  const { data, error } = await supabaseAdmin()
    .from("remodel_api_keys")
    .select("id,name,key_prefix,created_at,last_used_at,revoked_at,created_by,scopes,expires_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    createdBy: row.created_by,
    scopes: (row.scopes || []) as ApiKeyScope[],
    expiresAt: row.expires_at,
  }));
}

export async function createApiKey(
  user: WorkspaceUser,
  input: { name: string; scopes: ApiKeyScope[]; expiresAt: string | null },
) {
  const minted = mintApiKeySecret();
  const { data, error } = await supabaseAdmin()
    .from("remodel_api_keys")
    .insert({
      organization_id: user.organizationId,
      name: input.name.trim(),
      key_prefix: minted.prefix,
      key_hash: minted.hash,
      created_by: user.id,
      scopes: input.scopes,
      expires_at: input.expiresAt,
    })
    .select("id,name,key_prefix,created_at,last_used_at,revoked_at,created_by,scopes,expires_at")
    .single();
  if (error) throw error;
  return {
    key: {
      id: data.id,
      name: data.name,
      keyPrefix: data.key_prefix,
      createdAt: data.created_at,
      lastUsedAt: data.last_used_at,
      revokedAt: data.revoked_at,
      createdBy: data.created_by,
      scopes: data.scopes as ApiKeyScope[],
      expiresAt: data.expires_at,
    } satisfies ApiKeyRecord,
    secret: minted.raw,
  };
}

export async function revokeApiKey(
  user: WorkspaceUser,
  keyId: string,
): Promise<ApiKeyRecord> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin()
    .from("remodel_api_keys")
    .update({ revoked_at: now })
    .eq("organization_id", user.organizationId)
    .eq("id", keyId)
    .is("revoked_at", null)
    .select("id,name,key_prefix,created_at,last_used_at,revoked_at,created_by,scopes,expires_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "API key not found or already revoked.");
  return {
    id: data.id,
    name: data.name,
    keyPrefix: data.key_prefix,
    createdAt: data.created_at,
    lastUsedAt: data.last_used_at,
    revokedAt: data.revoked_at,
    createdBy: data.created_by,
    scopes: data.scopes as ApiKeyScope[],
    expiresAt: data.expires_at,
  };
}

function extractBearerOrApiKey(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(\S+)$/i);
  if (bearer) return bearer[1];
  const header = request.headers.get("x-api-key");
  return header?.trim() || null;
}

export async function requireApiKey(
  request: Request,
  requiredScopes: ApiKeyScope[] = [],
): Promise<ApiKeyPrincipal> {
  const raw = extractBearerOrApiKey(request);
  if (!raw || !raw.startsWith(KEY_PREFIX))
    throw new HttpError(401, "A valid admin API key is required.");

  const { data, error } = await supabaseAdmin()
    .from("remodel_api_keys")
    .select("id,organization_id,name,revoked_at,scopes,expires_at")
    .eq("key_hash", hashKey(raw))
    .maybeSingle();
  if (error) throw error;
  if (!data || data.revoked_at)
    throw new HttpError(401, "API key is invalid or revoked.");
  if (data.expires_at && Date.parse(data.expires_at) <= Date.now())
    throw new HttpError(401, "API key has expired.");
  const scopes = (data.scopes || []) as ApiKeyScope[];
  if (scopes.some((scope) => !apiKeyScopes.includes(scope)))
    throw new HttpError(401, "API key has an invalid scope configuration.");
  const missing = requiredScopes.filter((scope) => !scopes.includes(scope));
  if (missing.length)
    throw new HttpError(
      403,
      `API key is missing required scope${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`,
    );

  void supabaseAdmin()
    .from("remodel_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .eq("organization_id", data.organization_id)
    .then(({ error: touchError }) => {
      if (touchError) console.error("Could not update API key last_used_at.");
    });

  return {
    keyId: data.id,
    organizationId: data.organization_id,
    name: data.name,
    scopes,
    actor: {
      id: data.id,
      authUserId: data.id,
      organizationId: data.organization_id,
      name: `API key · ${data.name}`,
      email: "",
      role: "admin",
      group: "admin",
    },
  };
}
