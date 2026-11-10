import { msaPaymentRows } from "./msa-contract";
import type { MsaAgreement } from "./types";

export type ClientContractInvoice = {
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  depositCents: number;
  depositDueCents: number;
  status: "open" | "paid";
};

export type InvoiceFollowUp = {
  state: "due" | "reminder" | "overdue" | "deposit-recorded" | "paid";
  label: string;
  detail: string;
};

export function invoiceFollowUp(
  invoice: ClientContractInvoice,
  signedAt: string | undefined,
  now: string | Date = new Date(),
): InvoiceFollowUp {
  if (invoice.status === "paid")
    return {
      state: "paid",
      label: "Paid in full",
      detail: "No payment follow-up is needed.",
    };
  if (invoice.depositDueCents === 0)
    return {
      state: "deposit-recorded",
      label: "Deposit recorded",
      detail: "Future milestone payments remain visible in the balance above.",
    };
  const signed = signedAt ? Date.parse(signedAt) : Number.NaN;
  const current = new Date(now).getTime();
  const elapsedDays =
    Number.isFinite(signed) && Number.isFinite(current)
      ? Math.max(0, Math.floor((current - signed) / 86_400_000))
      : 0;
  if (elapsedDays >= 7)
    return {
      state: "overdue",
      label: "Payment follow-up needed",
      detail:
        "The deposit has been open for at least seven days. Contact the team if you need help with payment.",
    };
  if (elapsedDays >= 3)
    return {
      state: "reminder",
      label: "Friendly reminder",
      detail:
        "The deposit is still open. If payment is already on the way, no action is needed.",
    };
  return {
    state: "due",
    label: "Deposit due",
    detail:
      "Payment options are available from your signed agreement whenever you are ready.",
  };
}

export function clientContractInvoice(
  agreement: MsaAgreement | undefined,
  receivedCents: number,
): ClientContractInvoice | null {
  if (!agreement || agreement.status !== "signed") return null;
  const totalCents = Math.max(0, Math.round(agreement.price * 100));
  const paidCents = Math.max(0, Math.round(receivedCents));
  const depositCents = Math.max(
    0,
    Math.round((msaPaymentRows(agreement)[0]?.amount || 0) * 100),
  );
  const balanceCents = Math.max(0, totalCents - paidCents);
  return {
    totalCents,
    paidCents,
    balanceCents,
    depositCents,
    depositDueCents: Math.max(0, depositCents - paidCents),
    status: balanceCents === 0 ? "paid" : "open",
  };
}
