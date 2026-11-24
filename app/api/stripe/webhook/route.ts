import Stripe from "stripe";
import {
  organizationStripeEnabled,
  stripeContextForOrganization,
  stripeClient,
  stripeConnections,
  stripeRequestOptions,
} from "@/lib/stripe-payments";
import { stripePaymentId } from "@/lib/stripe-payment-utils";
import { supabaseAdmin } from "@/lib/supabase/server";
import { promotePaidQuote } from "@/lib/quote-promotion";
import { enqueueWorkflowEvent } from "@/lib/workflows/events";
import { getBusinessConfigForOrganization } from "@/lib/business-config";
import {
  organizationIdForStripeAccount,
  stripeConnectWebhookSecret,
  stripePlatformClient,
} from "@/lib/stripe-connect";
import { quoteFlowDefinitionSchema } from "@/lib/quote-flow-schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const connections = stripeConnections();
  if ((!connections.length && !stripeConnectWebhookSecret()) || !signature)
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
  if (!verified && stripeConnectWebhookSecret()) {
    try {
      const event = stripePlatformClient().webhooks.constructEvent(
        payload,
        signature,
        stripeConnectWebhookSecret(),
      );
      const organizationId = event.account
        ? await organizationIdForStripeAccount(event.account)
        : null;
      if (organizationId)
        verified = {
          event,
          organizationId,
          live: (
            process.env.STRIPE_PLATFORM_SECRET_KEY ||
            process.env.STRIPE_SECRET_KEY ||
            ""
          ).startsWith("sk_live_"),
        };
    } catch {
      // Signature did not match the platform Connect endpoint.
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
  if (
    meta?.source !== "servicebuddy_project_payment_v1" &&
    meta?.source !== "servicebuddy_quote_flow_payment_v1" &&
    // Preserve already-issued Premium Remodel checkout sessions.
    meta?.source !== "premium_remodel_project"
  )
    return Response.json({ received: true });
  if (
    !meta.organizationId ||
    meta.organizationId !== verified.organizationId ||
    !(await organizationStripeEnabled(meta.organizationId))
  )
    return Response.json(
      { error: "Payment organization did not match." },
      { status: 400 },
    );
  if (session.payment_status !== "paid")
    return Response.json({ received: true });
  if (
    session.mode !== "payment" ||
    !session.amount_total ||
    session.amount_total !== Number(meta.amountCents) ||
    !meta.organizationId ||
    !meta.projectId ||
    (meta.source !== "servicebuddy_quote_flow_payment_v1" && !meta.createdById)
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
  const flowPayment = meta.source === "servicebuddy_quote_flow_payment_v1";
  if (
    !flowPayment &&
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
  const business = await getBusinessConfigForOrganization(meta.organizationId);
  if (session.currency !== business.regional.currency.toLowerCase())
    return Response.json(
      { error: "Payment currency did not match." },
      { status: 400 },
    );
  if (flowPayment) {
    if (!meta.flowInstanceId || !meta.flowStageId || !meta.flowBlockId)
      return Response.json(
        { error: "Payment flow details did not match." },
        { status: 400 },
      );
    const instance = await admin
      .from("remodel_quote_flow_instances")
      .select("id,quote_id,status,definition_snapshot")
      .eq("organization_id", meta.organizationId)
      .eq("id", meta.flowInstanceId)
      .eq("quote_id", meta.projectId)
      .maybeSingle();
    if (instance.error || !instance.data || instance.data.status !== "active")
      return Response.json(
        { error: "Payment flow is unavailable." },
        { status: 409 },
      );
    const definition = quoteFlowDefinitionSchema.safeParse(
      instance.data.definition_snapshot,
    );
    const paymentBlock = definition.success
      ? definition.data.stages
          .find((stage) => stage.id === meta.flowStageId && stage.enabled)
          ?.blocks.find(
            (block) =>
              block.id === meta.flowBlockId &&
              block.enabled &&
              block.type === "deposit_collection" &&
              (Array.isArray(block.config.providers)
                ? block.config.providers.map(String).includes("stripe")
                : true),
          )
      : null;
    if (!paymentBlock)
      return Response.json(
        { error: "Payment flow details did not match." },
        { status: 400 },
      );
  }
  const data = {
    id,
    projectId: meta.projectId,
    activityType: "Payment received",
    actorId: meta.createdById || "",
    actorName: meta.createdByName || business.profile.name,
    authorId: meta.createdById || "",
    authorName: meta.createdByName || business.profile.name,
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
    ...(flowPayment
      ? {
          flowInstanceId: meta.flowInstanceId,
          flowStageId: meta.flowStageId,
          flowBlockId: meta.flowBlockId,
        }
      : {}),
  };
  const { error } = await admin.from("remodel_records").insert({
    id,
    organization_id: meta.organizationId,
    created_by: meta.createdById || null,
    updated_by: meta.createdById || null,
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
  if (flowPayment) {
    const completedValue = {
      status: "paid",
      method: "stripe",
      amount: session.amount_total / 100,
      stripeSessionId: session.id,
      completedAt: now,
    };
    const completed = await admin.rpc("remodel_complete_quote_flow_block", {
      p_organization_id: meta.organizationId,
      p_instance_id: meta.flowInstanceId,
      p_stage_id: meta.flowStageId,
      p_block_id: meta.flowBlockId,
      p_value: completedValue,
      p_completed_by: null,
      p_actor_type: "system",
      p_event_type: "payment_completed",
      p_actor_name: "Stripe",
      p_evidence: completedValue,
    });
    if (completed.error)
      return Response.json(
        { error: "Payment recorded; flow completion is pending." },
        { status: 500 },
      );
  }
  try {
    const eventBase = {
      organizationId: meta.organizationId,
      ...(typeof project.data?.contactId === "string"
        ? { contactId: project.data.contactId }
        : {}),
      actor: { type: "integration" as const, id: event.id, name: "Stripe" },
      occurredAt: now,
      payload: {
        quoteId: project.kind === "quote" ? meta.projectId : null,
        projectId: project.kind === "project" ? meta.projectId : null,
        amount: session.amount_total / 100,
        paymentMethod: "Card",
        stripeSessionId: session.id,
      },
    };
    await Promise.all([
      enqueueWorkflowEvent({
        ...eventBase,
        type: "payment.deposit.received",
        objectType: "payment",
        objectId: id,
        idempotencyKey: `deposit:stripe:${session.id}`,
      }),
      enqueueWorkflowEvent({
        ...eventBase,
        type: "invoice.payment.received",
        objectType: "invoice",
        objectId: meta.projectId,
        idempotencyKey: `invoice-payment:stripe:${session.id}`,
      }),
    ]);
  } catch (workflowError) {
    console.error(
      "Could not enqueue the Stripe payment workflow events",
      workflowError instanceof Error
        ? workflowError.name
        : "WorkflowEventError",
    );
  }
  if (project.kind === "quote" && !flowPayment) {
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
  const stripeContext = await stripeContextForOrganization(organizationId);
  const intent = await stripeContext.stripe.paymentIntents.retrieve(
    paymentIntentId,
    {},
    stripeRequestOptions(stripeContext),
  );
  const meta = intent.metadata;
  if (
    meta.source !== "servicebuddy_project_payment_v1" &&
    meta.source !== "servicebuddy_quote_flow_payment_v1" &&
    meta.source !== "premium_remodel_project"
  )
    return Response.json({ received: true });
  if (
    !meta.organizationId ||
    meta.organizationId !== organizationId ||
    !(await organizationStripeEnabled(meta.organizationId))
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
  if (
    meta.source === "servicebuddy_quote_flow_payment_v1" &&
    meta.flowInstanceId &&
    meta.flowStageId &&
    meta.flowBlockId
  ) {
    const status = refunded === gross ? "refunded" : "partially_refunded";
    const flowValue = await admin
      .from("remodel_quote_flow_values")
      .update({
        value: {
          status,
          method: "stripe",
          amount: (gross - refunded) / 100,
          refundedAmount: refunded / 100,
          stripePaymentIntentId: paymentIntentId,
          updatedAt: now,
        },
        updated_at: now,
      })
      .eq("organization_id", meta.organizationId)
      .eq("instance_id", meta.flowInstanceId)
      .eq("stage_id", meta.flowStageId)
      .eq("block_id", meta.flowBlockId);
    if (flowValue.error)
      return Response.json(
        { error: "Refund recorded; flow status is pending." },
        { status: 500 },
      );
    const refundEvent = await admin.from("remodel_quote_flow_events").insert({
      organization_id: meta.organizationId,
      instance_id: meta.flowInstanceId,
      stage_id: meta.flowStageId,
      block_id: meta.flowBlockId,
      event_type: "payment_refunded",
      actor_type: "system",
      actor_name: "Stripe",
      evidence: {
        status,
        grossAmount: gross / 100,
        refundedAmount: refunded / 100,
        stripePaymentIntentId: paymentIntentId,
        recordedAt: now,
      },
    });
    if (refundEvent.error)
      return Response.json(
        { error: "Refund recorded; flow audit is pending." },
        { status: 500 },
      );
  }
  return Response.json({ received: true });
}
