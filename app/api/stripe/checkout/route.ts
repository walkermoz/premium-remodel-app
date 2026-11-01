import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  apiError,
  appOrigin,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { getWorkspace, findRecord } from "@/lib/repository";
import { projectFinances } from "@/lib/project-finances";
import { getBusinessConfig } from "@/lib/business-config";
import { paymentProviderAdapter } from "@/lib/payment-providers";
import { dollarsToCents } from "@/lib/stripe-payment-utils";
import type { Project } from "@/lib/types";
import { recordAuditEvent } from "@/lib/audit-server";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import {
  hasOrganizationCapability,
  requireOrganizationCapability,
} from "@/lib/organization-permissions";

export const runtime = "nodejs";

const inputSchema = z.object({
  projectId: z.uuid(),
  amount: z.string(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const canManagePayments = await hasOrganizationCapability(
      user,
      "payments.manage",
    );
    const business = await getBusinessConfig(user);
    if (
      !canManagePayments ||
      !business.features.payments ||
      business.quotePreferences.paymentProvider !== "stripe"
    )
      return Response.json(
        { enabled: false },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    const status = await paymentProviderAdapter("stripe").status(
      user.organizationId,
    );
    return Response.json(
      {
        enabled: status.ready,
        reason: status.ready ? undefined : status.detail,
      },
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
    await requireWorkspaceTabs(user, "Projects", "Quotes");
    await requireOrganizationCapability(user, "payments.manage");
    const business = await getBusinessConfig(user);
    const providerStatus = await paymentProviderAdapter("stripe").status(
      user.organizationId,
    );
    if (
      !business.features.payments ||
      business.quotePreferences.paymentProvider !== "stripe" ||
      !providerStatus.ready
    )
      throw new HttpError(503, "Stripe payments are not fully configured yet.");
    await limitAttempts(`stripe-checkout:${user.id}`, 30);

    const input = inputSchema.parse(await request.json());
    const amountCents = dollarsToCents(input.amount);
    if (!amountCents)
      throw new HttpError(
        400,
        "Enter a valid payment amount in dollars and cents.",
      );
    const project = (await findRecord(
      user,
      input.projectId,
      "project",
    )) as Project | null;
    if (!project) throw new HttpError(404, "Project not found.");
    const workspace = await getWorkspace(user);
    const finances = projectFinances(
      project,
      workspace.scope,
      workspace.activities,
    );
    if (
      finances.total <= 0 ||
      amountCents > Math.round(finances.remaining * 100)
    )
      throw new HttpError(
        400,
        "The amount cannot exceed the project's remaining balance.",
      );

    const origin = appOrigin(request);
    const metadata = {
      source: "servicebuddy_project_payment_v1",
      organizationId: user.organizationId,
      projectId: project.id,
      createdById: user.id,
      createdByName: user.name,
      amountCents: String(amountCents),
    };
    const provider = paymentProviderAdapter("stripe");
    if (!provider.createCheckout)
      throw new HttpError(503, "This payment provider cannot create checkout links.");
    const session = await provider.createCheckout({
      organizationId: user.organizationId,
      amountCents,
      currency: business.regional.currency,
      description: `${business.profile.name} — ${project.name}`,
      customerEmail: project.clientEmail || undefined,
      metadata,
      successUrl: `${origin}/payment-complete?organization=${user.organizationId}`,
      cancelUrl: `${origin}/payment-complete?organization=${user.organizationId}&canceled=1`,
    });
    try {
      await recordAuditEvent(user, {
        action: "created",
        entityKind: "stripe_checkout",
        entityId: randomUUID(),
        projectId: project.id,
        subject: `Card payment link for ${project.name}`,
        afterData: {
          provider: provider.id,
          externalSessionId: session.externalId,
          amount: amountCents / 100,
        },
      });
    } catch {
      console.error("Could not record Stripe checkout link audit event.");
    }
    return Response.json(
      { url: session.url },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
