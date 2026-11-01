import {
  apiError,
  appOrigin,
  checkOrigin,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import {
  createAgreementPacket,
  markAgreementSignerNotified,
} from "@/lib/agreement-packets";
import { recordAuditEvent } from "@/lib/audit-server";
import { getBusinessConfig } from "@/lib/business-config";
import { requireOrganizationCapability } from "@/lib/organization-permissions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendWorkflowEmail } from "@/lib/workflows/workflow-email";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "agreements.manage");
    const result = await supabaseAdmin()
      .from("remodel_agreement_packets")
      .select(
        "id,template_id,template_version,project_id,contact_id,status,template_snapshot,created_at,sent_at,completed_at",
      )
      .eq("organization_id", user.organizationId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (result.error) throw result.error;
    return Response.json(
      { packets: result.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "agreements.manage");
    await limitAttempts(`agreement-packet:${user.id}`, 30);
    const [packet, business] = await Promise.all([
      createAgreementPacket(user, await request.json()),
      getBusinessConfig(user),
    ]);
    const origin = appOrigin(request);
    const delivery: Array<{
      signerId: string;
      email: string;
      status: "sent" | "failed";
      detail?: string;
      signingUrl: string;
    }> = [];
    for (const signer of packet.firstSigners) {
      const signingUrl = `${origin}/agreement/${encodeURIComponent(signer.token)}`;
      try {
        await sendWorkflowEmail({
          organizationId: user.organizationId,
          recipient: signer.email,
          subject: `Signature requested: ${business.profile.name} agreement`,
          body: `Hello ${signer.name},\n\n${business.profile.name} sent you an agreement to review and sign.\n\nOpen the private signing link: ${signingUrl}\n\nThis link expires in 30 days.`,
          idempotencyKey: `agreement:${packet.id}:signer:${signer.id}`,
        });
        await markAgreementSignerNotified(user.organizationId, signer.id);
        delivery.push({
          signerId: signer.id,
          email: signer.email,
          status: "sent",
          signingUrl,
        });
      } catch (cause) {
        delivery.push({
          signerId: signer.id,
          email: signer.email,
          status: "failed",
          detail:
            cause instanceof Error ? cause.message : "Email delivery failed.",
          signingUrl,
        });
      }
    }
    await recordAuditEvent(user, {
      action: "created",
      entityKind: "agreement_packet",
      entityId: packet.id,
      subject: "Agreement packet",
      afterData: {
        status: packet.status,
        signerCount: packet.firstSigners.length,
        delivered: delivery.filter((item) => item.status === "sent").length,
      },
    });
    return Response.json({ ...packet, delivery }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
