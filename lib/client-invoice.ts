import { msaPaymentRows } from "./msa-contract";
import type { MsaAgreement } from "./types";

export type ClientContractInvoice = {
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  depositCents: number;
  depositDueCents: number;
  status: "open" | "paid";
  title: string;
  customerNote: string;
  depositDueDate: string;
};

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
  const signingDate =
    agreement.transactionDate ||
    agreement.customerSignature?.signedAt?.slice(0, 10) ||
    "";
  const due = signingDate ? new Date(`${signingDate}T12:00:00Z`) : null;
  if (due)
    due.setUTCDate(
      due.getUTCDate() + (agreement.invoiceDefaults?.dueDays || 0),
    );
  return {
    title: agreement.invoiceDefaults?.title || "Contract invoice",
    customerNote: agreement.invoiceDefaults?.customerNote || "",
    depositDueDate:
      due && !isNaN(due.getTime()) ? due.toISOString().slice(0, 10) : "",
    totalCents,
    paidCents,
    balanceCents,
    depositCents,
    depositDueCents: Math.max(0, depositCents - paidCents),
    status: balanceCents === 0 ? "paid" : "open",
  };
}
