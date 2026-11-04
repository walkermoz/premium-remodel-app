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
