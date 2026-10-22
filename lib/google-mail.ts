import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import { appOrigin, HttpError, type WorkspaceUser } from "./auth";
import { supabaseAdmin } from "./supabase/server";
import { recordAuditEvent } from "./audit-server";

export const googleMailCookie = "premium_remodel_google_mail";
export const googleMailScope = "https://www.googleapis.com/auth/gmail.send";
export const googleMailAddress = "contact@premiumremodel.com";
const timeoutMs = 15_000;

type Fetcher = typeof fetch;
type Connection = {
  organization_id: string;
  connected_by: string | null;
  google_account_id: string;
  google_email: string;
  refresh_token_ciphertext: string;
  connected_at: string;
};

export class GoogleMailError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
    this.name = "GoogleMailError";
  }
}

function config() {
  return {
    clientId:
      process.env.GOOGLE_GMAIL_CLIENT_ID?.trim() ||
      process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() ||
      "",
    clientSecret:
      process.env.GOOGLE_GMAIL_CLIENT_SECRET?.trim() ||
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() ||
      "",
    encryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim() || "",
  };
}

function key() {
  const decoded = Buffer.from(config().encryptionKey, "base64url");
  if (decoded.length !== 32)
    throw new HttpError(503, "Google Mail encryption is not configured.");
  return decoded;
}

export function googleMailConfigured() {
  const { clientId, clientSecret } = config();
  if (!clientId || !clientSecret) return false;
  try {
    return key().length === 32;
  } catch {
    return false;
  }
}

function requiredConfig() {
  if (!googleMailConfigured())
    throw new HttpError(503, "Google Mail is not configured yet.");
  return config();
}

function seal(value: string, purpose: "state" | "refresh") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`premium-remodel:google-mail:${purpose}:v1`));
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    bytes.toString("base64url"),
  ].join(".");
}

function unseal(value: string, purpose: "state" | "refresh") {
  const [version, iv, tag, ciphertext, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext || extra)
    throw new GoogleMailError("The Google Mail connection expired.", 400);
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(`premium-remodel:google-mail:${purpose}:v1`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new GoogleMailError("The Google Mail connection expired.", 400);
  }
}

function redirectUri(request: Request) {
  return `${appOrigin(request)}/api/google-mail/callback`;
}

const stateSchema = z.object({
  state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  profileId: z.uuid(),
  organizationId: z.uuid(),
  expiresAt: z.number().int().positive(),
});

export function googleMailAuthorization(request: Request, user: WorkspaceUser) {
  if (user.role !== "admin")
    throw new HttpError(403, "Only administrators can connect company email.");
  const { clientId } = requiredConfig();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const cookie = seal(
    JSON.stringify({
      state,
      verifier,
      profileId: user.id,
      organizationId: user.organizationId,
      expiresAt: Date.now() + 10 * 60_000,
    }),
    "state",
  );
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: `openid email ${googleMailScope}`,
    access_type: "offline",
    prompt: "consent select_account",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    login_hint: googleMailAddress,
  }).toString();
  return { url: url.toString(), cookie };
}

async function json(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function connection(organizationId: string): Promise<Connection | null> {
  const { data, error } = await supabaseAdmin()
    .from("remodel_google_mail_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return data as Connection | null;
}

export async function googleMailStatus(user: WorkspaceUser) {
  const current = await connection(user.organizationId);
  return {
    configured: googleMailConfigured(),
    connected: Boolean(current),
    email: current?.google_email || null,
    connectedAt: current?.connected_at || null,
    canManage: user.role === "admin",
  };
}

export async function connectGoogleMail(
  request: Request,
  user: WorkspaceUser,
  code: string,
  state: string,
  stateCookie: string,
  fetcher: Fetcher = fetch,
) {
  if (user.role !== "admin")
    throw new HttpError(403, "Only administrators can connect company email.");
  const saved = stateSchema.parse(JSON.parse(unseal(stateCookie, "state")));
  if (
    saved.state !== state ||
    saved.profileId !== user.id ||
    saved.organizationId !== user.organizationId ||
    saved.expiresAt < Date.now()
  )
    throw new GoogleMailError("The Google Mail connection expired.", 400);
  const { clientId, clientSecret } = requiredConfig();
  const tokenResponse = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const tokens = z
    .object({
      access_token: z.string().min(1),
      refresh_token: z.string().optional(),
      scope: z.string().optional(),
    })
    .safeParse(await json(tokenResponse));
  if (!tokenResponse.ok || !tokens.success)
    throw new GoogleMailError(
      "Google could not connect this mailbox. Try again.",
    );
  if (!tokens.data.scope?.split(" ").includes(googleMailScope))
    throw new GoogleMailError("Gmail send permission was not granted.", 403);
  const infoResponse = await fetcher(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${tokens.data.access_token}` },
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const info = z
    .object({
      sub: z.string().min(1),
      email: z.email(),
      email_verified: z.boolean().optional(),
    })
    .safeParse(await json(infoResponse));
  if (!infoResponse.ok || !info.success || info.data.email_verified === false)
    throw new GoogleMailError("Google could not verify the mailbox.");
  if (info.data.email.toLowerCase() !== googleMailAddress)
    throw new GoogleMailError(
      `Sign in as ${googleMailAddress} to connect the company mailbox.`,
      400,
    );
  const previous = await connection(user.organizationId);
  const refresh =
    tokens.data.refresh_token ||
    (previous?.google_account_id === info.data.sub
      ? unseal(previous.refresh_token_ciphertext, "refresh")
      : "");
  if (!refresh)
    throw new GoogleMailError(
      "Google did not provide offline access. Remove the app from Google account permissions and reconnect.",
    );
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin()
    .from("remodel_google_mail_connections")
    .upsert({
      organization_id: user.organizationId,
      connected_by: user.id,
      google_account_id: info.data.sub,
      google_email: googleMailAddress,
      refresh_token_ciphertext: seal(refresh, "refresh"),
      connected_at: now,
      updated_at: now,
    });
  if (error) throw error;
  await recordAuditEvent(user, {
    action: previous ? "updated" : "created",
    entityKind: "email",
    subject: "Company Gmail connection",
    afterData: { email: googleMailAddress },
  });
  return googleMailStatus(user);
}

export async function disconnectGoogleMail(user: WorkspaceUser) {
  if (user.role !== "admin")
    throw new HttpError(
      403,
      "Only administrators can disconnect company email.",
    );
  const previous = await connection(user.organizationId);
  if (!previous) return googleMailStatus(user);
  const { error } = await supabaseAdmin()
    .from("remodel_google_mail_connections")
    .delete()
    .eq("organization_id", user.organizationId);
  if (error) throw error;
  await recordAuditEvent(user, {
    action: "deleted",
    entityKind: "email",
    subject: "Company Gmail connection",
    beforeData: { email: previous.google_email },
  });
  return googleMailStatus(user);
}

export async function gmailAccessToken(
  user: WorkspaceUser,
  fetcher: Fetcher = fetch,
) {
  return gmailAccessTokenForOrganization(user.organizationId, fetcher);
}

/** Used by server-side website intake, which has no signed-in workspace user. */
export async function gmailAccessTokenForOrganization(
  organizationId: string,
  fetcher: Fetcher = fetch,
) {
  const current = await connection(organizationId);
  if (!current)
    throw new HttpError(
      409,
      "Connect the company Gmail account in Settings first.",
    );
  const { clientId, clientSecret } = requiredConfig();
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: unseal(current.refresh_token_ciphertext, "refresh"),
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const result = z
    .object({ access_token: z.string().min(1) })
    .safeParse(await json(response));
  if (!response.ok || !result.success)
    throw new GoogleMailError(
      "Google Mail needs to be reconnected in Settings before sending.",
    );
  return result.data.access_token;
}
