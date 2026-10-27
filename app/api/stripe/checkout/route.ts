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
import {
  stripeClient,
  stripeEnabledForOrganization,
} from "@/lib/stripe-payments";
import { getBusinessConfig } from "@/lib/business-config";
import { dollarsToCents } from "@/lib/stripe-payment-utils";
import type { Project } from "@/lib/types";
import { recordAuditEvent } from "@/lib/audit-server";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

const inputSchema = z.object({
  projectId: z.uuid(),
  amount: z.string(),
});

export async function GET() {
  try {
    const user = await requireUser();
    if (
      user.role !== "admin" ||
      !stripeEnabledForOrganization(user.organizationId) ||
      !(await getBusinessConfig(user)).features.payments ||
      (await getBusinessConfig(user)).quotePreferences.paymentProvider !==
        "stripe"
    )
      return Response.json(
        { enabled: false },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    let payoutsEnabled = false;
    try {
      payoutsEnabled =
        (await stripeClient(user.organizationId).accounts.retrieve(null))
          .payouts_enabled === true;
    } catch {
      // Never offer a live payment link when Stripe account status is unknown.
    }
    return Response.json(
      {
        enabled: payoutsEnabled,
        reason: payoutsEnabled
          ? undefined
          : "Stripe payouts are paused or unavailable. Complete the account verification task in Stripe before collecting by card.",
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
    if (user.role !== "admin")
      throw new HttpError(403, "Only administrators can create payment links.");
    const business = await getBusinessConfig(user);
    if (
      !business.features.payments ||
      business.quotePreferences.paymentProvider !== "stripe" ||
      !stripeEnabledForOrganization(user.organizationId)
    )
      throw new HttpError(503, "Stripe payments are not fully configured yet.");
    await limitAttempts(`stripe-checkout:${user.id}`, 30);
    if (
      (await stripeClient(user.organizationId).accounts.retrieve(null))
        .payouts_enabled !== true
    )
      throw new HttpError(
        503,
        "Stripe payouts are paused. Complete the account verification task in Stripe before collecting by card.",
      );

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
      source: "premium_remodel_project",
      organizationId: user.organizationId,
      projectId: project.id,
      createdById: user.id,
      createdByName: user.name,
      amountCents: String(amountCents),
    };
    const session = await stripeClient(
      user.organizationId,
    ).checkout.sessions.create({
      mode: "payment",
      allowed_payment_method_types: ["card"],
      expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      customer_email: project.clientEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: `${business.profile.name} — ${project.name.slice(0, 120)}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${origin}/payment-complete?organization=${user.organizationId}`,
      cancel_url: `${origin}/payment-complete?organization=${user.organizationId}&canceled=1`,
    });
    if (!session.url) throw new Error("Stripe did not return a payment URL.");
    try {
      await recordAuditEvent(user, {
        action: "created",
        entityKind: "stripe_checkout",
        entityId: randomUUID(),
        projectId: project.id,
        subject: `Card payment link for ${project.name}`,
        afterData: { stripeSessionId: session.id, amount: amountCents / 100 },
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
