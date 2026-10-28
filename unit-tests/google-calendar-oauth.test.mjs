import assert from "node:assert/strict";
import { test } from "node:test";
import {
  connectGoogleCalendar,
  googleAuthorizationRequest,
  googleCalendarConfigured,
  googleCalendarUsesMailCallback,
  matchesGoogleCalendarOAuthState,
} from "../lib/google-calendar.ts";

const keys = [
  "APP_URL",
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "GOOGLE_GMAIL_CLIENT_ID",
  "GOOGLE_GMAIL_CLIENT_SECRET",
  "GOOGLE_TOKEN_ENCRYPTION_KEY",
];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const request = new Request(
  "https://app.example.test/api/google-calendar/connect",
);
const user = {
  id: "743895c2-96a5-4713-a092-5ade32dca3b5",
  organizationId: "4e4abc20-d785-48a3-b586-1b854d77a495",
  email: "member@example.test",
};

test("Google Calendar uses the existing mail OAuth client without mixing organization state", async () => {
  try {
    process.env.APP_URL = "https://app.example.test";
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64url",
    );
    process.env.GOOGLE_GMAIL_CLIENT_ID = "mail-client";
    process.env.GOOGLE_GMAIL_CLIENT_SECRET = "mail-secret";
    delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

    assert.equal(googleCalendarConfigured(), true);
    assert.equal(googleCalendarUsesMailCallback(), true);
    const authorization = googleAuthorizationRequest(request, user);
    const url = new URL(authorization.url);
    const state = url.searchParams.get("state");
    assert.equal(url.searchParams.get("client_id"), "mail-client");
    assert.equal(
      url.searchParams.get("redirect_uri"),
      "https://app.example.test/api/google-mail/callback",
    );
    assert.match(url.searchParams.get("scope"), /calendar\.app\.created/);
    assert.equal(url.searchParams.has("include_granted_scopes"), false);
    assert.equal(
      matchesGoogleCalendarOAuthState(authorization.cookie, state),
      true,
    );
    assert.equal(
      matchesGoogleCalendarOAuthState(authorization.cookie, "wrong-state"),
      false,
    );

    let fetched = false;
    await assert.rejects(
      connectGoogleCalendar(
        request,
        { ...user, organizationId: "2ea3c282-7476-454a-857d-694f695eae43" },
        "unused-code",
        state,
        authorization.cookie,
        async () => {
          fetched = true;
          throw new Error("Google should not be called");
        },
      ),
      /connection request expired/,
    );
    assert.equal(fetched, false);

    process.env.GOOGLE_CALENDAR_CLIENT_ID = "calendar-client";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "calendar-secret";
    assert.equal(googleCalendarUsesMailCallback(), false);
    const dedicated = new URL(googleAuthorizationRequest(request, user).url);
    assert.equal(dedicated.searchParams.get("client_id"), "calendar-client");
    assert.equal(
      dedicated.searchParams.get("redirect_uri"),
      "https://app.example.test/api/google-calendar/callback",
    );
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});
