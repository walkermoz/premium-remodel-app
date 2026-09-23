import { apiError, HttpError, limitAttempts, requireUser } from "@/lib/auth";
import {
  readTwilioConnection,
  TwilioConnectionError,
} from "@/lib/twilio-client";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  let response: Response;
  try {
    const user = await requireUser();
    if (user.role !== "admin")
      throw new HttpError(
        403,
        "Only administrators can view the Twilio connection.",
      );
    await limitAttempts(`twilio-config:${user.id}`, 60);
    response = Response.json(
      await readTwilioConnection({
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
      }),
    );
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
