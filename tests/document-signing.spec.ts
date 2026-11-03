import { expect, test } from "@playwright/test";
import {
  buildSigningDataSnapshot,
  premiumQuoteSigningPacket,
  resolveSigningDataBinding,
  summarizeDelivery,
} from "@/lib/document-signing";
import type { MsaAgreement, Quote, User } from "@/lib/types";

const at = "2026-10-30T14:00:00.000Z";
const strokes: Array<Array<[number, number]>> = [
  [
    [0.1, 0.2],
    [0.5, 0.6],
  ],
];

const quote: Quote = {
  id: "11111111-1111-4111-8111-111111111111",
  createdAt: at,
  updatedAt: at,
  name: "Bathroom remodel",
  address: "100 Test Lane, Cary, NC 27513",
  client: "Taylor Customer",
  clientEmail: "taylor@example.com",
  clientPhone: "919-555-0101",
  quoteNumber: "141",
  startDate: "2026-11-10",
  endDate: "2026-12-10",
  status: "Draft",
  description: "Remodel the bathroom",
  category: "Bathroom",
  cover: "",
};

const agreement: MsaAgreement = {
  version: 1,
  status: "prepared",
  owner: quote.client,
  ownerEmail: quote.clientEmail!,
  ownerPhone: quote.clientPhone!,
  projectName: quote.name,
  address: quote.address,
  quoteNumber: quote.quoteNumber!,
  price: 19750,
  scope: [],
  paymentSchedule: [],
  permitResponsibility: "No permit required",
  terms: {
    exclusions: "",
    allowances: "",
    retainage: "",
    buildersRisk: "",
    siteAccess: "",
    plans: "",
  },
  generalTerms: [],
  estimatedStart: quote.startDate,
  estimatedCompletion: quote.endDate,
  termsSha256: "a".repeat(64),
  staffUserId: "22222222-2222-4222-8222-222222222222",
  staffSignature: {
    name: "Alex Staff",
    signedAt: at,
    signatureStrokes: strokes,
  },
};

test("normalizes quote and MSA into one signing packet", () => {
  const packet = premiumQuoteSigningPacket({
    ...quote,
    msaAgreement: agreement,
  });

  expect(packet.documents.map((document) => document.title)).toEqual([
    "Quote #141",
    "Master Services Agreement",
  ]);
  expect(packet.status).toBe("partially_signed");
  expect(packet.documents[1].signers).toMatchObject([
    { roleId: "staff", status: "signed" },
    { roleId: "customer", status: "ready" },
  ]);
});

test("keeps completed signing separate from an active portal link", () => {
  const signedAt = "2026-10-30T15:30:00.000Z";
  const packet = premiumQuoteSigningPacket({
    ...quote,
    status: "Accepted",
    quoteSentAt: at,
    quoteAcceptance: {
      signedName: quote.client,
      signedAt,
      signatureStrokes: strokes,
      linkId: "link-1",
      quoteUpdatedAt: quote.updatedAt,
      quoteSnapshotSha256: "b".repeat(64),
      agreementText: "I accept this quote.",
    },
    msaAgreement: {
      ...agreement,
      status: "signed",
      sentAt: at,
      customerSignature: {
        name: quote.client,
        signedAt,
        signatureStrokes: strokes,
      },
    },
  });

  expect(packet.status).toBe("completed");
  expect(
    packet.documents.every((document) => document.status === "completed"),
  ).toBeTruthy();
  expect(summarizeDelivery(packet.delivery)).toContain(
    "Available in customer portal",
  );
});

test("does not claim a portal is active when documents were only signed locally", () => {
  const packet = premiumQuoteSigningPacket({
    ...quote,
    status: "Accepted",
    quoteOnsiteAt: at,
    quoteAcceptance: {
      signedName: quote.client,
      signedAt: at,
      signatureStrokes: strokes,
      linkId: "local-link",
      quoteUpdatedAt: quote.updatedAt,
      quoteSnapshotSha256: "c".repeat(64),
      agreementText: "I accept this quote.",
    },
    msaAgreement: {
      ...agreement,
      status: "signed",
      customerSignature: {
        name: quote.client,
        signedAt: at,
        signatureStrokes: strokes,
      },
    },
  });

  expect(packet.status).toBe("completed");
  expect(summarizeDelivery(packet.delivery)).toContain("Opened on this device");
  expect(summarizeDelivery(packet.delivery)).not.toContain(
    "Available in customer portal",
  );
});

test("builds a versioned, organization-neutral signing data catalog", () => {
  const user: User = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Alex Staff",
    email: "alex@example.com",
    role: "admin",
    group: "owner",
  };
  const snapshot = buildSigningDataSnapshot({
    businessName: "Example Services",
    quote,
    user,
    custom: { cabinetFinish: "White oak" },
  });

  expect(snapshot.schemaVersion).toBe(1);
  expect(snapshot.organization.name).toBe("Example Services");
  expect(snapshot.contact.email).toBe(quote.clientEmail);
  expect(snapshot.staff.current.name).toBe(user.name);
  expect(snapshot.custom.cabinetFinish).toBe("White oak");
  expect(resolveSigningDataBinding(snapshot, "contact.email")).toBe(
    quote.clientEmail,
  );
  expect(resolveSigningDataBinding(snapshot, "staff.current.name")).toBe(
    user.name,
  );
});
