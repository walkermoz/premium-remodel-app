import { z } from "zod";
import {
  apiError,
  appOrigin,
  checkOrigin,
  HttpError,
  limitAttempts,
} from "@/lib/auth";
import { clientQuotesForEmail } from "@/lib/client-access";
import { sendClientAccessEmail } from "@/lib/client-access-email";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const raw = await request.text();
    if (raw.length > 2_000) throw new HttpError(413, "Request is too large.");
    const input = z.object({ email: z.string() }).parse(JSON.parse(raw));
    const email = z.email().max(320).parse(input.email.trim().toLowerCase());
    const ip = (
      request.headers.get("x-vercel-forwarded-for") ||
      request.headers.get("x-forwarded-for") ||
      "unknown"
    )
      .split(",")[0]
      .trim()
      .slice(0, 80);
    await limitAttempts(`client-access-ip:${ip}`, 10);
    await limitAttempts(`client-access-email:${email}`, 3);
    const organizationId = process.env.SUPABASE_ORGANIZATION_ID;
    if (!organizationId)
      throw new HttpError(503, "Client portal sign-in is unavailable.");
    const matches = await clientQuotesForEmail(
      organizationId,
      email,
      appOrigin(request),
    );
    if (matches.length) {
      try {
        await sendClientAccessEmail({
          organizationId,
          email,
          url: matches[0].url,
        });
      } catch {
        // The response must not reveal whether this email has a client portal.
        console.error("Client access email delivery failed.");
      }
    }
    return Response.json(
      { sent: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
