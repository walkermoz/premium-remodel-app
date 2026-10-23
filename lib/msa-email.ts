import "server-only";
import { HttpError } from "./auth";
import {
  gmailAccessTokenForOrganization,
  googleMailAddress,
} from "./google-mail";

function safeHeader(value: string) {
  if (/[\r\n\x00-\x1f\x7f]/.test(value))
    throw new HttpError(400, "Invalid email address or subject.");
  return value;
}

export async function sendMsaEmail(input: {
  organizationId: string;
  to: string;
  subject: string;
  message: string;
  pdf?: Uint8Array;
}) {
  const accessToken = await gmailAccessTokenForOrganization(
    input.organizationId,
  );
  const boundary = `premium-msa-${crypto.randomUUID()}`;
  const encoded = (value: string | Uint8Array) =>
    Buffer.from(value)
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") || "";
  const lines = [
    `From: Premium Remodel <${googleMailAddress}>`,
    `To: ${safeHeader(input.to)}`,
    `Subject: =?UTF-8?B?${Buffer.from(safeHeader(input.subject)).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encoded(input.message),
  ];
  if (input.pdf)
    lines.push(
      `--${boundary}`,
      'Content-Type: application/pdf; name="Premium-Remodel-MSA.pdf"',
      "Content-Transfer-Encoding: base64",
      'Content-Disposition: attachment; filename="Premium-Remodel-MSA.pdf"',
      "",
      encoded(input.pdf),
    );
  lines.push(`--${boundary}--`, "");
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: Buffer.from(lines.join("\r\n")).toString("base64url"),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok)
    throw new HttpError(
      502,
      response.status === 401 || response.status === 403
        ? "Gmail denied sending. Reconnect the mailbox in Settings."
        : "Gmail could not confirm delivery. Check Sent Mail before trying again.",
    );
  const result = await response.json().catch(() => null);
  return typeof result?.id === "string" ? (result.id as string) : "";
}
