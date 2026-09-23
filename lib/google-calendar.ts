import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import { appOrigin, HttpError, type WorkspaceUser } from "./auth";
import {
  calendarDate,
  calendarEntries,
  calendarKey,
  type CalendarEntry,
} from "./calendar";
import { supabaseAdmin } from "./supabase/server";
import {
  emptyWorkspace,
  kindKey,
  type Entity,
  type EntityKind,
  type Workspace,
  type WorkspaceGroup,
} from "./types";
import { entryType, workTimeZone } from "./work";
import type { GoogleCalendarStatus } from "./google-calendar-types";

export const googleCalendarOAuthCookie = "premium_remodel_google_calendar";
export const googleCalendarScope =
  "https://www.googleapis.com/auth/calendar.app.created";
const googleApi = "https://www.googleapis.com/calendar/v3";
const timeoutMs = 15_000;

type Fetcher = typeof fetch;
type ConnectionRow = {
  profile_id: string;
  organization_id: string;
  google_account_id: string;
  google_email: string;
  refresh_token_ciphertext: string | null;
  calendar_id: string;
  calendar_name: string;
  connected_at: string;
  disconnected_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  updated_at: string;
};

type WorkspaceRow = {
  kind: EntityKind;
  data: Entity;
  created_by: string | null;
};

type GoogleEvent = {
  id: string;
  status?: string;
  extendedProperties?: {
    private?: Record<string, string>;
  };
};

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

function config() {
  return {
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || "",
    encryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim() || "",
  };
}

export function googleCalendarConfigured() {
  const value = config();
  if (!value.clientId || !value.clientSecret || !value.encryptionKey)
    return false;
  try {
    return tokenKey(value.encryptionKey).length === 32;
  } catch {
    return false;
  }
}

function requiredConfig() {
  const value = config();
  if (!googleCalendarConfigured())
    throw new HttpError(
      503,
      "Google Calendar is not configured for this workspace yet.",
    );
  return value;
}

function tokenKey(value = requiredConfig().encryptionKey) {
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 32)
    throw new Error("Google token encryption key must contain 32 bytes.");
  return decoded;
}

function seal(value: string, purpose: "oauth-state" | "refresh-token") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(Buffer.from(`premium-remodel:${purpose}:v1`));
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

function unseal(value: string, purpose: "oauth-state" | "refresh-token") {
  const [version, ivValue, tagValue, encryptedValue, extra] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue || extra)
    throw new GoogleCalendarError("The Google connection request expired.");
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      tokenKey(),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAAD(Buffer.from(`premium-remodel:${purpose}:v1`));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new GoogleCalendarError("The Google connection request expired.");
  }
}

function redirectUri(request: Request) {
  return `${appOrigin(request)}/api/google-calendar/callback`;
}

const oauthStateSchema = z.object({
  state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  profileId: z.uuid(),
  organizationId: z.uuid(),
  expiresAt: z.number().int().positive(),
});

export function googleAuthorizationRequest(
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
    "oauth-state",
  );
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: `openid email ${googleCalendarScope}`,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent select_account",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    login_hint: user.email,
  }).toString();
  return { url, cookie };
}

function readOAuthState(cookie: string, state: string, user: WorkspaceUser) {
  const parsed = oauthStateSchema.parse(
    JSON.parse(unseal(cookie, "oauth-state")),
  );
  if (
    parsed.state !== state ||
    parsed.profileId !== user.id ||
    parsed.organizationId !== user.organizationId ||
    parsed.expiresAt < Date.now()
  )
    throw new GoogleCalendarError("The Google connection request expired.");
  return parsed;
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

const userInfoSchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.email().max(320),
  email_verified: z.boolean().optional(),
});

async function responseJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function exchangeAuthorizationCode(
  request: Request,
  code: string,
  verifier: string,
  fetcher: Fetcher,
) {
  const { clientId, clientSecret } = requiredConfig();
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await responseJson(response);
  if (!response.ok)
    throw new GoogleCalendarError(
      "Google could not finish connecting this account. Please try again.",
    );
  return tokenSchema.parse(body);
}

async function accessTokenFromRefresh(refreshToken: string, fetcher: Fetcher) {
  const { clientId, clientSecret } = requiredConfig();
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await responseJson(response);
  if (!response.ok)
    throw new GoogleCalendarError(
      "Google access has expired. Reconnect Google Calendar.",
    );
  return tokenSchema.parse(body).access_token;
}

async function googleRequest(
  accessToken: string,
  path: string,
  init: RequestInit = {},
  fetcher: Fetcher = fetch,
) {
  const response = await fetcher(`${googleApi}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: init.signal || AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const body = await responseJson(response);
    const reason =
      typeof body?.error?.message === "string" ? body.error.message : "";
    throw new GoogleCalendarError(
      response.status === 401 || response.status === 403
        ? "Google Calendar access needs to be reconnected."
        : reason
          ? `Google Calendar could not sync: ${reason.slice(0, 240)}`
          : "Google Calendar could not sync. Please try again.",
      response.status,
    );
  }
  if (response.status === 204) return null;
  return responseJson(response);
}

async function createDedicatedCalendar(accessToken: string, fetcher: Fetcher) {
  const result = await googleRequest(
    accessToken,
    "/calendars",
    {
      method: "POST",
      body: JSON.stringify({
        summary: "Premium Remodel",
        description:
          "Project work synchronized from the Premium Remodel workspace.",
        timeZone: workTimeZone,
      }),
    },
    fetcher,
  );
  const parsed = z
    .object({ id: z.string().min(1), summary: z.string().optional() })
    .parse(result);
  return { id: parsed.id, name: parsed.summary || "Premium Remodel" };
}

async function calendarStillAvailable(
  accessToken: string,
  calendarId: string,
  fetcher: Fetcher,
) {
  try {
    const result = await googleRequest(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}`,
      {},
      fetcher,
    );
    const parsed = z
      .object({ id: z.string().min(1), summary: z.string().optional() })
      .parse(result);
    return { id: parsed.id, name: parsed.summary || "Premium Remodel" };
  } catch (error) {
    if (error instanceof GoogleCalendarError && error.status === 404)
      return null;
    throw error;
  }
}

async function connectionForUser(user: WorkspaceUser) {
  const { data, error } = await supabaseAdmin()
    .from("remodel_google_calendar_connections")
    .select("*")
    .eq("organization_id", user.organizationId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data as ConnectionRow | null;
}

export async function googleCalendarStatus(
  user: WorkspaceUser,
): Promise<GoogleCalendarStatus> {
  const configured = googleCalendarConfigured();
  const connection = await connectionForUser(user);
  return {
    configured,
    connected: configured && Boolean(connection?.refresh_token_ciphertext),
    email: connection?.google_email || null,
    calendarName: connection?.calendar_name || null,
    lastSyncedAt: connection?.last_synced_at || null,
    lastError: connection?.last_error || null,
  };
}

function nextDate(value: string) {
  const date = calendarDate(value);
  date.setDate(date.getDate() + 1);
  return calendarKey(date);
}

function timedEnd(date: string, start: string, end?: string) {
  if (end && end > start) return `${date}T${end}:00`;
  const value = new Date(`${date}T${start}:00Z`);
  value.setUTCHours(value.getUTCHours() + 1);
  return value.toISOString().slice(0, 19);
}

function googleEventBody(
  entry: CalendarEntry,
  organizationId: string,
  origin: string,
) {
  const projectName = entry.project?.name || "Premium Remodel";
  const address = entry.contact?.address || entry.project?.address || "";
  const startTime = entry.task?.startTime || entry.lead?.quoteStartTime || "";
  const endTime = entry.task?.endTime || entry.lead?.quoteEndTime || "";
  const timed = Boolean(startTime);
  const appUrl = entry.project
    ? `${origin}/?view=Projects&project=${encodeURIComponent(entry.project.id)}&tab=Upcoming`
    : `${origin}/?view=Leads`;
  return {
    summary: entry.lead
      ? entry.title
      : entry.task
        ? `${projectName} · ${entry.title}`
        : `${projectName} · ${entry.title}`,
    description: [
      "Scheduled in Premium Remodel",
      `Type: ${entryType(entry)}`,
      entry.project ? `Project: ${projectName}` : "",
      `Open in Premium Remodel: ${appUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
    location: address || undefined,
    start: timed
      ? {
          dateTime: `${entry.date}T${startTime}:00`,
          timeZone: workTimeZone,
        }
      : { date: entry.date },
    end: timed
      ? {
          dateTime: timedEnd(entry.date, startTime, endTime),
          timeZone: workTimeZone,
        }
      : { date: nextDate(entry.date) },
    visibility: "private",
    status: "confirmed",
    transparency:
      entry.kind === "start" || entry.kind === "finish"
        ? "transparent"
        : "opaque",
    extendedProperties: {
      private: {
        premiumRemodelEntryId: entry.id,
        premiumRemodelOrg: organizationId,
      },
    },
  };
}

function deterministicEventId(profileId: string, entryId: string) {
  return createHash("sha256")
    .update(`premium-remodel:${profileId}:${entryId}`)
    .digest("hex")
    .slice(0, 52);
}

async function listSyncedEvents(
  accessToken: string,
  calendarId: string,
  organizationId: string,
  fetcher: Fetcher,
) {
  const events: GoogleEvent[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      maxResults: "2500",
      showDeleted: "false",
      privateExtendedProperty: `premiumRemodelOrg=${organizationId}`,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await googleRequest(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      {},
      fetcher,
    );
    const parsed = z
      .object({
        items: z
          .array(
            z.object({
              id: z.string().min(1),
              status: z.string().optional(),
              extendedProperties: z
                .object({
                  private: z.record(z.string(), z.string()).optional(),
                })
                .optional(),
            }),
          )
          .default([]),
        nextPageToken: z.string().optional(),
      })
      .parse(result);
    events.push(...parsed.items);
    pageToken = parsed.nextPageToken || "";
  } while (pageToken);
  return events;
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  operation: (item: T) => Promise<void>,
) {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const item = items[index++];
        await operation(item);
      }
    }),
  );
}

async function syncWithAccessToken(
  connection: Pick<
    ConnectionRow,
    "organization_id" | "calendar_id" | "profile_id"
  >,
  workspace: Workspace,
  accessToken: string,
  origin: string,
  fetcher: Fetcher,
) {
  const desired = calendarEntries(workspace, "", false, false).filter(
    (entry) => entry.date,
  );
  if (desired.length > 1000)
    throw new GoogleCalendarError(
      "This workspace has too many scheduled items to sync at once.",
    );
  const existing = await listSyncedEvents(
    accessToken,
    connection.calendar_id,
    connection.organization_id,
    fetcher,
  );
  const byEntry = new Map<string, GoogleEvent>();
  const remove: GoogleEvent[] = [];
  for (const event of existing) {
    const entryId =
      event.extendedProperties?.private?.premiumRemodelEntryId || "";
    if (!entryId || byEntry.has(entryId)) remove.push(event);
    else byEntry.set(entryId, event);
  }
  const desiredIds = new Set(desired.map((entry) => entry.id));
  for (const [entryId, event] of byEntry)
    if (!desiredIds.has(entryId)) remove.push(event);

  await mapLimit(desired, 5, async (entry) => {
    const event = byEntry.get(entry.id);
    const eventBody = googleEventBody(
      entry,
      connection.organization_id,
      origin,
    );
    if (event) {
      await googleRequest(
        accessToken,
        `/calendars/${encodeURIComponent(connection.calendar_id)}/events/${encodeURIComponent(event.id)}`,
        { method: "PUT", body: JSON.stringify(eventBody) },
        fetcher,
      );
      return;
    }
    const eventId = deterministicEventId(connection.profile_id, entry.id);
    try {
      await googleRequest(
        accessToken,
        `/calendars/${encodeURIComponent(connection.calendar_id)}/events`,
        {
          method: "POST",
          body: JSON.stringify({ ...eventBody, id: eventId }),
        },
        fetcher,
      );
    } catch (error) {
      if (!(error instanceof GoogleCalendarError) || error.status !== 409)
        throw error;
      try {
        await googleRequest(
          accessToken,
          `/calendars/${encodeURIComponent(connection.calendar_id)}/events/${eventId}`,
          { method: "PUT", body: JSON.stringify(eventBody) },
          fetcher,
        );
      } catch (updateError) {
        if (
          !(updateError instanceof GoogleCalendarError) ||
          ![404, 410].includes(updateError.status || 0)
        )
          throw updateError;
        await googleRequest(
          accessToken,
          `/calendars/${encodeURIComponent(connection.calendar_id)}/events`,
          { method: "POST", body: JSON.stringify(eventBody) },
          fetcher,
        );
      }
    }
  });
  await mapLimit(remove, 5, async (event) => {
    try {
      await googleRequest(
        accessToken,
        `/calendars/${encodeURIComponent(connection.calendar_id)}/events/${encodeURIComponent(event.id)}`,
        { method: "DELETE" },
        fetcher,
      );
    } catch (error) {
      if (
        !(error instanceof GoogleCalendarError) ||
        ![404, 410].includes(error.status || 0)
      )
        throw error;
    }
  });
  return desired.length;
}

function workspaceFromRows(
  rows: WorkspaceRow[],
  profileId: string,
  group: WorkspaceGroup,
) {
  const workspace = structuredClone(emptyWorkspace);
  for (const row of rows) {
    if (
      group === "doorknocker" &&
      row.kind !== "door_visit" &&
      !(
        (row.kind === "lead" || row.kind === "contact") &&
        row.created_by === profileId
      )
    )
      continue;
    const key = kindKey[row.kind];
    if (key) (workspace[key] as Entity[]).push(row.data);
  }
  return workspace;
}

async function organizationRows(organizationId: string) {
  const rows: WorkspaceRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await supabaseAdmin()
      .from("remodel_records")
      .select("kind,data,created_by")
      .eq("organization_id", organizationId)
      .range(offset, offset + 499);
    if (result.error) throw result.error;
    rows.push(...(result.data as WorkspaceRow[]));
    if (result.data.length < 500) break;
  }
  return rows;
}

async function saveSyncResult(connection: ConnectionRow, error: string | null) {
  const now = new Date().toISOString();
  const result = await supabaseAdmin()
    .from("remodel_google_calendar_connections")
    .update({
      last_synced_at: error ? connection.last_synced_at : now,
      last_error: error,
      updated_at: now,
    })
    .eq("profile_id", connection.profile_id)
    .eq("organization_id", connection.organization_id);
  if (result.error) throw result.error;
}

async function syncConnection(
  connection: ConnectionRow,
  workspace: Workspace,
  origin: string,
  fetcher: Fetcher = fetch,
) {
  if (!connection.refresh_token_ciphertext)
    throw new GoogleCalendarError("Reconnect Google Calendar.");
  const refreshToken = unseal(
    connection.refresh_token_ciphertext,
    "refresh-token",
  );
  const accessToken = await accessTokenFromRefresh(refreshToken, fetcher);
  const count = await syncWithAccessToken(
    connection,
    workspace,
    accessToken,
    origin,
    fetcher,
  );
  await saveSyncResult(connection, null);
  return count;
}

export async function connectGoogleCalendar(
  request: Request,
  user: WorkspaceUser,
  code: string,
  state: string,
  stateCookie: string,
  fetcher: Fetcher = fetch,
) {
  const oauthState = readOAuthState(stateCookie, state, user);
  const tokens = await exchangeAuthorizationCode(
    request,
    code,
    oauthState.verifier,
    fetcher,
  );
  const infoResponse = await fetcher(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const info = userInfoSchema.parse(await responseJson(infoResponse));
  if (!infoResponse.ok || info.email_verified === false)
    throw new GoogleCalendarError(
      "Google did not return a verified email address.",
    );
  const existing = await connectionForUser(user);
  const refreshToken = tokens.refresh_token
    ? tokens.refresh_token
    : existing?.google_account_id === info.sub &&
        existing.refresh_token_ciphertext
      ? unseal(existing.refresh_token_ciphertext, "refresh-token")
      : "";
  if (!refreshToken)
    throw new GoogleCalendarError(
      "Google did not provide offline access. Remove Premium Remodel from your Google account permissions, then connect again.",
    );
  const calendar =
    existing?.google_account_id === info.sub && existing.calendar_id
      ? (await calendarStillAvailable(
          tokens.access_token,
          existing.calendar_id,
          fetcher,
        )) || (await createDedicatedCalendar(tokens.access_token, fetcher))
      : await createDedicatedCalendar(tokens.access_token, fetcher);
  const now = new Date().toISOString();
  const result = await supabaseAdmin()
    .from("remodel_google_calendar_connections")
    .upsert({
      profile_id: user.id,
      organization_id: user.organizationId,
      google_account_id: info.sub,
      google_email: info.email.toLowerCase(),
      refresh_token_ciphertext: seal(refreshToken, "refresh-token"),
      calendar_id: calendar.id,
      calendar_name: calendar.name,
      connected_at: now,
      disconnected_at: null,
      last_error: null,
      updated_at: now,
    });
  if (result.error) throw result.error;
  const connection = (await connectionForUser(user))!;
  const rows = await organizationRows(user.organizationId);
  const workspace = workspaceFromRows(rows, user.id, user.group);
  try {
    await syncWithAccessToken(
      connection,
      workspace,
      tokens.access_token,
      appOrigin(request),
      fetcher,
    );
    await saveSyncResult(connection, null);
  } catch (error) {
    const message =
      error instanceof GoogleCalendarError
        ? error.message
        : "The account connected, but the first calendar sync failed.";
    await saveSyncResult(connection, message);
  }
  await recordCalendarAudit(user, existing ? "updated" : "created", {
    email: info.email.toLowerCase(),
    calendar: calendar.name,
  });
  return googleCalendarStatus(user);
}

export async function syncUserGoogleCalendar(
  request: Request,
  user: WorkspaceUser,
  fetcher: Fetcher = fetch,
) {
  requiredConfig();
  const connection = await connectionForUser(user);
  if (!connection?.refresh_token_ciphertext)
    throw new HttpError(409, "Connect Google Calendar before syncing.");
  const rows = await organizationRows(user.organizationId);
  const workspace = workspaceFromRows(rows, user.id, user.group);
  try {
    const count = await syncConnection(
      connection,
      workspace,
      appOrigin(request),
      fetcher,
    );
    await recordCalendarAudit(user, "updated", {
      email: connection.google_email,
      syncedItems: count,
    });
    return { count, ...(await googleCalendarStatus(user)) };
  } catch (error) {
    const message =
      error instanceof GoogleCalendarError
        ? error.message
        : "Google Calendar could not sync. Please try again.";
    await saveSyncResult(connection, message);
    throw new GoogleCalendarError(message);
  }
}

export async function syncOrganizationGoogleCalendars(
  organizationId: string,
  origin: string,
  fetcher: Fetcher = fetch,
) {
  if (!googleCalendarConfigured()) return;
  const db = supabaseAdmin();
  const [connectionsResult, profilesResult, rows] = await Promise.all([
    db
      .from("remodel_google_calendar_connections")
      .select("*")
      .eq("organization_id", organizationId)
      .not("refresh_token_ciphertext", "is", null),
    db
      .from("profiles")
      .select("id,role,active")
      .eq("organization_id", organizationId)
      .eq("active", true),
    organizationRows(organizationId),
  ]);
  if (connectionsResult.error) throw connectionsResult.error;
  if (profilesResult.error) throw profilesResult.error;
  const groups = new Map(
    profilesResult.data.map((profile) => [
      profile.id,
      profile.role as WorkspaceGroup,
    ]),
  );
  for (const raw of connectionsResult.data as ConnectionRow[]) {
    const group = groups.get(raw.profile_id);
    if (!group) continue;
    try {
      await syncConnection(
        raw,
        workspaceFromRows(rows, raw.profile_id, group),
        origin,
        fetcher,
      );
    } catch (error) {
      await saveSyncResult(
        raw,
        error instanceof GoogleCalendarError
          ? error.message
          : "Automatic Google Calendar sync failed.",
      );
    }
  }
}

export async function disconnectGoogleCalendar(
  user: WorkspaceUser,
  fetcher: Fetcher = fetch,
) {
  const connection = await connectionForUser(user);
  if (!connection?.refresh_token_ciphertext) return googleCalendarStatus(user);
  let refreshToken = "";
  try {
    refreshToken = unseal(connection.refresh_token_ciphertext, "refresh-token");
  } catch {
    // The local connection must still be removable if server keys changed.
  }
  const now = new Date().toISOString();
  const result = await supabaseAdmin()
    .from("remodel_google_calendar_connections")
    .update({
      refresh_token_ciphertext: null,
      disconnected_at: now,
      last_error: null,
      updated_at: now,
    })
    .eq("organization_id", user.organizationId)
    .eq("profile_id", user.id);
  if (result.error) throw result.error;
  if (refreshToken)
    try {
      await fetcher("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // Local access is removed even if Google's revocation endpoint is down.
    }
  await recordCalendarAudit(user, "deleted", {
    email: connection.google_email,
    calendar: connection.calendar_name,
  });
  return googleCalendarStatus(user);
}

async function recordCalendarAudit(
  user: WorkspaceUser,
  action: "created" | "updated" | "deleted",
  details: Record<string, unknown>,
) {
  const result = await supabaseAdmin()
    .from("remodel_audit_events")
    .insert({
      organization_id: user.organizationId,
      actor_id: user.id,
      actor_name: user.name,
      actor_email: user.email,
      action,
      entity_kind: "calendar",
      entity_id: user.id,
      project_id: null,
      subject: "Google Calendar",
      before_data: action === "deleted" ? details : null,
      after_data: action === "deleted" ? null : details,
    });
  if (result.error) throw result.error;
}
