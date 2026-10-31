import { apiError, HttpError, limitAttempts, requireUser } from "@/lib/auth";
import {
  readSmsComplianceSummary,
  syncOrganizationSmsCompliance,
} from "@/lib/sms-compliance";
import { TwilioConnectionError } from "@/lib/twilio-client";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  let response: Response;
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    if (user.role !== "admin")
      throw new HttpError(
        403,
        "Only administrators can view phone automation.",
      );
    await limitAttempts(`sms-automation:${user.id}`, 120);
    const connection = await syncOrganizationSmsCompliance(user.organizationId);
    const summary = await readSmsComplianceSummary(user.organizationId);
    const smsNumbers = connection.numbers.filter((number) => number.sms);
    response = Response.json({
      ...summary,
      configured:
        connection.configured &&
        smsNumbers.length > 0 &&
        smsNumbers.every((number) => number.inboundSmsAutomation),
      numbers: smsNumbers.map((number) => number.number),
    });
  } catch (error) {
    response = apiError(
      error instanceof TwilioConnectionError
        ? new HttpError(503, error.message)
        : error,
    );
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
