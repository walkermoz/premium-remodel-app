import { z } from "zod";
import {
  apiError,
  appOrigin,
  checkOrigin,
  HttpError,
  limitAttempts,
} from "@/lib/auth";
import { readClientQuoteSource } from "@/lib/client-quote";
import { createCustomerQuoteFlowCheckout } from "@/lib/quote-flow-instances";

export const runtime = "nodejs";
type Context = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const { token } = await context.params;
    await limitAttempts(`client-flow-payment:${token.slice(0, 24)}`, 15);
    const source = await readClientQuoteSource(token, { recordView: false });
    if (!source) throw new HttpError(404, "Quote unavailable.");
    const input = z
      .object({
        stageId: z.string().trim().min(1).max(80),
        blockId: z.string().trim().min(1).max(80),
      })
      .parse(await request.json());
    const origin = appOrigin(request);
    const quoteUrl = `${origin}/client/${encodeURIComponent(token)}/quote`;
    return Response.json(
      await createCustomerQuoteFlowCheckout(
        source.organizationId,
        source.view.quote.id,
        {
          ...input,
          successUrl: `${quoteUrl}?payment=complete`,
          cancelUrl: `${quoteUrl}?payment=cancelled`,
        },
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
