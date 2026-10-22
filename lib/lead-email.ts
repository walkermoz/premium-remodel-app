import "server-only";

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "./auth";
import { renderLeadAcknowledgement } from "./email-template";
import {
  gmailAccessTokenForOrganization,
  googleMailAddress,
  googleMailConfigured,
} from "./google-mail";

export type LeadEmailResult = {
  status: "sent" | "failed" | "unknown" | "not_configured" | "skipped";
  attemptedAt: string;
  googleMessageId?: string;
  detail?: string;
};

function base64Lines(bytes: Uint8Array) {
  return (
    Buffer.from(bytes)
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") || ""
  );
}

export function leadAcknowledgementRaw(
  recipientEmail: string,
  firstName: string,
  projectType: string,
  logo: Uint8Array,
) {
  if (/[\r\n\x00-\x1f\x7f]/.test(recipientEmail))
    throw new HttpError(400, "Email address contains invalid characters.");
  const relatedBoundary = `premium-remodel-related-${randomUUID()}`;
  const alternativeBoundary = `premium-remodel-alternative-${randomUUID()}`;
  const email = renderLeadAcknowledgement({ firstName, projectType });
  const lines = [
    `From: Premium Remodel <${googleMailAddress}>`,
    `To: ${recipientEmail}`,
    "Subject: We received your project request",
    "MIME-Version: 1.0",
    `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
    "",
    `--${relatedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(email.text, "utf8")),
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(email.html, "utf8")),
    `--${alternativeBoundary}--`,
    `--${relatedBoundary}`,
    'Content-Type: image/png; name="premium-remodel-logo.png"',
    "Content-Transfer-Encoding: base64",
    "Content-ID: <premium-remodel-logo>",
    'Content-Disposition: inline; filename="premium-remodel-logo.png"',
    "",
    base64Lines(logo),
    `--${relatedBoundary}--`,
    "",
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

/** Delivery failure never rejects a successfully captured website lead. */
export async function sendWebsiteLeadAcknowledgement(
  input: {
    organizationId: string;
    recipientEmail?: string;
    firstName?: string;
    projectType?: string;
  },
  fetcher: typeof fetch = fetch,
): Promise<LeadEmailResult> {
  const attemptedAt = new Date().toISOString();
  if (!input.recipientEmail)
    return { status: "skipped", attemptedAt, detail: "No email address" };
  if (!googleMailConfigured()) return { status: "not_configured", attemptedAt };

  let attemptedSend = false;
  try {
    const accessToken = await gmailAccessTokenForOrganization(
      input.organizationId,
      fetcher,
    );
    const logo = await readFile(
      path.join(process.cwd(), "public", "images", "logo.png"),
    );
    const raw = leadAcknowledgementRaw(
      input.recipientEmail,
      input.firstName || "",
      input.projectType || "",
      logo,
    );
    attemptedSend = true;
    const response = await fetcher(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok)
      return {
        status: response.status >= 500 ? "unknown" : "failed",
        attemptedAt,
        detail: `Gmail returned HTTP ${response.status}`,
      };
    const result = await response.json().catch(() => null);
    return {
      status: "sent",
      attemptedAt,
      googleMessageId: typeof result?.id === "string" ? result.id : undefined,
    };
  } catch (error) {
    if (error instanceof HttpError && error.status === 409)
      return { status: "not_configured", attemptedAt };
    return {
      status: attemptedSend ? "unknown" : "failed",
      attemptedAt,
      detail: attemptedSend
        ? "Delivery could not be confirmed"
        : "Could not prepare email",
    };
  }
}
