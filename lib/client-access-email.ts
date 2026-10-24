import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { renderPremiumEmail } from "./email-template";
import {
  gmailAccessTokenForOrganization,
  googleMailAddress,
} from "./google-mail";

function encoded(value: string | Uint8Array) {
  return (
    Buffer.from(value)
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") || ""
  );
}

export async function sendClientAccessEmail(input: {
  organizationId: string;
  email: string;
  url: string;
}) {
  const recipient = z.email().max(320).parse(input.email);
  const accessToken = await gmailAccessTokenForOrganization(
    input.organizationId,
  );
  const logo = await readFile(
    path.join(process.cwd(), "public", "images", "logo.png"),
  );
  const content = renderPremiumEmail({
    preheader: "Your secure Premium Remodel client portal link.",
    title: "Open your client portal",
    message:
      "Use the button below to open your Premium Remodel client portal and review your quote. If you did not request this link, you can ignore this email.",
    action: {
      label: "Open client portal",
      url: input.url,
      note: "This private link is valid for 30 days.",
    },
  });
  const related = `premium-client-${randomUUID()}`;
  const alternative = `premium-client-alt-${randomUUID()}`;
  const lines = [
    `From: Premium Remodel <${googleMailAddress}>`,
    `To: ${recipient}`,
    "Subject: Your Premium Remodel client portal link",
    "MIME-Version: 1.0",
    `Content-Type: multipart/related; boundary="${related}"`,
    "",
    `--${related}`,
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    "",
    `--${alternative}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encoded(content.text),
    `--${alternative}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encoded(content.html),
    `--${alternative}--`,
    `--${related}`,
    'Content-Type: image/png; name="premium-remodel-logo.png"',
    "Content-Transfer-Encoding: base64",
    "Content-ID: <premium-remodel-logo>",
    'Content-Disposition: inline; filename="premium-remodel-logo.png"',
    "",
    encoded(logo),
    `--${related}--`,
    "",
  ];
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
  if (!response.ok) throw new Error("Client access email could not be sent.");
}
