import { expect, test } from "@playwright/test";
import { clientContractInvoice } from "@/lib/client-invoice";
import type { MsaAgreement } from "@/lib/types";

const agreement = {
  status: "signed",
  price: 19_750,
  paymentSchedule: [
    { id: "deposit", milestone: "Deposit", percent: 50 },
    { id: "checkpoint-1", milestone: "Checkpoint 1", percent: 50 },
  ],
} as MsaAgreement;

test("a signed contract creates an invoice from the agreement amount", () => {
  expect(clientContractInvoice(agreement, 0)).toEqual({
    totalCents: 1_975_000,
    paidCents: 0,
    balanceCents: 1_975_000,
    depositCents: 987_500,
    depositDueCents: 987_500,
    status: "open",
  });
});

test("payments reduce the invoice and deposit balances", () => {
  expect(clientContractInvoice(agreement, 987_500)).toMatchObject({
    paidCents: 987_500,
    balanceCents: 987_500,
    depositDueCents: 0,
    status: "open",
  });
  expect(clientContractInvoice(agreement, 1_975_000)).toMatchObject({
    balanceCents: 0,
    depositDueCents: 0,
    status: "paid",
  });
});

test("an unsigned agreement does not create an invoice", () => {
  expect(clientContractInvoice({ ...agreement, status: "sent" }, 0)).toBeNull();
});
