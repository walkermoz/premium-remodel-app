import {
  apiError,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { getBusinessConfig } from "@/lib/business-config";
import {
  gmailAccessTokenForOrganization,
  googleMailAddressForOrganization,
  GoogleMailError,
} from "@/lib/google-mail";

export const runtime = "nodejs";

function header(value: string) {
  if (/[\r\n\x00-\x1f\x7f]/.test(value))
    throw new HttpError(400, "Email header contains invalid characters.");
  return value;
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.role !== "admin")
      throw new HttpError(403, "Only administrators can send a test email.");
    await limitAttempts(`onboarding-test-email:${user.authUserId}`, 5);
    const sender = await googleMailAddressForOrganization(user.organizationId);
    if (!sender)
      throw new HttpError(409, "Connect a company Gmail account first.");
    const config = await getBusinessConfig(user);
    const recipient = header(user.email);
    const subject = header(`${config.profile.name} email connection test`);
    const raw = Buffer.from(
      [
        `From: ${header(sender)}`,
        `To: ${recipient}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(
          `Your ${config.profile.name} mailbox is connected and can send email from the workspace.`,
          "utf8",
        ).toString("base64"),
        "",
      ].join("\r\n"),
      "utf8",
    ).toString("base64url");
    const token = await gmailAccessTokenForOrganization(user.organizationId);
    const response = await fetch(
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
    if (!response.ok)
      throw new HttpError(
        502,
        `Google Mail returned HTTP ${response.status}. Reconnect the mailbox and try again.`,
      );
    return Response.json(
      { sentTo: recipient },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof GoogleMailError)
      return apiError(new HttpError(error.status, error.message));
    return apiError(error);
  }
}
