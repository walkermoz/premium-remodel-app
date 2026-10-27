import Stripe from "stripe";
import {
  stripeClient,
  stripeEnabledForOrganization,
  stripeConnections,
} from "@/lib/stripe-payments";
import { stripePaymentId } from "@/lib/stripe-payment-utils";
import { supabaseAdmin } from "@/lib/supabase/server";
import { promotePaidQuote } from "@/lib/quote-promotion";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const connections = stripeConnections();
  if (!connections.length || !signature)
    return Response.json(
      { error: "Webhook is not configured." },
      { status: 503 },
    );

  const payload = await request.text();
  let verified: {
    event: Stripe.Event;
    organizationId: string;
    live: boolean;
  } | null = null;
  for (const connection of connections) {
    try {
      verified = {
        event: stripeClient(connection.organizationId).webhooks.constructEvent(
          payload,
          signature,
          connection.webhookSecret,
        ),
        organizationId: connection.organizationId,
        live: connection.secretKey.startsWith("sk_live_"),
      };
      break;
    } catch {
      // Try the next company's webhook secret.
    }
  }
  if (!verified) {
    return Response.json(
      { error: "Invalid Stripe signature." },
      { status: 400 },
    );
  }
  const { event } = verified;
  if (event.livemode !== verified.live)
    return Response.json(
      { error: "Payment mode did not match." },
      { status: 400 },
    );
  if (event.type === "charge.refunded")
    return recordRefund(
      event.data.object as Stripe.Charge,
      verified.organizationId,
    );
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  )
    return Response.json({ received: true });

  const session = event.data.object as Stripe.Checkout.Session;
  const meta = session.metadata;
  if (meta?.source !== "premium_remodel_project")
    return Response.json({ received: true });
  if (
    !meta.organizationId ||
    meta.organizationId !== verified.organizationId ||
    !stripeEnabledForOrganization(meta.organizationId)
  )
    return Response.json(
      { error: "Payment organization did not match." },
      { status: 400 },
    );
  if (session.payment_status !== "paid")
    return Response.json({ received: true });
  if (
    session.mode !== "payment" ||
    session.currency !== "usd" ||
    !session.amount_total ||
    session.amount_total !== Number(meta.amountCents) ||
    !meta.organizationId ||
    !meta.projectId ||
    !meta.createdById
  )
    return Response.json(
      { error: "Payment details did not match." },
      { status: 400 },
    );
  const admin = supabaseAdmin();
  const { data: project, error: projectError } = await admin
    .from("remodel_records")
    .select("kind,data")
    .eq("organization_id", meta.organizationId)
    .eq("id", meta.projectId)
    .in("kind", ["project", "quote"])
    .maybeSingle();
  if (projectError || !project)
    return Response.json({ error: "Project is unavailable." }, { status: 500 });
  if (
    project.kind === "quote" &&
    (project.data?.status !== "Accepted" ||
      project.data?.msaAgreement?.status !== "signed" ||
      !project.data?.quoteAcceptance)
  )
    return Response.json(
      { error: "Quote is not ready for payment." },
      { status: 409 },
    );

  const id = stripePaymentId(session.id);
  const now = new Date().toISOString();
  const customer =
    project.data?.client || session.customer_details?.name || "Customer";
  const data = {
    id,
    projectId: meta.projectId,
    activityType: "Payment received",
    actorId: meta.createdById,
    actorName: meta.createdByName || "Premium Remodel",
    authorId: meta.createdById,
    authorName: meta.createdByName || "Premium Remodel",
    occurredAt: now,
    createdAt: now,
    updatedAt: now,
    summary: "Card payment confirmed by Stripe",
    notes: "Paid through Stripe Checkout.",
    amount: session.amount_total / 100,
    party: customer,
    paymentMethod: "Card",
    contractorId: "",
    attachmentIds: [],
    stripeSessionId: session.id,
    stripeGrossCents: session.amount_total,
    stripeRefundedCents: 0,
    stripePaymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || "",
  };
  const { error } = await admin.from("remodel_records").insert({
    id,
    organization_id: meta.organizationId,
    created_by: meta.createdById,
    updated_by: meta.createdById,
    kind: "activity",
    project_id: meta.projectId,
    data,
    updated_at: now,
  });
  if (error && error.code !== "23505") {
    console.error("Stripe payment could not be recorded", error.code);
    return Response.json(
      { error: "Could not record payment." },
      { status: 500 },
    );
  }
  if (project.kind === "quote") {
    try {
      await promotePaidQuote(meta.organizationId, meta.projectId);
    } catch (cause) {
      console.error(
        "Paid quote could not be moved to Projects",
        cause instanceof Error ? cause.message : "PromotionError",
      );
      return Response.json(
        { error: "Payment recorded; project creation is pending." },
        { status: 500 },
      );
    }
  }
  return Response.json({ received: true });
}

async function recordRefund(charge: Stripe.Charge, organizationId: string) {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;
  if (!paymentIntentId) return Response.json({ received: true });
  const intent =
    await stripeClient(organizationId).paymentIntents.retrieve(paymentIntentId);
  const meta = intent.metadata;
  if (meta.source !== "premium_remodel_project")
    return Response.json({ received: true });
  if (
    !meta.organizationId ||
    meta.organizationId !== organizationId ||
    !stripeEnabledForOrganization(meta.organizationId)
  )
    return Response.json(
      { error: "Payment organization did not match." },
      { status: 400 },
    );
  const admin = supabaseAdmin();
  const { data: current, error: readError } = await admin
    .from("remodel_records")
    .select("id,data,updated_at")
    .eq("organization_id", meta.organizationId)
    .eq("kind", "activity")
    .eq("data->>stripePaymentIntentId", paymentIntentId)
    .maybeSingle();
  if (readError || !current)
    return Response.json(
      { error: "Payment record is unavailable." },
      { status: 500 },
    );
  const gross = Number(current.data.stripeGrossCents || meta.amountCents);
  if (
    !Number.isSafeInteger(gross) ||
    gross !== charge.amount ||
    charge.amount_refunded > gross
  )
    return Response.json(
      { error: "Refund amount did not match." },
      { status: 400 },
    );
  const refunded = Math.max(
    Number(current.data.stripeRefundedCents || 0),
    charge.amount_refunded,
  );
  if (refunded === Number(current.data.stripeRefundedCents || 0))
    return Response.json({ received: true });
  const now = new Date(
    Math.max(Date.now(), Date.parse(current.updated_at) + 1),
  ).toISOString();
  const data = {
    ...current.data,
    amount: (gross - refunded) / 100,
    stripeRefundedCents: refunded,
    summary:
      refunded === gross
        ? "Card payment fully refunded through Stripe"
        : "Card payment partially refunded through Stripe",
    notes: `Original payment $${(gross / 100).toFixed(2)}; refunded $${(refunded / 100).toFixed(2)} through Stripe.`,
    updatedAt: now,
  };
  const { data: updated, error } = await admin
    .from("remodel_records")
    .update({ data, updated_at: now })
    .eq("organization_id", meta.organizationId)
    .eq("id", current.id)
    .eq("updated_at", current.updated_at)
    .select("id");
  if (error || !updated?.length)
    return Response.json(
      { error: "Could not record refund." },
      { status: 500 },
    );
  return Response.json({ received: true });
}
