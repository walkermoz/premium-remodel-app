import { expect, test } from "@playwright/test";
import {
  premiumRemodelQuoteFlowDefinition,
  quoteFlowBlockContract,
  type QuoteFlowBlock,
} from "@/lib/quote-flow-schema";
import {
  missingRequiredQuoteFlowBlocks,
  quoteFlowDefinitionProgress,
  quoteFlowValueIsComplete,
} from "@/lib/quote-flow-progress";
import { premiumQuoteSigningPacket } from "@/lib/document-signing";
import {
  buildQuoteWorkflowState,
  quoteWorkflowObjectCatalog,
} from "@/lib/quote-workflow-state";
import type { Quote } from "@/lib/types";

const at = "2026-11-03T14:00:00.000Z";
const quote: Quote = {
  id: "11111111-1111-4111-8111-111111111111",
  createdAt: at,
  updatedAt: at,
  name: "Kitchen remodel",
  address: "100 Test Lane, Cary, NC 27513",
  client: "Taylor Customer",
  clientEmail: "taylor@example.com",
  clientPhone: "",
  startDate: "2026-11-10",
  endDate: "2026-12-10",
  status: "Draft",
  description: "Remodel the kitchen",
  category: "Kitchen",
  cover: "",
};

test("canonical workflow vocabulary stays organization-neutral", () => {
  expect(Object.keys(quoteWorkflowObjectCatalog)).toEqual([
    "contact",
    "quote",
    "document",
    "signature_request",
    "payment",
    "project",
  ]);
  expect(JSON.stringify(quoteWorkflowObjectCatalog)).not.toContain(
    "Premium Remodel",
  );
  expect(JSON.stringify(quoteWorkflowObjectCatalog)).not.toContain("MSA");
});

test("shared completion logic handles fields, signatures, approvals, and payments", () => {
  const block = (type: QuoteFlowBlock["type"]): QuoteFlowBlock => ({
    id: type,
    type,
    label: type,
    description: "",
    enabled: true,
    required: true,
    audience: "both",
    bindingKey: null,
    conditions: { mode: "all", rules: [] },
    config: {},
  });
  expect(quoteFlowValueIsComplete(block("custom_checkbox"), false)).toBe(false);
  expect(quoteFlowValueIsComplete(block("signature"), { signedAt: at })).toBe(
    true,
  );
  expect(
    quoteFlowValueIsComplete(block("signature"), {
      method: "authenticated_staff_assignment",
      assignedUserId: "staff-1",
    }),
  ).toBe(false);
  expect(
    quoteFlowValueIsComplete(block("deposit_collection"), { status: "paid" }),
  ).toBe(true);
  expect(
    quoteFlowValueIsComplete(block("internal_approval"), { approved: true }),
  ).toBe(true);
});

test("the block registry owns actions, validation, and every presentation mode", () => {
  const signature = premiumRemodelQuoteFlowDefinition.stages
    .flatMap((stage) => stage.blocks)
    .find((candidate) => candidate.id === "msa_signature")!;
  const contract = quoteFlowBlockContract(signature);
  expect(contract.completionRule).toBe("signature_required");
  expect(contract.actions).toEqual(
    expect.arrayContaining(["send", "sign_on_device", "mark_signed_in_person"]),
  );
  expect(contract.validation).toEqual(
    expect.arrayContaining(["required", "assigned_signer"]),
  );
  expect(Object.keys(contract.presentation)).toEqual([
    "staff",
    "portal",
    "device",
  ]);
});

test("staff and customer navigation can share one required-block resolver", () => {
  const delivery = premiumRemodelQuoteFlowDefinition.stages.find(
    (stage) => stage.id === "send_and_complete",
  );
  const deposit = premiumRemodelQuoteFlowDefinition.stages.find(
    (stage) => stage.id === "deposit",
  );
  const context = {
    bindings: {
      delivery: true,
      "quote.customer_signature": true,
      "agreement.customer_signature": false,
      "payment.deposit": false,
    },
  };
  expect(
    missingRequiredQuoteFlowBlocks(delivery, context).map((block) => block.id),
  ).toEqual(["msa_signature"]);
  expect(
    missingRequiredQuoteFlowBlocks(deposit, context).map((block) => block.id),
  ).toEqual(["deposit"]);
  const progress = quoteFlowDefinitionProgress(
    premiumRemodelQuoteFlowDefinition,
    {
      bindings: {
        "quote.contact": true,
        "quote.items": true,
        "quote.scope": true,
        "agreement.premium_msa": true,
        "agreement.payment_schedule": true,
        "agreement.terms": true,
        "agreement.staff_signature": true,
        delivery: true,
        "quote.customer_signature": true,
        "agreement.customer_signature": false,
        "payment.deposit": false,
        "project.conversion": false,
      },
    },
  );
  expect(
    progress.find((stage) => stage.stageId === "quote_and_pricing"),
  ).toMatchObject({ complete: true });
  expect(
    progress.find((stage) => stage.stageId === "send_and_complete"),
  ).toMatchObject({ complete: false });
});

test("next action is derived from independent document, delivery, payment, and project state", () => {
  const packet = premiumQuoteSigningPacket(quote);
  expect(
    buildQuoteWorkflowState({
      contactReady: true,
      deliveryReady: false,
      quoteReady: true,
      packet,
      requiresAgreement: true,
      agreementDetailsReady: false,
      agreementPrepared: false,
      requiresPayment: true,
      paymentRequiredCents: 500_000,
      paymentPaidCents: 0,
    }).nextAction.id,
  ).toBe("complete_agreement_details");
  expect(
    buildQuoteWorkflowState({
      contactReady: true,
      deliveryReady: true,
      quoteReady: true,
      packet,
      requiresAgreement: true,
      agreementDetailsReady: true,
      agreementPrepared: false,
      requiresPayment: true,
      paymentRequiredCents: 500_000,
      paymentPaidCents: 0,
    }).nextAction.id,
  ).toBe("company_approval");

  expect(
    buildQuoteWorkflowState({
      contactReady: true,
      deliveryReady: false,
      quoteReady: true,
      packet,
      requiresAgreement: true,
      agreementDetailsReady: true,
      agreementPrepared: true,
      requiresPayment: true,
      paymentRequiredCents: 500_000,
      paymentPaidCents: 0,
    }).nextAction.id,
  ).toBe("add_delivery_contact");

  const state = buildQuoteWorkflowState({
    contactReady: true,
    deliveryReady: true,
    quoteReady: true,
    packet: {
      ...packet,
      status: "completed",
      statusLabel: "Documents complete",
      statusDetail: "2 of 2 documents complete.",
      documents: packet.documents.map((document) => ({
        ...document,
        status: "completed",
      })),
    },
    requiresAgreement: true,
    agreementDetailsReady: true,
    agreementPrepared: true,
    requiresPayment: true,
    paymentRequiredCents: 500_000,
    paymentPaidCents: 500_000,
  });
  expect(state.nextAction.id).toBe("create_project");
  expect(
    state.objects.find((object) => object.kind === "payment"),
  ).toMatchObject({ status: "paid", statusLabel: "Paid" });
});
