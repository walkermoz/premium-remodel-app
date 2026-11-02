import {
  apiError,
  appOrigin,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { sendQuoteEmail, sendQuoteInput } from "@/lib/quote-email";
import { GoogleMailError } from "@/lib/google-mail";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import { createQuoteFlowInstance } from "@/lib/quote-flow-instances";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Quotes");
    await limitAttempts(`quote-email:${user.id}`, 30);
    const input = sendQuoteInput.parse(await request.json());
    const { id } = await context.params;
    try {
      await createQuoteFlowInstance(user, { quoteId: id });
    } catch (flowError) {
      if (!(
        flowError instanceof HttpError &&
        flowError.status === 409 &&
        flowError.message.includes("Publish a default quote flow")
      ))
        throw flowError;
      // Organizations that have not opted into a modular default keep their
      // existing quote delivery behavior. Once a default exists, a snapshot
      // failure blocks delivery instead of silently sending an unmanaged flow.
    }
    return Response.json(
      await sendQuoteEmail(user, id, input, appOrigin(request)),
    );
  } catch (error) {
    if (error instanceof GoogleMailError)
      return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
