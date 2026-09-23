import assert from "node:assert/strict";
import {
  readTwilioConnection,
  TwilioConnectionError,
} from "../lib/twilio-client";

const sid = `AC${"a".repeat(32)}`;
const token = "b".repeat(32);
const credentials = { accountSid: sid, authToken: token };
const account = {
  sid,
  friendly_name: "Test company",
  status: "active",
  type: "Full",
  auth_token: token,
};
const numbers = {
  incoming_phone_numbers: [
    {
      sid: `PN${"c".repeat(32)}`,
      account_sid: sid,
      phone_number: "+19195550123",
      friendly_name: "Office",
      capabilities: { voice: true, sms: true, mms: false },
      sms_url: "private-routing-details",
    },
  ],
  next_page_uri: "https://untrusted.example/should-never-follow",
};
let calls = 0;
const fetcher: typeof fetch = async (url, options) => {
  assert.equal(options?.method, "GET");
  assert.equal(options?.cache, "no-store");
  assert.equal(options?.redirect, "error");
  assert.ok(options?.signal);
  assert.equal(
    new Headers(options?.headers).get("Authorization"),
    `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
  );
  assert.equal(
    url,
    `https://api.twilio.com/2010-04-01/Accounts/${sid}${calls === 0 ? ".json" : "/IncomingPhoneNumbers.json?PageSize=50"}`,
  );
  return Response.json(calls++ === 0 ? account : numbers);
};
const connected = await readTwilioConnection(credentials, fetcher);
assert.equal(calls, 2);
assert.equal(connected.account?.status, "active");
assert.equal(connected.hasMoreNumbers, true);
assert.equal(connected.numbers[0].sms, true);
assert.equal(connected.numbers[0].mms, false);
for (const secret of [
  token,
  "auth_token",
  "private-routing-details",
  "untrusted.example",
  "Authorization",
])
  assert.ok(!JSON.stringify(connected).includes(secret));
assert.equal(
  (
    await readTwilioConnection({}, async () => {
      throw new Error("Unexpected network request");
    })
  ).configured,
  false,
);
await assert.rejects(
  readTwilioConnection({ accountSid: "../bad", authToken: token }, fetcher),
  TwilioConnectionError,
);
for (const status of [401, 403, 429, 500]) {
  await assert.rejects(
    readTwilioConnection(
      credentials,
      async () => new Response(token, { status }),
    ),
    (error) =>
      error instanceof TwilioConnectionError && !error.message.includes(token),
  );
}
await assert.rejects(
  readTwilioConnection(credentials, async () => {
    throw new Error(token);
  }),
  /could not be reached/,
);
await assert.rejects(
  readTwilioConnection(credentials, async () => new Response("not JSON")),
  /unexpected response/,
);
await assert.rejects(
  readTwilioConnection(credentials, async () =>
    Response.json({ ...account, sid: `AC${"d".repeat(32)}` }),
  ),
  /unexpected account/,
);
await assert.rejects(
  readTwilioConnection(credentials, async (url) =>
    Response.json(
      String(url).endsWith(`${sid}.json`)
        ? account
        : {
            incoming_phone_numbers: [
              {
                ...numbers.incoming_phone_numbers[0],
                account_sid: "foreign-account",
              },
            ],
            next_page_uri: null,
          },
    ),
  ),
  /unexpected phone details/,
);
const empty = await readTwilioConnection(credentials, async (url) =>
  Response.json(
    String(url).endsWith(`${sid}.json`)
      ? { ...account, status: "suspended", type: "Trial" }
      : { incoming_phone_numbers: [], next_page_uri: null },
  ),
);
assert.equal(empty.account?.status, "suspended");
assert.equal(empty.account?.type, "Trial");
assert.equal(empty.numbers.length, 0);
console.log(
  "Twilio client checks passed: read-only requests, sanitization, malformed responses, rejection, outage, and empty accounts.",
);
