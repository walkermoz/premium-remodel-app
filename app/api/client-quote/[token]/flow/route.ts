import { z } from "zod";
import { apiError, checkOrigin, HttpError, limitAttempts } from "@/lib/auth";
import { readClientQuoteSource } from "@/lib/client-quote";
import { agreementSigningIpHash } from "@/lib/agreement-packets";
import {
  getPublicQuoteFlowInstance,
  saveCustomerQuoteFlowValue,
} from "@/lib/quote-flow-instances";

export const runtime = "nodejs";

type Context = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { token } = await context.params;
    const source = await readClientQuoteSource(token, { recordView: false });
    if (!source) throw new HttpError(404, "Quote unavailable.");
    return Response.json(
      {
        instance: await getPublicQuoteFlowInstance(
          source.organizationId,
          source.view.quote.id,
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const { token } = await context.params;
    await limitAttempts(`client-quote-flow:${token.slice(0, 24)}`, 40);
    const source = await readClientQuoteSource(token, { recordView: false });
    if (!source) throw new HttpError(404, "Quote unavailable.");
    const input = z
      .object({
        stageId: z.string().trim().min(1).max(80),
        blockId: z.string().trim().min(1).max(80),
        value: z.unknown(),
      })
      .parse(await request.json());
    return Response.json(
      await saveCustomerQuoteFlowValue(
        source.organizationId,
        source.view.quote.id,
        input,
        {
          ipHash: agreementSigningIpHash(
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "",
          ),
          userAgent: request.headers.get("user-agent") || undefined,
        },
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
