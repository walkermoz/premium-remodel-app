import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError, type WorkspaceUser } from "./auth";
import { recordAuditEvent } from "./audit-server";
import { gmailAccessToken, googleMailAddress } from "./google-mail";
import { renderQuoteEmail } from "./email-template";
import { buildQuotePdf, quotePdfFileName } from "./quote-pdf";
import { findRecord, getWorkspace, updateRecord } from "./repository";
import { supabaseAdmin } from "./supabase/server";
import type { Quote } from "./types";

export const sendQuoteInput = z.object({
  requestId: z.uuid(),
  recipientEmail: z.email().max(320),
  subject: z.string().trim().min(1).max(180),
  message: z.string().trim().min(1).max(5_000),
});

type SendInput = z.infer<typeof sendQuoteInput>;

function header(value: string) {
  if (/[\r\n\x00-\x1f\x7f]/.test(value))
    throw new HttpError(400, "Email headers contain invalid characters.");
  return value;
}

function base64Lines(bytes: Uint8Array) {
  return (
    Buffer.from(bytes)
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") || ""
  );
}

export function quoteEmailRaw(
  input: SendInput,
  pdf: Uint8Array,
  filename: string,
  logo: Uint8Array,
) {
  const boundary = `premium-remodel-${randomUUID()}`;
  const relatedBoundary = `premium-remodel-related-${randomUUID()}`;
  const alternativeBoundary = `premium-remodel-alternative-${randomUUID()}`;
  const safeFilename = header(
    filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, ""),
  );
  const safeSubject = header(input.subject);
  const safeRecipient = header(input.recipientEmail);
  const email = renderQuoteEmail({
    message: input.message,
  });
  const lines = [
    `From: Premium Remodel <${googleMailAddress}>`,
    `To: ${safeRecipient}`,
    `Subject: =?UTF-8?B?${Buffer.from(safeSubject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
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
    `--${boundary}`,
    'Content-Type: application/pdf; name="quote.pdf"',
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${safeFilename}"`,
    "",
    base64Lines(pdf),
    `--${boundary}--`,
    "",
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

async function updateSend(
  user: WorkspaceUser,
  requestId: string,
  values: Record<string, unknown>,
) {
  const { error } = await supabaseAdmin()
    .from("remodel_quote_email_sends")
    .update({ ...values, completed_at: new Date().toISOString() })
    .eq("organization_id", user.organizationId)
    .eq("request_id", requestId);
  if (error) throw error;
}

export async function sendQuoteEmail(
  user: WorkspaceUser,
  quoteId: string,
  input: SendInput,
  fetcher: typeof fetch = fetch,
) {
  if (user.group === "doorknocker")
    throw new HttpError(403, "This account cannot send quotes.");
  const quote = (await findRecord(user, quoteId, "quote")) as Quote | null;
  if (!quote) throw new HttpError(404, "Quote not found.");
  if (
    !quote.clientEmail ||
    quote.clientEmail.toLowerCase() !== input.recipientEmail.toLowerCase()
  )
    throw new HttpError(
      400,
      "Save the client's email on the quote before sending it.",
    );
  // Check the connection before reserving a send ID so a missing connection
  // never leaves an ambiguous pending delivery record.
  const accessToken = await gmailAccessToken(user, fetcher);
  const { data: existing, error: lookupError } = await supabaseAdmin()
    .from("remodel_quote_email_sends")
    .select("quote_id,recipient_email,state")
    .eq("organization_id", user.organizationId)
    .eq("request_id", input.requestId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    if (
      existing.quote_id !== quoteId ||
      existing.recipient_email.toLowerCase() !==
        input.recipientEmail.toLowerCase()
    )
      throw new HttpError(409, "This send request was already used.");
    if (existing.state === "sent") return { sent: true, alreadySent: true };
    throw new HttpError(
      409,
      existing.state === "unknown"
        ? "Delivery is uncertain. Check Gmail Sent before trying again."
        : existing.state === "sending"
          ? "This quote is already being sent. Check Gmail Sent before retrying."
          : "This attempt failed. Try again from the quote.",
    );
  }
  const { error: insertError } = await supabaseAdmin()
    .from("remodel_quote_email_sends")
    .insert({
      organization_id: user.organizationId,
      quote_id: quoteId,
      request_id: input.requestId,
      recipient_email: input.recipientEmail.toLowerCase(),
      sent_by: user.id,
      state: "sending",
    });
  if (insertError) {
    if (insertError.code === "23505")
      throw new HttpError(409, "This quote send is already in progress.");
    throw insertError;
  }
  let attempted = false;
  let accepted = false;
  try {
    const workspace = await getWorkspace(user);
    const logo = await readFile(
      path.join(process.cwd(), "public", "images", "logo.png"),
    );
    const pdf = await buildQuotePdf(quote, workspace.scope, logo);
    if (pdf.length > 20 * 1024 * 1024)
      throw new HttpError(413, "This quote PDF is too large to email.");
    const raw = quoteEmailRaw(input, pdf, quotePdfFileName(quote), logo);
    attempted = true;
    const response = await fetcher(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) {
      attempted = response.status >= 500;
      throw new HttpError(
        502,
        response.status === 401 || response.status === 403
          ? "Gmail denied sending. Reconnect the mailbox in Settings."
          : "Gmail could not send this quote. Check Gmail Sent before retrying.",
      );
    }
    accepted = true;
    const result = await response.json();
    const messageId = typeof result?.id === "string" ? result.id : null;
    let warning: string | undefined;
    try {
      await updateSend(user, input.requestId, {
        state: "sent",
        google_message_id: messageId,
        error: null,
      });
    } catch {
      warning =
        "Gmail sent the quote, but its delivery log could not be updated.";
    }
    const now = new Date().toISOString();
    try {
      await updateRecord(
        user,
        quote,
        { ...quote, status: "Sent", quoteSentAt: now },
        quote.updatedAt,
      );
    } catch {
      warning =
        "The email was sent, but the quote status could not be updated. Refresh the quote.";
    }
    try {
      await recordAuditEvent(user, {
        action: "created",
        entityKind: "email",
        entityId: quote.id,
        projectId: quote.id,
        subject: `Quote emailed to ${input.recipientEmail}`,
        afterData: {
          recipient: input.recipientEmail.toLowerCase(),
          from: googleMailAddress,
          googleMessageId: messageId,
          requestId: input.requestId,
        },
      });
    } catch {
      warning =
        warning ||
        "The email was sent, but its audit entry could not be saved.";
    }
    return { sent: true, warning };
  } catch (error) {
    if (accepted) {
      try {
        await updateSend(user, input.requestId, {
          state: "sent",
          error:
            "Google accepted the message; response processing was incomplete.",
        });
      } catch {
        // The reserved ID still blocks accidental reuse of this send attempt.
      }
      return {
        sent: true,
        warning:
          "Gmail accepted this quote, but confirmation could not be completed. Check Gmail Sent before trying again.",
      };
    }
    const message =
      error instanceof Error ? error.message : "Quote email could not be sent.";
    try {
      await updateSend(user, input.requestId, {
        state: attempted ? "unknown" : "failed",
        error: message.slice(0, 500),
      });
    } catch {
      // Preserve the original delivery error; the reserved row prevents reuse.
    }
    throw error;
  }
}
