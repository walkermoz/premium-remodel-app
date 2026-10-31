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
import {
  findContactIdForRecipient,
  recordContactCommunication,
} from "@/lib/contact-communications";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const raw = await request.text();
    if (raw.length > 2_000) throw new HttpError(413, "Request is too large.");
    const input = z
      .object({ email: z.string(), organizationId: z.uuid().optional() })
      .parse(JSON.parse(raw));
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
    const organizationId =
      input.organizationId || process.env.SUPABASE_ORGANIZATION_ID;
    if (!organizationId)
      throw new HttpError(503, "Client portal sign-in is unavailable.");
    const matches = await clientQuotesForEmail(
      organizationId,
      email,
      appOrigin(request),
    );
    if (matches.length) {
      try {
        const messageId = await sendClientAccessEmail({
          organizationId,
          email,
          url: matches[0].url,
        });
        try {
          const contactId = await findContactIdForRecipient({
            organizationId,
            channel: "email",
            recipient: email,
            preferredContactId: matches[0].quote.contactId,
          });
          if (contactId)
            await recordContactCommunication({
              organizationId,
              contactId,
              channel: "email",
              recipient: email,
              subject: "Your Premium Remodel client portal link",
              body: "A secure link to the customer’s quote and client portal was sent. The private link is valid for 30 days.",
              relatedKind: "client_portal",
              relatedId: matches[0].quote.id,
              providerId: messageId || undefined,
              dedupeKey: messageId
                ? `gmail:${messageId}`
                : `client-access:${matches[0].id}:${Date.now()}`,
              sentAt: new Date().toISOString(),
            });
        } catch {
          console.error("Could not record the client access communication.");
        }
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
