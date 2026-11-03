import type { DocumentSigningPacketView } from "./document-signing";

export const quoteWorkflowObjectCatalog = {
  contact: { singular: "Contact", plural: "Contacts" },
  quote: { singular: "Quote", plural: "Quotes" },
  document: { singular: "Document", plural: "Documents" },
  signature_request: {
    singular: "Signature request",
    plural: "Signature requests",
  },
  payment: { singular: "Payment", plural: "Payments" },
  project: { singular: "Project", plural: "Projects" },
} as const;

export type QuoteWorkflowObjectKind = keyof typeof quoteWorkflowObjectCatalog;
export type QuoteWorkflowObjectStatus =
  | "missing"
  | "draft"
  | "ready"
  | "accepted"
  | "declined"
  | "expired"
  | "sent"
  | "viewed"
  | "partially_signed"
  | "waiting"
  | "complete"
  | "voided"
  | "not_due"
  | "due"
  | "partially_paid"
  | "paid"
  | "failed"
  | "not_ready"
  | "created";

export type QuoteWorkflowObjectState = {
  kind: QuoteWorkflowObjectKind;
  label: string;
  status: QuoteWorkflowObjectStatus;
  statusLabel: string;
  detail: string;
};

export type QuoteWorkflowNextActionId =
  | "complete_quote"
  | "add_delivery_contact"
  | "complete_agreement_details"
  | "company_approval"
  | "share_packet"
  | "collect_signatures"
  | "collect_payment"
  | "create_project"
  | "complete";

export type QuoteWorkflowNextAction = {
  id: QuoteWorkflowNextActionId;
  eyebrow: string;
  title: string;
  detail: string;
  targetStageType:
    | "quote_builder"
    | "agreement_details"
    | "signature_collection"
    | "delivery"
    | "deposit_payment"
    | "project_conversion";
};

export type QuoteWorkflowState = {
  objects: QuoteWorkflowObjectState[];
  nextAction: QuoteWorkflowNextAction;
};

export function buildQuoteWorkflowState(input: {
  contactReady: boolean;
  deliveryReady: boolean;
  quoteReady: boolean;
  packet: DocumentSigningPacketView;
  requiresAgreement: boolean;
  agreementDetailsReady: boolean;
  agreementPrepared: boolean;
  requiresPayment: boolean;
  paymentRequiredCents: number;
  paymentPaidCents: number;
  projectCreated?: boolean;
}): QuoteWorkflowState {
  const {
    contactReady,
    deliveryReady,
    quoteReady,
    packet,
    requiresAgreement,
    agreementDetailsReady,
    agreementPrepared,
    requiresPayment,
    paymentRequiredCents,
    paymentPaidCents,
    projectCreated = false,
  } = input;
  const documentsComplete = packet.status === "completed";
  const packetShared = packet.delivery.some((item) =>
    ["sent", "delivered", "available", "opened", "active"].includes(
      item.status,
    ),
  );
  const paymentComplete =
    !requiresPayment ||
    (paymentRequiredCents > 0 && paymentPaidCents >= paymentRequiredCents);
  const paymentPartial =
    requiresPayment && paymentPaidCents > 0 && !paymentComplete;
  const projectReady = quoteReady && documentsComplete && paymentComplete;

  let nextAction: QuoteWorkflowNextAction;
  if (!quoteReady || !contactReady)
    nextAction = {
      id: "complete_quote",
      eyebrow: "Next required action",
      title: "Finish the quote",
      detail:
        "Add the customer and at least one priced item before preparing documents.",
      targetStageType: "quote_builder",
    };
  else if (requiresAgreement && !agreementDetailsReady)
    nextAction = {
      id: "complete_agreement_details",
      eyebrow: "Next required action",
      title: "Complete agreement details",
      detail:
        "Confirm dates, payment checkpoints, parties, and terms before company approval.",
      targetStageType: "agreement_details",
    };
  else if (requiresAgreement && !agreementPrepared)
    nextAction = {
      id: "company_approval",
      eyebrow: "Next required action",
      title: "Approve and sign the agreement",
      detail:
        "Review the prepared document and add the company representative’s signature.",
      targetStageType: "signature_collection",
    };
  else if (!deliveryReady)
    nextAction = {
      id: "add_delivery_contact",
      eyebrow: "Next required action",
      title: "Add an email for signing",
      detail:
        "This contact can be saved with a phone number, but an email is required to create the secure customer signing session.",
      targetStageType: "quote_builder",
    };
  else if (!documentsComplete && !packetShared)
    nextAction = {
      id: "share_packet",
      eyebrow: "Next required action",
      title: "Start customer signing",
      detail:
        "Send one customer packet by email and portal, or open the signing session on this device.",
      targetStageType: "delivery",
    };
  else if (!documentsComplete)
    nextAction = {
      id: "collect_signatures",
      eyebrow: "Waiting on customer",
      title: "Complete the remaining signatures",
      detail: `${packet.statusDetail} The customer can continue in the portal or sign on this device.`,
      targetStageType: "delivery",
    };
  else if (!paymentComplete)
    nextAction = {
      id: "collect_payment",
      eyebrow: "Next required action",
      title: paymentPartial
        ? "Collect the remaining payment"
        : "Collect the deposit",
      detail: paymentPartial
        ? "A partial payment is recorded. Collect or record the remaining amount."
        : "The documents are complete. Collect online or record a check before scheduling.",
      targetStageType: "deposit_payment",
    };
  else if (!projectCreated)
    nextAction = {
      id: "create_project",
      eyebrow: "Ready to continue",
      title: "Create the project",
      detail:
        "The quote, required documents, and payment are complete and ready for Planning.",
      targetStageType: "project_conversion",
    };
  else
    nextAction = {
      id: "complete",
      eyebrow: "Complete",
      title: "Project created",
      detail: "This quote has completed the configured workflow.",
      targetStageType: "project_conversion",
    };

  const agreementDocument = packet.documents.find(
    (document) => document.kind === "agreement",
  );
  const quoteDocument = packet.documents.find(
    (document) => document.kind === "quote",
  );
  const documentStatus: QuoteWorkflowObjectStatus = documentsComplete
    ? "complete"
    : packet.status === "void"
      ? "voided"
      : packet.status === "viewed"
        ? "viewed"
        : packet.status === "partially_signed"
          ? "partially_signed"
          : packetShared
            ? "sent"
            : agreementPrepared || !requiresAgreement
              ? "ready"
              : "draft";
  const objects: QuoteWorkflowObjectState[] = [
    {
      kind: "contact",
      label: "Contact",
      status: contactReady ? "complete" : "missing",
      statusLabel: contactReady ? "Ready" : "Needs information",
      detail: contactReady
        ? "Customer identity and contact information are available."
        : "Add a customer name and at least one contact method.",
    },
    {
      kind: "quote",
      label: "Quote",
      status:
        quoteDocument?.status === "completed"
          ? "accepted"
          : quoteReady
            ? "ready"
            : "draft",
      statusLabel:
        quoteDocument?.status === "completed"
          ? "Accepted"
          : quoteReady
            ? "Ready"
            : "Draft",
      detail:
        quoteDocument?.status === "completed"
          ? "The customer accepted and signed the quote."
          : quoteReady
            ? "Scope, items, costs, and customer price are ready."
            : "The working quote is still incomplete.",
    },
    {
      kind: "document",
      label: "Documents",
      status: documentStatus,
      statusLabel: documentsComplete
        ? "Complete"
        : packetShared
          ? "Sent"
          : agreementPrepared || !requiresAgreement
            ? "Ready"
            : "Preparing",
      detail: packet.statusDetail,
    },
    {
      kind: "signature_request",
      label: "Signature request",
      status: documentsComplete
        ? "complete"
        : packetShared
          ? "waiting"
          : "ready",
      statusLabel: documentsComplete
        ? "Signed"
        : packetShared
          ? "In progress"
          : "Not started",
      detail:
        agreementDocument?.statusDetail ||
        "Required signer progress is tracked per document.",
    },
    {
      kind: "payment",
      label: requiresPayment ? "Deposit" : "Payment",
      status: paymentComplete
        ? "paid"
        : paymentPartial
          ? "partially_paid"
          : documentsComplete
            ? "due"
            : "not_due",
      statusLabel: paymentComplete
        ? "Paid"
        : paymentPartial
          ? "Partially paid"
          : documentsComplete
            ? "Due"
            : "Not due",
      detail: requiresPayment
        ? paymentComplete
          ? "The configured deposit has been recorded."
          : "Payment becomes due after the required documents are complete."
        : "This flow does not require payment before project creation.",
    },
    {
      kind: "project",
      label: "Project",
      status: projectCreated ? "created" : projectReady ? "ready" : "not_ready",
      statusLabel: projectCreated
        ? "Created"
        : projectReady
          ? "Ready to create"
          : "Not ready",
      detail: projectReady
        ? "All configured prerequisites are complete."
        : "Complete the required quote, document, signature, and payment steps.",
    },
  ];
  return { objects, nextAction };
}
