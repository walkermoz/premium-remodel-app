import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import { appOrigin, HttpError, type WorkspaceUser } from "./auth";
import { recordAuditEvent } from "./audit-server";
import { supabaseAdmin } from "./supabase/server";
import type {
  GoogleBusinessLocation,
  GoogleBusinessReviewsPage,
  GoogleBusinessStatus,
} from "./google-business-types";

export const googleBusinessCookie = "servicebuddy_google_business_oauth";
export const googleBusinessScope =
  "https://www.googleapis.com/auth/business.manage";
const timeoutMs = 15_000;
const accountNamePattern = /^accounts\/[A-Za-z0-9_-]+$/;
const locationNamePattern = /^locations\/[A-Za-z0-9_-]+$/;
const stateSchema = z.object({
  state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  profileId: z.uuid(),
  organizationId: z.uuid(),
  expiresAt: z.number().int().positive(),
});

type Fetcher = typeof fetch;
type Connection = {
  organization_id: string;
  connected_by: string | null;
  google_account_id: string;
  google_email: string;
  refresh_token_ciphertext: string;
  account_name: string | null;
  location_name: string | null;
  location_title: string | null;
  connected_at: string;
};

function config() {
  return {
    clientId: process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim() || "",
    encryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim() || "",
  };
}

function encryptionKey() {
  const decoded = Buffer.from(config().encryptionKey, "base64url");
  if (decoded.length !== 32)
    throw new HttpError(503, "Google connection encryption is not configured.");
  return decoded;
}

export function googleBusinessConfigured() {
  const { clientId, clientSecret } = config();
  if (!clientId || !clientSecret) return false;
  try {
    return encryptionKey().length === 32;
  } catch {
    return false;
  }
}

function requiredConfig() {
  if (!googleBusinessConfigured())
    throw new HttpError(
      503,
      "Google Business Profile needs platform setup before it can be connected.",
    );
  return config();
}

function seal(value: string, purpose: "state" | "refresh") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`servicebuddy:google-business:${purpose}:v1`));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function unseal(value: string, purpose: "state" | "refresh") {
  const [version, iv, tag, encrypted, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted || extra)
    throw new HttpError(400, "The Google connection has expired.");
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(`servicebuddy:google-business:${purpose}:v1`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new HttpError(400, "The Google connection has expired.");
  }
}

function redirectUri(request: Request) {
  return `${appOrigin(request)}/api/google-business/callback`;
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function connection(organizationId: string): Promise<Connection | null> {
  const { data, error } = await supabaseAdmin()
    .from("remodel_google_business_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return data as Connection | null;
}

export async function googleBusinessStatus(
  organizationId: string,
  canManage: boolean,
): Promise<GoogleBusinessStatus> {
  const current = await connection(organizationId);
  return {
    configured: googleBusinessConfigured(),
    connected: Boolean(current),
    email: canManage ? current?.google_email || null : null,
    locationName: current?.location_name || null,
    locationTitle: current?.location_title || null,
    canManage,
  };
}

export function googleBusinessAuthorization(
  request: Request,
  user: WorkspaceUser,
) {
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
    scope: `openid email ${googleBusinessScope}`,
    access_type: "offline",
    prompt: "consent select_account",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return { url: url.toString(), cookie };
}

export async function connectGoogleBusiness(
  request: Request,
  user: WorkspaceUser,
  code: string,
  state: string,
  stateCookie: string,
  fetcher: Fetcher = fetch,
) {
  let decodedState: unknown;
  try {
    decodedState = JSON.parse(unseal(stateCookie, "state"));
  } catch {
    throw new HttpError(400, "The Google connection has expired. Try again.");
  }
  const saved = stateSchema.safeParse(decodedState);
  if (
    !saved.success ||
    saved.data.state !== state ||
    saved.data.profileId !== user.id ||
    saved.data.organizationId !== user.organizationId ||
    saved.data.expiresAt < Date.now()
  )
    throw new HttpError(400, "The Google connection has expired. Try again.");
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
      code_verifier: saved.data.verifier,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const token = z
    .object({
      access_token: z.string().min(1),
      refresh_token: z.string().optional(),
      scope: z.string().optional(),
    })
    .safeParse(await responseJson(tokenResponse));
  if (!tokenResponse.ok || !token.success)
    throw new HttpError(502, "Google could not connect this business profile.");
  if (!token.data.scope?.split(" ").includes(googleBusinessScope))
    throw new HttpError(403, "Google Business Profile access was not granted.");
  const infoResponse = await fetcher(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${token.data.access_token}` },
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const info = z
    .object({
      sub: z.string().min(1),
      email: z.email(),
      email_verified: z.boolean().optional(),
    })
    .safeParse(await responseJson(infoResponse));
  if (!infoResponse.ok || !info.success || info.data.email_verified === false)
    throw new HttpError(502, "Google could not verify this account.");
  const previous = await connection(user.organizationId);
  const sameAccount = previous?.google_account_id === info.data.sub;
  const refresh =
    token.data.refresh_token ||
    (sameAccount ? unseal(previous.refresh_token_ciphertext, "refresh") : "");
  if (!refresh)
    throw new HttpError(
      409,
      "Google did not provide offline access. Remove this app from your Google account permissions and reconnect.",
    );
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin()
    .from("remodel_google_business_connections")
    .upsert({
      organization_id: user.organizationId,
      connected_by: user.id,
      google_account_id: info.data.sub,
      google_email: info.data.email.toLowerCase(),
      refresh_token_ciphertext: seal(refresh, "refresh"),
      account_name: sameAccount ? previous.account_name : null,
      location_name: sameAccount ? previous.location_name : null,
      location_title: sameAccount ? previous.location_title : null,
      connected_at: now,
      updated_at: now,
    });
  if (error) throw error;
  await recordAuditEvent(user, {
    action: previous ? "updated" : "created",
    entityKind: "google_business",
    subject: "Google Business Profile connection",
    afterData: { email: info.data.email.toLowerCase() },
  });
}

async function accessToken(organizationId: string, fetcher: Fetcher) {
  const current = await connection(organizationId);
  if (!current)
    throw new HttpError(409, "Connect Google Business Profile first.");
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
    .safeParse(await responseJson(response));
  if (!response.ok || !result.success)
    throw new HttpError(
      409,
      "Google Business Profile needs to be reconnected.",
    );
  return { current, token: result.data.access_token };
}

async function googleRequest(
  url: string,
  token: string,
  fetcher: Fetcher,
  options: { method?: "GET" | "PUT"; body?: string } = {},
): Promise<unknown> {
  const response = await fetcher(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const data = await responseJson(response);
  if (response.ok) return data;
  if (response.status === 401)
    throw new HttpError(409, "Reconnect Google Business Profile in Settings.");
  if (response.status === 403)
    throw new HttpError(
      403,
      "Google denied access. Check Business Profile API approval and your access to this location.",
    );
  if (response.status === 429)
    throw new HttpError(
      429,
      "Google is rate limiting requests. Try again later.",
    );
  if (response.status === 404)
    throw new HttpError(404, "Google could not find this business location.");
  throw new HttpError(502, "Google Business Profile is unavailable right now.");
}

export async function listGoogleBusinessLocations(
  organizationId: string,
  fetcher: Fetcher = fetch,
): Promise<GoogleBusinessLocation[]> {
  const { token } = await accessToken(organizationId, fetcher);
  const accounts: string[] = [];
  let pageToken = "";
  for (let page = 0; page < 5; page++) {
    const url = new URL(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    );
    url.searchParams.set("pageSize", "20");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = z
      .object({
        accounts: z.array(z.object({ name: z.string() })).optional(),
        nextPageToken: z.string().optional(),
      })
      .parse(await googleRequest(url.toString(), token, fetcher));
    accounts.push(
      ...(result.accounts || [])
        .map((account) => account.name)
        .filter((name) => accountNamePattern.test(name)),
    );
    if (!result.nextPageToken) break;
    pageToken = result.nextPageToken;
  }
  const locations: GoogleBusinessLocation[] = [];
  for (const accountName of accounts) {
    let locationPageToken = "";
    for (let page = 0; page < 5; page++) {
      const url = new URL(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`,
      );
      url.searchParams.set("readMask", "name,title");
      url.searchParams.set("pageSize", "100");
      if (locationPageToken)
        url.searchParams.set("pageToken", locationPageToken);
      let raw: unknown;
      try {
        raw = await googleRequest(url.toString(), token, fetcher);
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) break;
        throw error;
      }
      const result = z
        .object({
          locations: z
            .array(z.object({ name: z.string(), title: z.string() }))
            .optional(),
          nextPageToken: z.string().optional(),
        })
        .parse(raw);
      locations.push(
        ...(result.locations || [])
          .filter((location) => locationNamePattern.test(location.name))
          .map((location) => ({
            accountName,
            locationName: location.name,
            title: location.title,
          })),
      );
      if (!result.nextPageToken) break;
      locationPageToken = result.nextPageToken;
    }
  }
  return locations;
}

export async function selectGoogleBusinessLocation(
  user: WorkspaceUser,
  accountName: string,
  locationName: string,
  fetcher: Fetcher = fetch,
) {
  if (
    !accountNamePattern.test(accountName) ||
    !locationNamePattern.test(locationName)
  )
    throw new HttpError(400, "Select a valid Google business location.");
  const locations = await listGoogleBusinessLocations(
    user.organizationId,
    fetcher,
  );
  const selected = locations.find(
    (location) =>
      location.accountName === accountName &&
      location.locationName === locationName,
  );
  if (!selected)
    throw new HttpError(
      403,
      "This Google account cannot manage that location.",
    );
  const previous = await connection(user.organizationId);
  const { error } = await supabaseAdmin()
    .from("remodel_google_business_connections")
    .update({
      account_name: selected.accountName,
      location_name: selected.locationName,
      location_title: selected.title,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.organizationId);
  if (error) throw error;
  await recordAuditEvent(user, {
    action: "updated",
    entityKind: "google_business",
    subject: "Google review location",
    beforeData: { location: previous?.location_title || null },
    afterData: { location: selected.title },
  });
  return selected;
}

function reviewPath(current: Connection) {
  if (
    !current.account_name ||
    !current.location_name ||
    !accountNamePattern.test(current.account_name) ||
    !locationNamePattern.test(current.location_name)
  )
    throw new HttpError(409, "Choose a Google business location first.");
  return `${current.account_name}/${current.location_name}`;
}

export async function listGoogleBusinessReviews(
  organizationId: string,
  pageToken = "",
  fetcher: Fetcher = fetch,
): Promise<GoogleBusinessReviewsPage> {
  const { current, token } = await accessToken(organizationId, fetcher);
  const url = new URL(
    `https://mybusiness.googleapis.com/v4/${reviewPath(current)}/reviews`,
  );
  url.searchParams.set("pageSize", "50");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const response = z
    .object({
      reviews: z
        .array(
          z.object({
            name: z.string(),
            reviewId: z.string(),
            reviewer: z
              .object({ displayName: z.string().optional() })
              .optional(),
            starRating: z.string().optional(),
            comment: z.string().optional(),
            createTime: z.string().optional(),
            updateTime: z.string().optional(),
            reviewReply: z
              .object({
                comment: z.string().optional(),
                updateTime: z.string().optional(),
              })
              .optional(),
            reviewReplyUrl: z.string().optional(),
          }),
        )
        .optional(),
      averageRating: z.number().optional(),
      totalReviewCount: z.number().optional(),
      nextPageToken: z.string().optional(),
    })
    .parse(await googleRequest(url.toString(), token, fetcher));
  const ratings: Record<string, number> = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
  };
  return {
    reviews: (response.reviews || [])
      .filter((review) =>
        review.name.startsWith(`${reviewPath(current)}/reviews/`),
      )
      .map((review) => ({
        id: review.reviewId,
        name: review.name,
        reviewer: review.reviewer?.displayName || "Google customer",
        rating: ratings[review.starRating || ""] || 0,
        comment: review.comment || "",
        createdAt: review.createTime || "",
        updatedAt: review.updateTime || review.createTime || "",
        reply: review.reviewReply?.comment || null,
        replyUpdatedAt: review.reviewReply?.updateTime || null,
        replyUrl: safeGoogleUrl(review.reviewReplyUrl),
      })),
    averageRating: response.averageRating ?? null,
    totalReviewCount: response.totalReviewCount || 0,
    nextPageToken: response.nextPageToken || null,
    fetchedAt: new Date().toISOString(),
  };
}

function safeGoogleUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "google.com" || url.hostname.endsWith(".google.com"))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export async function replyToGoogleBusinessReview(
  user: WorkspaceUser,
  reviewId: string,
  comment: string,
  fetcher: Fetcher = fetch,
) {
  if (!/^[A-Za-z0-9_-]{1,250}$/.test(reviewId))
    throw new HttpError(400, "Invalid review identifier.");
  const body = comment.trim();
  if (!body || Buffer.byteLength(body, "utf8") > 4096)
    throw new HttpError(400, "Write a reply of 1 to 4,096 bytes.");
  const { current, token } = await accessToken(user.organizationId, fetcher);
  const path = reviewPath(current);
  const result = z
    .object({ comment: z.string(), updateTime: z.string().optional() })
    .parse(
      await googleRequest(
        `https://mybusiness.googleapis.com/v4/${path}/reviews/${encodeURIComponent(reviewId)}/reply`,
        token,
        fetcher,
        { method: "PUT", body: JSON.stringify({ comment: body }) },
      ),
    );
  await recordAuditEvent(user, {
    action: "updated",
    entityKind: "google_review_reply",
    subject: "Google review reply",
    afterData: { reviewId, location: current.location_title },
  });
  return { comment: result.comment, updatedAt: result.updateTime || null };
}

export async function disconnectGoogleBusiness(
  user: WorkspaceUser,
  fetcher: Fetcher = fetch,
) {
  const current = await connection(user.organizationId);
  if (!current) return;
  await revokeGoogleBusinessForOrganization(user.organizationId, fetcher);
  await recordAuditEvent(user, {
    action: "deleted",
    entityKind: "google_business",
    subject: "Google Business Profile connection",
    beforeData: {
      email: current.google_email,
      location: current.location_title,
    },
  });
}

export async function revokeGoogleBusinessForOrganization(
  organizationId: string,
  fetcher: Fetcher = fetch,
) {
  const current = await connection(organizationId);
  if (!current) return;
  const token = unseal(current.refresh_token_ciphertext, "refresh");
  const response = await fetcher("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok && response.status !== 400)
    throw new HttpError(
      502,
      "Google Business Profile could not be disconnected.",
    );
  const { error } = await supabaseAdmin()
    .from("remodel_google_business_connections")
    .delete()
    .eq("organization_id", organizationId);
  if (error) throw error;
}
