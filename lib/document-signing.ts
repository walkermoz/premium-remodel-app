import type { Quote, User } from "./types";

export type DocumentSigningStatus =
  | "draft"
  | "ready"
  | "sent"
  | "viewed"
  | "awaiting_signatures"
  | "partially_signed"
  | "completed"
  | "declined"
  | "void"
  | "expired";

export type DocumentSignerStatus =
  "pending" | "ready" | "notified" | "viewed" | "signed" | "declined";

export type DocumentDeliveryChannel = "email" | "portal" | "on_device";
export type DocumentDeliveryStatus =
  | "not_sent"
  | "ready"
  | "sent"
  | "delivered"
  | "available"
  | "opened"
  | "active"
  | "failed"
  | "revoked"
  | "expired";

export type DocumentDataBindingView = {
  key: string;
  label: string;
  source: "Contact" | "Quote" | "Organization" | "Staff" | "Payment" | "Manual";
  value: string;
  missing: boolean;
};

export interface DocumentSignerView {
  roleId: string;
  label: string;
  partyType: "customer" | "staff" | "other";
  order: number;
  required: boolean;
  name: string;
  email?: string;
  status: DocumentSignerStatus;
  signedAt?: string;
  method?: "remote_portal" | "on_device" | "in_person" | "recorded_by_staff";
}

export interface DocumentDeliveryView {
  channel: DocumentDeliveryChannel;
  status: DocumentDeliveryStatus;
  label: string;
  detail?: string;
  occurredAt?: string;
}

export interface SigningDocumentView {
  id: string;
  kind: "quote" | "agreement" | "other";
  eyebrow: string;
  title: string;
  versionLabel: string;
  status: DocumentSigningStatus;
  statusLabel: string;
  statusDetail: string;
  signers: DocumentSignerView[];
  delivery: DocumentDeliveryView[];
  dataBindings?: DocumentDataBindingView[];
  viewHref?: string;
}

export interface DocumentSigningPacketView {
  id: string;
  status: DocumentSigningStatus;
  statusLabel: string;
  statusDetail: string;
  documents: SigningDocumentView[];
  delivery: DocumentDeliveryView[];
}

export interface SigningDataSnapshot {
  schemaVersion: 1;
  organization: { name: string };
  contact: {
    id: string | null;
    name: string;
    email: string;
    phone: string;
    address: string;
  };
  quote: Quote;
  project: Quote;
  staff: {
    current: Pick<User, "id" | "name" | "email" | "role" | "group">;
  };
  custom: Record<string, unknown>;
  payment: { schedule: Quote["msaPaymentSchedule"] };
}

const documentStatusLabels: Record<DocumentSigningStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  sent: "Sent",
  viewed: "Viewed",
  awaiting_signatures: "Awaiting signatures",
  partially_signed: "Partially signed",
  completed: "Complete",
  declined: "Declined",
  void: "Voided",
  expired: "Expired",
};

export function documentSigningStatusLabel(status: DocumentSigningStatus) {
  return documentStatusLabels[status];
}

export function summarizeSignerProgress(document: SigningDocumentView) {
  const required = document.signers.filter((signer) => signer.required);
  const signed = required.filter((signer) => signer.status === "signed");
  if (!required.length) return "No signatures required";
  return `${signed.length} of ${required.length} required signed`;
}

export function summarizeDelivery(delivery: DocumentDeliveryView[]) {
  const active = delivery.filter(
    (item) => !["revoked", "expired", "failed"].includes(item.status),
  );
  if (!active.length) return "Not sent";
  return active.map((item) => item.label).join(" · ");
}

export function resolveSigningDataBinding(
  snapshot: SigningDataSnapshot,
  key: string,
) {
  return key.split(".").reduce<unknown>((value, segment) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[segment];
  }, snapshot);
}

function dataBinding(
  key: string,
  label: string,
  source: DocumentDataBindingView["source"],
  value: unknown,
): DocumentDataBindingView {
  const normalized =
    typeof value === "number"
      ? value.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })
      : String(value || "").trim();
  return { key, label, source, value: normalized, missing: !normalized };
}

function packetStatus(documents: SigningDocumentView[]): DocumentSigningStatus {
  if (documents.some((item) => item.status === "declined")) return "declined";
  if (documents.some((item) => item.status === "expired")) return "expired";
  if (documents.length && documents.every((item) => item.status === "void"))
    return "void";
  if (
    documents.length &&
    documents.every((item) => item.status === "completed")
  )
    return "completed";
  if (
    documents.some((item) =>
      ["completed", "partially_signed"].includes(item.status),
    )
  )
    return "partially_signed";
  if (documents.some((item) => item.status === "awaiting_signatures"))
    return "awaiting_signatures";
  if (documents.some((item) => item.status === "viewed")) return "viewed";
  if (documents.some((item) => item.status === "sent")) return "sent";
  if (documents.some((item) => item.status === "ready")) return "ready";
  return "draft";
}

function uniqueDelivery(documents: SigningDocumentView[]) {
  const byChannel = new Map<DocumentDeliveryChannel, DocumentDeliveryView>();
  documents.forEach((document) =>
    document.delivery.forEach((item) => {
      if (!byChannel.has(item.channel)) byChannel.set(item.channel, item);
    }),
  );
  return [...byChannel.values()];
}

export function premiumQuoteSigningPacket(
  quote: Quote,
  context?: { organizationName?: string; currentUser?: Pick<User, "name"> },
): DocumentSigningPacketView {
  const quoteSigned =
    quote.status === "Accepted" && Boolean(quote.quoteAcceptance);
  const quoteShared = Boolean(quote.quoteSentAt || quote.quoteOnsiteAt);
  const quoteDelivery: DocumentDeliveryView[] = [];
  if (quote.quoteSentAt) {
    quoteDelivery.push(
      {
        channel: "email",
        status: "sent",
        label: "Email sent",
        detail: quote.clientEmail || undefined,
        occurredAt: quote.quoteSentAt,
      },
      {
        channel: "portal",
        status: "available",
        label: "Available in customer portal",
        detail: quote.clientEmail || undefined,
        occurredAt: quote.quoteSentAt,
      },
    );
  }
  if (quote.quoteOnsiteAt)
    quoteDelivery.push({
      channel: "on_device",
      status: "opened",
      label: "Opened on this device",
      occurredAt: quote.quoteOnsiteAt,
    });

  const quoteDocument: SigningDocumentView = {
    id: `${quote.id}:quote`,
    kind: "quote",
    eyebrow: "Quote document",
    title: quote.quoteNumber ? `Quote #${quote.quoteNumber}` : "Quote",
    versionLabel: quote.revisedDate
      ? `Revised ${quote.revisedDate}`
      : "Current revision",
    status: quoteSigned
      ? "completed"
      : quoteShared
        ? "awaiting_signatures"
        : "ready",
    statusLabel: quoteSigned
      ? "Signed"
      : quoteShared
        ? "Awaiting customer signature"
        : "Ready for customer",
    statusDetail: quoteSigned
      ? `${quote.quoteAcceptance?.signedName || quote.client} signed the quote.`
      : quoteShared
        ? "The customer can review and sign this document."
        : "This document is ready to include in the customer signing session.",
    signers: [
      {
        roleId: "customer",
        label: "Customer",
        partyType: "customer",
        order: 1,
        required: true,
        name: quote.quoteAcceptance?.signedName || quote.client,
        email: quote.clientEmail,
        status: quoteSigned ? "signed" : quoteShared ? "notified" : "ready",
        signedAt: quote.quoteAcceptance?.signedAt,
        method: quoteSigned
          ? quote.quoteOnsiteAt
            ? "on_device"
            : "remote_portal"
          : undefined,
      },
    ],
    delivery: quoteDelivery,
    dataBindings: [
      dataBinding("contact.name", "Customer name", "Contact", quote.client),
      dataBinding(
        "contact.email",
        "Customer email",
        "Contact",
        quote.clientEmail,
      ),
      dataBinding("quote.address", "Project address", "Quote", quote.address),
      dataBinding(
        "quote.contractPrice",
        "Quote total",
        "Quote",
        quote.contractPrice ||
          quote.acceptedQuoteScope?.reduce(
            (total, item) => total + item.amount,
            0,
          ),
      ),
    ],
    viewHref: quoteSigned
      ? `/api/quotes/${encodeURIComponent(quote.id)}/pdf?view=1`
      : undefined,
  };

  const agreement = quote.msaAgreement;
  const agreementSigned = agreement?.status === "signed";
  const agreementPrepared = Boolean(agreement);
  const agreementSent = Boolean(
    agreement?.sentAt || agreement?.status === "sent",
  );
  const agreementDelivery: DocumentDeliveryView[] = [];
  if (agreement?.sentAt)
    agreementDelivery.push(
      {
        channel: "email",
        status: "sent",
        label: "Email sent",
        detail: agreement.ownerEmail,
        occurredAt: agreement.sentAt,
      },
      {
        channel: "portal",
        status: "available",
        label: "Available in customer portal",
        detail: agreement.ownerEmail,
        occurredAt: agreement.sentAt,
      },
    );
  else if (agreementSent)
    agreementDelivery.push({
      channel: "portal",
      status: "available",
      label: "Available in customer portal",
      detail: agreement?.ownerEmail,
    });
  if (quote.quoteOnsiteAt && agreementPrepared)
    agreementDelivery.push({
      channel: "on_device",
      status: "available",
      label: "Available on this device",
      occurredAt: quote.quoteOnsiteAt,
    });

  const agreementDocument: SigningDocumentView = {
    id: `${quote.id}:msa`,
    kind: "agreement",
    eyebrow: "Agreement document",
    title: "Master Services Agreement",
    versionLabel: agreement?.termsSha256
      ? `Snapshot ${agreement.termsSha256.slice(0, 8)}`
      : "Draft revision",
    status: agreementSigned
      ? "completed"
      : agreementPrepared
        ? "partially_signed"
        : "draft",
    statusLabel: agreementSigned
      ? "Signed"
      : agreementPrepared
        ? "Customer signature required"
        : "Company signature required",
    statusDetail: agreementSigned
      ? `${agreement.customerSignature?.name || agreement.owner} signed the agreement.`
      : agreementPrepared
        ? "The company signature is complete. The customer can now review and sign."
        : "Prepare and sign the agreement as the company representative.",
    signers: [
      {
        roleId: "staff",
        label: "Company representative",
        partyType: "staff",
        order: 1,
        required: true,
        name: agreement?.staffSignature.name || "Company representative",
        status: agreementPrepared ? "signed" : "pending",
        signedAt: agreement?.staffSignature.signedAt,
        method: agreementPrepared ? "on_device" : undefined,
      },
      {
        roleId: "customer",
        label: "Customer",
        partyType: "customer",
        order: 2,
        required: true,
        name: agreement?.customerSignature?.name || quote.client,
        email: agreement?.ownerEmail || quote.clientEmail,
        status: agreementSigned
          ? "signed"
          : agreementSent
            ? "notified"
            : agreementPrepared
              ? "ready"
              : "pending",
        signedAt: agreement?.customerSignature?.signedAt,
        method: agreementSigned
          ? quote.quoteOnsiteAt
            ? "on_device"
            : "remote_portal"
          : undefined,
      },
    ],
    delivery: agreementDelivery,
    dataBindings: [
      dataBinding(
        "contact.name",
        "Customer legal name",
        "Contact",
        agreement?.owner || quote.client,
      ),
      dataBinding(
        "contact.email",
        "Customer email",
        "Contact",
        agreement?.ownerEmail || quote.clientEmail,
      ),
      dataBinding(
        "quote.contractPrice",
        "Contract price",
        "Quote",
        agreement?.price || quote.contractPrice,
      ),
      dataBinding(
        "staff.current.name",
        "Company representative",
        "Staff",
        agreement?.staffSignature.name || context?.currentUser?.name,
      ),
      dataBinding(
        "organization.name",
        "Contracting organization",
        "Organization",
        context?.organizationName,
      ),
      dataBinding(
        "quote.startDate",
        "Estimated start",
        "Quote",
        agreement?.estimatedStart || quote.startDate,
      ),
      dataBinding(
        "quote.endDate",
        "Estimated completion",
        "Quote",
        agreement?.estimatedCompletion || quote.endDate,
      ),
      dataBinding(
        "quote.msaPermitResponsibility",
        "Permit responsibility",
        "Manual",
        agreement?.permitResponsibility || quote.msaPermitResponsibility,
      ),
    ],
    viewHref: agreementSigned
      ? `/api/msa/${encodeURIComponent(quote.id)}/pdf?view=1`
      : undefined,
  };

  const documents = [quoteDocument, agreementDocument];
  const status = packetStatus(documents);
  const completed = documents.filter(
    (document) => document.status === "completed",
  ).length;
  return {
    id: `${quote.id}:signing-packet`,
    status,
    statusLabel:
      status === "completed"
        ? "Documents complete"
        : status === "partially_signed"
          ? "Signing in progress"
          : status === "awaiting_signatures"
            ? "Awaiting customer signatures"
            : status === "viewed"
              ? "Viewed by customer"
              : status === "sent"
                ? "Sent to customer"
                : status === "declined"
                  ? "Signing declined"
                  : status === "expired"
                    ? "Signing expired"
                    : status === "void"
                      ? "Packet voided"
                      : status === "ready"
                        ? "Ready for customer"
                        : "Prepare documents",
    statusDetail: `${completed} of ${documents.length} documents complete.`,
    documents,
    delivery: uniqueDelivery(documents),
  };
}

export function buildSigningDataSnapshot(input: {
  businessName: string;
  quote: Quote;
  user: User;
  custom?: Record<string, unknown>;
}): SigningDataSnapshot {
  const { businessName, quote, user, custom = {} } = input;
  return {
    schemaVersion: 1,
    organization: { name: businessName },
    contact: {
      id: quote.contactId || null,
      name: quote.client,
      email: quote.clientEmail || "",
      phone: quote.clientPhone || "",
      address: quote.address,
    },
    quote,
    project: quote,
    staff: {
      current: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        group: user.group,
      },
    },
    custom,
    payment: { schedule: quote.msaPaymentSchedule || [] },
  };
}
