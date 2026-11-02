import {
  agreementSigningIpHash,
  markAgreementSignerNotified,
  readAgreementSigningSession,
  signAgreementPacket,
} from "@/lib/agreement-packets";
import { apiError, limitAttempts } from "@/lib/auth";
import { sendWorkflowEmail } from "@/lib/workflows/workflow-email";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    await limitAttempts(`agreement-sign-read:${token}`, 120);
    return Response.json(await readAgreementSigningSession(token), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    await limitAttempts(`agreement-sign-write:${token}`, 12);
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const result = await signAgreementPacket(token, await request.json(), {
      ipHash: agreementSigningIpHash(ip),
      userAgent: request.headers.get("user-agent")?.slice(0, 300),
    });
    let nextSigningUrl: string | undefined;
    if (!result.completed && result.nextSigner) {
      const origin = new URL(request.url).origin;
      const signingUrl = `${origin}/agreement/${encodeURIComponent(result.nextSigner.token)}`;
      if (result.deliveryMode === "onsite") {
        nextSigningUrl = signingUrl;
      } else {
        try {
          await sendWorkflowEmail({
            organizationId: result.organizationId,
            recipient: result.nextSigner.email,
            subject: `Signature requested: ${result.agreementName}`,
            body: `Hello ${result.nextSigner.name},\n\nIt is your turn to review and sign ${result.agreementName}.\n\nOpen the private signing link: ${signingUrl}\n\nThis link expires in 30 days.`,
            idempotencyKey: `agreement:${result.packetId}:signer:${result.nextSigner.id}`,
          });
          await markAgreementSignerNotified(
            result.organizationId,
            result.nextSigner.id,
          );
        } catch {
          // The next signer can still receive the private link from the sender;
          // the completed signature must never be rolled back for mail failure.
        }
      }
    }
    return Response.json({
      completed: result.completed,
      alreadySigned: "alreadySigned" in result && result.alreadySigned,
      nextSigningUrl,
    });
  } catch (error) {
    return apiError(error);
  }
}
