import "server-only";

import { randomUUID } from "node:crypto";
import { getBusinessConfigForOrganization } from "../business-config";
import { getBusinessLogoBytes } from "../business-logo";
import { recordContactCommunication } from "../contact-communications";
import { renderBusinessEmail } from "../email-template";
import { gmailAccessTokenForOrganization } from "../google-mail";
import { supabaseAdmin } from "../supabase/server";

function safeHeader(value: string) {
  if (/[\r\n\x00-\x1f\x7f]/.test(value))
    throw new Error("Email headers contain invalid characters.");
  return value;
}

function encodedSubject(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export class WorkflowEmailUncertainError extends Error {
  constructor() {
    super(
      "Email delivery could not be confirmed; it will not be resent automatically.",
    );
    this.name = "WorkflowEmailUncertainError";
  }
}

export async function sendWorkflowEmail(input: {
  organizationId: string;
  recipient: string;
  subject: string;
  body: string;
  presentation?: "plain" | "business";
  contactId?: string;
  idempotencyKey: string;
}) {
  const recipient = safeHeader(input.recipient.trim().toLocaleLowerCase());
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
    throw new Error("Choose a valid Contact email address.");
  const subject = safeHeader(input.subject.trim());
  const connection = await supabaseAdmin()
    .from("remodel_google_mail_connections")
    .select("google_email")
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (connection.error) throw connection.error;
  if (!connection.data?.google_email)
    throw new Error("Connect the company Google mailbox before sending email.");
  const sender = safeHeader(connection.data.google_email);
  let raw: string;
  if (input.presentation === "business") {
    const [config, logo] = await Promise.all([
      getBusinessConfigForOrganization(input.organizationId),
      getBusinessLogoBytes(input.organizationId),
    ]);
    const rendered = renderBusinessEmail({
      preheader: subject,
      title: subject,
      message: input.body,
      logoSrc: logo ? undefined : "",
      business: {
        name: config.profile.name,
        website: config.profile.website,
        email: config.profile.email || sender,
        phone: config.profile.phone,
      },
    });
    const related = `servicebuddy-related-${randomUUID()}`;
    const alternative = `servicebuddy-alternative-${randomUUID()}`;
    const base64 = (value: string | Uint8Array) =>
      Buffer.from(value)
        .toString("base64")
        .match(/.{1,76}/g)
        ?.join("\r\n") || "";
    raw = Buffer.from(
      [
        `From: ${safeHeader(config.profile.name)} <${sender}>`,
        `To: ${recipient}`,
        `Subject: ${encodedSubject(subject)}`,
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
        base64(rendered.text),
        `--${alternative}`,
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        base64(rendered.html),
        `--${alternative}--`,
        ...(logo
          ? [
              `--${related}`,
              'Content-Type: image/png; name="organization-logo.png"',
              "Content-Transfer-Encoding: base64",
              "Content-ID: <servicebuddy-business-logo>",
              'Content-Disposition: inline; filename="organization-logo.png"',
              "",
              base64(logo),
            ]
          : []),
        `--${related}--`,
        "",
      ].join("\r\n"),
      "utf8",
    ).toString("base64url");
  } else {
    raw = Buffer.from(
      [
        `From: ${sender}`,
        `To: ${recipient}`,
        `Subject: ${encodedSubject(subject)}`,
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(input.body, "utf8").toString("base64"),
        "",
      ].join("\r\n"),
      "utf8",
    ).toString("base64url");
  }
  const token = await gmailAccessTokenForOrganization(input.organizationId);
  let response: Response;
  try {
    response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new WorkflowEmailUncertainError();
  }
  if (!response.ok) {
    if (response.status >= 500) throw new WorkflowEmailUncertainError();
    throw new Error(`Google Mail returned HTTP ${response.status}.`);
  }
  const result = (await response.json()) as { id?: unknown };
  const messageId = typeof result.id === "string" ? result.id : undefined;
  if (input.contactId)
    await recordContactCommunication({
      organizationId: input.organizationId,
      contactId: input.contactId,
      channel: "email",
      recipient,
      sender,
      subject,
      body: input.body,
      ...(messageId ? { providerId: messageId } : {}),
      dedupeKey: messageId ? `gmail:${messageId}` : input.idempotencyKey,
      sentAt: new Date().toISOString(),
    });
  return { status: "sent" as const, messageId, sender, recipient };
}
