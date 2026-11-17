import { expect, test } from "@playwright/test";
import {
  clientContractInvoice,
  invoiceFollowUp,
} from "@/lib/client-invoice";
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

test("invoice follow-up becomes a reminder and then overdue", () => {
  const invoice = clientContractInvoice(agreement, 0)!;
  expect(
    invoiceFollowUp(invoice, "2026-11-01T12:00:00.000Z", "2026-11-02T12:00:00.000Z"),
  ).toMatchObject({ state: "due", label: "Deposit due" });
  expect(
    invoiceFollowUp(invoice, "2026-11-01T12:00:00.000Z", "2026-11-05T12:00:00.000Z"),
  ).toMatchObject({ state: "reminder", label: "Friendly reminder" });
  expect(
    invoiceFollowUp(invoice, "2026-11-01T12:00:00.000Z", "2026-11-08T12:00:00.000Z"),
  ).toMatchObject({
    state: "overdue",
    label: "Payment follow-up needed",
  });
});

test("recorded payments stop deposit follow-up", () => {
  const depositRecorded = clientContractInvoice(agreement, 987_500)!;
  const paid = clientContractInvoice(agreement, 1_975_000)!;
  expect(invoiceFollowUp(depositRecorded, undefined)).toMatchObject({
    state: "deposit-recorded",
  });
  expect(invoiceFollowUp(paid, undefined)).toMatchObject({ state: "paid" });
});
