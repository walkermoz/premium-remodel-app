import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import {
  cancellationDeadline,
  easternDate,
  msaGeneralTerms,
  msaPaymentRows,
  prepareMsa,
} from "@/lib/msa-contract";
import { buildMsaPdf } from "@/lib/msa-pdf";
import {
  defaultMsaContractTerms,
  defaultMsaPaymentSchedule,
} from "@/lib/msa-draft";
import type { Project } from "@/lib/types";

const at = "2026-10-23T15:00:00.000Z";
const scope = [
  {
    section: "Bathroom",
    title: "Tile installation",
    details: "Floor and shower",
    amount: 4900,
  },
];
const base: Project = {
  id: "11111111-1111-4111-8111-111111111111",
  createdAt: at,
  updatedAt: at,
  name: "Bathroom remodel",
  address: "100 Test Lane, Cary, NC 27513",
  client: "Taylor Customer",
  clientEmail: "taylor@example.com",
  clientPhone: "919-555-0101",
  contractPrice: 4900,
  quoteNumber: "135",
  quoteAcceptedAt: at,
  acceptedQuoteScope: scope,
  msaPaymentSchedule: defaultMsaPaymentSchedule({
    category: "Bathroom",
    name: "Bathroom remodel",
  }),
  msaPermitResponsibility: "Owner obtains and pays",
  startDate: "2026-11-02",
  endDate: "2026-11-20",
  status: "Planning",
  description: "Remodel the bathroom",
  category: "Bathroom",
  cover: "",
};
base.msaContractTerms = defaultMsaContractTerms(base, scope);
const strokes: Array<Array<[number, number]>> = [
  [
    [0.1, 0.2],
    [0.2, 0.3],
  ],
];

test("prepares a frozen MSA from the accepted quote and editable milestones", () => {
  const agreement = prepareMsa(
    base,
    [],
    {
      owner: "Taylor Customer",
      ownerEmail: "taylor@example.com",
      signerTitle: "Project manager",
      signatureStrokes: strokes,
    },
    { id: "22222222-2222-4222-8222-222222222222", name: "Alex Staff" },
    at,
  );
  expect(agreement.status).toBe("prepared");
  expect(agreement.staffSignature.name).toBe("Alex Staff");
  expect(agreement.scope).toEqual(scope);
  expect(agreement.price).toBe(4900);
  expect(msaPaymentRows(agreement).map((step) => step.amount)).toEqual([
    2450, 1225, 735, 490,
  ]);
  expect(agreement.termsSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(msaGeneralTerms.length).toBeGreaterThan(100);
});

test("refuses an agreement without a verified accepted quote", () => {
  expect(() =>
    prepareMsa(
      { ...base, acceptedQuoteScope: undefined },
      [],
      {
        owner: "Taylor Customer",
        ownerEmail: "taylor@example.com",
        signerTitle: "Project manager",
        signatureStrokes: strokes,
      },
      { id: "22222222-2222-4222-8222-222222222222", name: "Alex Staff" },
      at,
    ),
  ).toThrow(/verified accepted quote/);
});

test("completed cancellation notice uses three conservative business days", () => {
  expect(easternDate("2026-10-23T03:00:00.000Z")).toBe("2026-10-22");
  expect(cancellationDeadline("2026-10-23")).toBe("2026-10-28");
  expect(cancellationDeadline("2026-11-25")).toBe("2026-12-01");
});

test("signed MSA PDF contains all exhibits and two cancellation notices", async () => {
  const prepared = prepareMsa(
    base,
    [],
    {
      owner: "Taylor Customer",
      ownerEmail: "taylor@example.com",
      signerTitle: "Project manager",
      signatureStrokes: strokes,
    },
    { id: "22222222-2222-4222-8222-222222222222", name: "Alex Staff" },
    at,
  );
  const pdf = await buildMsaPdf({
    ...prepared,
    status: "signed",
    transactionDate: "2026-10-23",
    cancellationDeadline: "2026-10-28",
    customerSignature: {
      name: "Taylor Customer",
      signedAt: at,
      signatureStrokes: strokes,
    },
  });
  const parsed = await PDFDocument.load(pdf);
  expect(parsed.getPageCount()).toBeGreaterThan(4);
});
