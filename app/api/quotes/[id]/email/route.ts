import {
  apiError,
  appOrigin,
  checkOrigin,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { sendQuoteEmail, sendQuoteInput } from "@/lib/quote-email";
import { GoogleMailError } from "@/lib/google-mail";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await limitAttempts(`quote-email:${user.id}`, 30);
    const input = sendQuoteInput.parse(await request.json());
    const { id } = await context.params;
    return Response.json(
      await sendQuoteEmail(user, id, input, appOrigin(request)),
    );
  } catch (error) {
    if (error instanceof GoogleMailError)
      return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
