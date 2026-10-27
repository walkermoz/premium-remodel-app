import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { HttpError } from "./auth";
import { isOriginalOrganization } from "./original-organization";
import { supabaseAdmin } from "./supabase/server";

type Credentials = { accountSid?: string; authToken?: string };

function encryptionKey(version: "v1" | "v2") {
  const secret = (
    version === "v2"
      ? process.env.TWILIO_TOKEN_ENCRYPTION_KEY
      : process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
  )?.trim();
  if (!secret)
    throw new HttpError(
      503,
      "Secure connection storage is not configured yet.",
    );
  const key = Buffer.from(secret, "base64url");
  if (key.length !== 32)
    throw new HttpError(
      503,
      "Secure connection storage is not configured yet.",
    );
  return createHash("sha256").update(key).update(`twilio:${version}`).digest();
}

function seal(token: string, organizationId: string) {
  const version = process.env.TWILIO_TOKEN_ENCRYPTION_KEY ? "v2" : "v1";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(version), iv);
  cipher.setAAD(Buffer.from(`twilio:${organizationId}:${version}`));
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    version,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

function unseal(value: string, organizationId: string) {
  const [version, iv, tag, body, extra] = value.split(".");
  if ((version !== "v1" && version !== "v2") || !iv || !tag || !body || extra)
    throw new HttpError(503, "The saved phone connection could not be read.");
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(version),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(`twilio:${organizationId}:${version}`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new HttpError(503, "The saved phone connection could not be read.");
  }
}

async function savedConnection(organizationId: string) {
  const { data, error } = await supabaseAdmin()
    .from("remodel_twilio_connections")
    .select("account_sid,auth_token_ciphertext")
    .eq("organization_id", organizationId)
    .maybeSingle();
  // Preview deployments can arrive before the additive production migration.
  if (error && ["42P01", "PGRST205"].includes(error.code)) return null;
  if (error) throw error;
  return data;
}

export async function hasTwilioConnection(organizationId: string) {
  if (isOriginalOrganization(organizationId))
    return Boolean(
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN,
    );
  return Boolean(await savedConnection(organizationId));
}

export async function twilioCredentialsForOrganization(
  organizationId: string,
): Promise<Credentials> {
  if (isOriginalOrganization(organizationId))
    return {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
    };
  const connection = await savedConnection(organizationId);
  return connection
    ? {
        accountSid: connection.account_sid,
        authToken: unseal(connection.auth_token_ciphertext, organizationId),
      }
    : {};
}

export async function saveTwilioConnection(
  organizationId: string,
  userId: string,
  credentials: Required<Credentials>,
) {
  const { error } = await supabaseAdmin()
    .from("remodel_twilio_connections")
    .upsert({
      organization_id: organizationId,
      account_sid: credentials.accountSid,
      auth_token_ciphertext: seal(credentials.authToken, organizationId),
      connected_by: userId,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

export async function deleteTwilioConnection(organizationId: string) {
  const { error } = await supabaseAdmin()
    .from("remodel_twilio_connections")
    .delete()
    .eq("organization_id", organizationId);
  if (error) throw error;
}
