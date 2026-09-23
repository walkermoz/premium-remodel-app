import "server-only";
import { z } from "zod";
import type { TwilioConnection } from "./twilio-types";

export class TwilioConnectionError extends Error {}

const accountSchema = z.object({
  sid: z.string().regex(/^AC[0-9a-f]{32}$/i),
  friendly_name: z.string().max(256),
  status: z.enum(["active", "suspended", "closed"]),
  type: z.enum(["Trial", "Full"]),
});
const numbersSchema = z.object({
  incoming_phone_numbers: z
    .array(
      z.object({
        sid: z.string().regex(/^PN[0-9a-f]{32}$/i),
        account_sid: z.string(),
        phone_number: z.string().regex(/^\+[1-9]\d{1,14}$/),
        friendly_name: z.string().max(256),
        capabilities: z.object({
          voice: z.boolean(),
          sms: z.boolean(),
          mms: z.boolean(),
        }),
      }),
    )
    .max(50),
  next_page_uri: z.string().nullable(),
});
const messageSchema = z.object({
  sid: z.string().regex(/^SM[0-9a-f]{32}$/i),
  status: z.string().min(1).max(40),
  from: z.string().regex(/^\+[1-9]\d{1,14}$/),
  to: z.string().regex(/^\+[1-9]\d{1,14}$/),
});
const tollFreeVerificationsSchema = z.object({
  verifications: z
    .array(
      z.object({
        status: z.enum([
          "PENDING_REVIEW",
          "IN_REVIEW",
          "TWILIO_APPROVED",
          "TWILIO_REJECTED",
        ]),
      }),
    )
    .max(20),
});

function isNanpTollFree(number: string) {
  return /^\+1(?:800|833|844|855|866|877|888)\d{7}$/.test(number);
}

async function readTollFreeVerification(
  sender: { sid: string; number: string },
  credentials: { accountSid: string; authToken: string },
  fetcher: typeof fetch,
): Promise<NonNullable<TwilioConnection["tollFreeVerification"]>> {
  const url = new URL("https://messaging.twilio.com/v1/Tollfree/Verifications");
  url.searchParams.set("TollfreePhoneNumberSid", sender.sid);
  url.searchParams.set("PageSize", "20");
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString("base64")}`,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new TwilioConnectionError(
      "Twilio verification status could not be checked. Please try again.",
    );
  }
  if (!response.ok)
    throw new TwilioConnectionError(
      "Twilio verification status could not be checked. Please try again.",
    );
  const parsed = tollFreeVerificationsSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new TwilioConnectionError(
      "Twilio returned an unexpected verification response.",
    );
  const statuses = parsed.data.verifications.map((item) => item.status);
  const status = statuses.includes("TWILIO_APPROVED")
    ? "approved"
    : statuses.includes("PENDING_REVIEW") || statuses.includes("IN_REVIEW")
      ? "pending"
      : statuses.includes("TWILIO_REJECTED")
        ? "rejected"
        : "unverified";
  return { number: sender.number, status };
}

// The raw Account resource includes auth_token. Return only the fields below.
export async function readTwilioConnection(
  credentials: { accountSid?: string; authToken?: string },
  fetcher: typeof fetch = fetch,
): Promise<TwilioConnection> {
  const accountSid = credentials.accountSid?.trim();
  const authToken = credentials.authToken?.trim();
  if (!accountSid || !authToken)
    return {
      configured: false,
      account: null,
      numbers: [],
      hasMoreNumbers: false,
      tollFreeVerification: null,
      checkedAt: null,
    };
  if (
    !/^AC[0-9a-f]{32}$/i.test(accountSid) ||
    !/^[0-9a-f]{32}$/i.test(authToken)
  )
    throw new TwilioConnectionError(
      "The saved Twilio credentials have an invalid format.",
    );
  const base = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;
  const signal = AbortSignal.timeout(12000);
  const get = async (url: string) => {
    let response: Response;
    try {
      response = await fetcher(url, {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        },
        cache: "no-store",
        redirect: "error",
        signal,
      });
    } catch {
      throw new TwilioConnectionError(
        "Twilio could not be reached. Please check again.",
      );
    }
    if (response.status === 401 || response.status === 403)
      throw new TwilioConnectionError(
        "Twilio rejected the saved credentials. Update the server credentials and check again.",
      );
    if (!response.ok)
      throw new TwilioConnectionError(
        "Twilio is temporarily unavailable. Please check again.",
      );
    try {
      return await response.json();
    } catch {
      throw new TwilioConnectionError(
        "Twilio returned an unexpected response. Please check again.",
      );
    }
  };
  const account = accountSchema.safeParse(await get(`${base}.json`));
  if (!account.success || account.data.sid !== accountSid)
    throw new TwilioConnectionError(
      "Twilio returned an unexpected account. Please check again.",
    );
  const numbers = numbersSchema.safeParse(
    await get(`${base}/IncomingPhoneNumbers.json?PageSize=50`),
  );
  if (
    !numbers.success ||
    numbers.data.incoming_phone_numbers.some(
      (n) => n.account_sid !== accountSid,
    )
  )
    throw new TwilioConnectionError(
      "Twilio returned unexpected phone details. Please check again.",
    );
  const mappedNumbers = numbers.data.incoming_phone_numbers.map((n) => ({
    sid: n.sid,
    number: n.phone_number,
    name: n.friendly_name,
    voice: n.capabilities.voice,
    sms: n.capabilities.sms,
    mms: n.capabilities.mms,
  }));
  const smsSender = mappedNumbers.find((number) => number.sms);
  const tollFreeSender =
    smsSender && isNanpTollFree(smsSender.number) ? smsSender : null;
  let tollFreeVerification: TwilioConnection["tollFreeVerification"] = null;
  if (tollFreeSender) {
    try {
      tollFreeVerification = await readTollFreeVerification(
        tollFreeSender,
        { accountSid, authToken },
        fetcher,
      );
    } catch {
      tollFreeVerification = {
        number: tollFreeSender.number,
        status: "unknown",
      };
    }
  }
  return {
    configured: true,
    account: {
      sid: account.data.sid,
      name: account.data.friendly_name,
      status: account.data.status,
      type: account.data.type,
    },
    numbers: mappedNumbers,
    hasMoreNumbers: Boolean(numbers.data.next_page_uri),
    tollFreeVerification,
    checkedAt: new Date().toISOString(),
  };
}

export async function sendTwilioSms(
  credentials: { accountSid?: string; authToken?: string },
  message: { to: string; body: string },
  fetcher: typeof fetch = fetch,
) {
  const accountSid = credentials.accountSid?.trim();
  const authToken = credentials.authToken?.trim();
  const connection = await readTwilioConnection(credentials, fetcher);
  if (!connection.configured || !accountSid || !authToken)
    throw new TwilioConnectionError("Twilio messaging is not configured.");
  if (connection.account?.status !== "active")
    throw new TwilioConnectionError("The Twilio account is not active.");
  const sender = connection.numbers.find((number) => number.sms);
  if (!sender)
    throw new TwilioConnectionError(
      "The Twilio account does not have an SMS-capable phone number.",
    );

  if (isNanpTollFree(sender.number)) {
    const verification = connection.tollFreeVerification;
    if (!verification || verification.status === "unknown")
      throw new TwilioConnectionError(
        "Twilio verification status could not be checked. Please try again.",
      );
    if (verification.status === "pending")
      throw new TwilioConnectionError(
        "Twilio has blocked this text because the toll-free number verification is still under review.",
      );
    if (verification.status === "rejected")
      throw new TwilioConnectionError(
        "Twilio has blocked texting because the toll-free number verification was rejected.",
      );
    if (verification.status === "unverified")
      throw new TwilioConnectionError(
        "Twilio has blocked texting because the toll-free number is not verified. Submit Toll-Free Verification in Twilio before sending app links.",
      );
  }

  let response: Response;
  try {
    response = await fetcher(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          To: message.to,
          From: sender.number,
          Body: message.body,
        }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(12000),
      },
    );
  } catch {
    throw new TwilioConnectionError(
      "Twilio could not be reached. Please try again.",
    );
  }
  if (!response.ok) {
    let code = 0;
    try {
      const failure = (await response.json()) as { code?: unknown };
      code = Number(failure.code);
    } catch {}
    if (code === 21608)
      throw new TwilioConnectionError(
        "This Twilio trial can only text verified recipient numbers.",
      );
    if (code === 21211)
      throw new TwilioConnectionError("Enter a valid mobile phone number.");
    throw new TwilioConnectionError(
      "Twilio could not send the message. Check the account messaging status and try again.",
    );
  }
  let parsed: z.infer<typeof messageSchema>;
  try {
    parsed = messageSchema.parse(await response.json());
  } catch {
    throw new TwilioConnectionError(
      "Twilio returned an unexpected message response.",
    );
  }
  if (parsed.to !== message.to || parsed.from !== sender.number)
    throw new TwilioConnectionError(
      "Twilio returned unexpected message details.",
    );
  return parsed;
}
