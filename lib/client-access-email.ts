import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { renderPremiumEmail } from "./email-template";
import { getBusinessConfigForOrganization } from "./business-config";
import { getBusinessLogoBytes } from "./business-logo";
import {
  gmailAccessTokenForOrganization,
  googleMailAddressForOrganization,
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
  const business = (
    await getBusinessConfigForOrganization(input.organizationId)
  ).profile;
  const logo = await getBusinessLogoBytes(input.organizationId);
  const fromEmail = await googleMailAddressForOrganization(
    input.organizationId,
  );
  if (!fromEmail)
    throw new Error("Connect the company mailbox before sending email.");
  const content = renderPremiumEmail({
    preheader: `Your secure ${business.name} client portal link.`,
    title: "Open your client portal",
    message: `Use the button below to open your ${business.name} client portal and review your quote. If you did not request this link, you can ignore this email.`,
    business,
    logoSrc: logo ? "cid:premium-remodel-logo" : "",
    action: {
      label: "Open client portal",
      url: input.url,
      note: "This private link is valid for 30 days.",
    },
  });
  const related = `premium-client-${randomUUID()}`;
  const alternative = `premium-client-alt-${randomUUID()}`;
  const lines = [
    `From: =?UTF-8?B?${Buffer.from(business.name, "utf8").toString("base64")}?= <${fromEmail}>`,
    `To: ${recipient}`,
    `Subject: =?UTF-8?B?${Buffer.from(`Your ${business.name} client portal link`, "utf8").toString("base64")}?=`,
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
    ...(logo
      ? [
          `--${related}`,
          'Content-Type: image/png; name="business-logo.png"',
          "Content-Transfer-Encoding: base64",
          "Content-ID: <premium-remodel-logo>",
          'Content-Disposition: inline; filename="business-logo.png"',
          "",
          encoded(logo),
        ]
      : []),
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
  const result = await response.json().catch(() => null);
  return typeof result?.id === "string" ? (result.id as string) : "";
}
