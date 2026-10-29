import { demoWorkspace } from "./demo";
import type {
  AcceptedScopeItem,
  Activity,
  MsaAgreement,
  Quote,
  ScopeItem,
  Workspace,
} from "./types";

export const QUOTE_HANDOFF_DEMO_ID = "quote-project-handoff-demo";

function day(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function quoteProjectHandoffDemoWorkspace(): Workspace {
  const workspace = demoWorkspace();
  const now = new Date().toISOString();
  const acceptedAt = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const signedAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const signatureStrokes = [
    [
      [0.12, 0.55],
      [0.3, 0.28],
      [0.47, 0.62],
    ],
  ] as Array<Array<[number, number]>>;
  const acceptedScope: AcceptedScopeItem[] = [
    {
      section: "Kitchen",
      title: "Cabinetry and installation",
      details: "Shaker cabinetry, soft-close hardware, and installation.",
      amount: 24_500,
    },
    {
      section: "Kitchen",
      title: "Quartz countertops",
      details: "Template, fabrication, sink cutout, and installation.",
      amount: 9_800,
    },
    {
      section: "Kitchen",
      title: "Flooring and finish work",
      details: "LVP flooring, trim, paint touch-ups, and final cleanup.",
      amount: 7_700,
    },
  ];
  const agreement: MsaAgreement = {
    version: 1,
    status: "signed",
    owner: "Taylor Reed",
    ownerEmail: "taylor@example.com",
    ownerPhone: "(919) 555-0142",
    projectName: "Willowbrook kitchen remodel",
    address: "1214 Willowbrook Drive, Cary, NC 27513",
    quoteNumber: "PR-1048",
    price: 42_000,
    scope: acceptedScope,
    paymentSchedule: [
      { id: "deposit", milestone: "Deposit", percent: 20 },
      { id: "start", milestone: "Work begins", percent: 30 },
      { id: "midpoint", milestone: "Midpoint", percent: 30 },
      { id: "completion", milestone: "Final completion", percent: 20 },
    ],
    permitResponsibility: "Premium Remodel obtains; owner pays fees",
    terms: {
      exclusions: "Appliances and owner-supplied decorative fixtures.",
      allowances: "Finish selections follow the signed quote allowances.",
      retainage: "None.",
      buildersRisk: "Owner maintains property insurance.",
      siteAccess: "Weekdays from 8:00 AM to 5:00 PM.",
      plans: "Work follows the approved scope and field measurements.",
    },
    generalTerms: [],
    estimatedStart: day(14),
    estimatedCompletion: day(52),
    termsSha256: "demo-signed-agreement",
    staffUserId: "demo",
    staffSignature: {
      name: "Alex Morgan",
      title: "Administrator",
      signedAt,
      signatureStrokes,
    },
    customerSignature: {
      name: "Taylor Reed",
      title: "Owner",
      signedAt,
      signatureStrokes,
    },
    transactionDate: day(-2),
    cancellationDeadline: day(1),
  };
  const quote: Quote = {
    id: QUOTE_HANDOFF_DEMO_ID,
    createdAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
    updatedAt: now,
    name: "Willowbrook kitchen remodel",
    client: "Taylor Reed",
    clientEmail: "taylor@example.com",
    clientPhone: "(919) 555-0142",
    contactId: workspace.contacts[0]?.id,
    address: "1214 Willowbrook Drive, Cary, NC 27513",
    contractPrice: 42_000,
    startDate: day(14),
    endDate: day(52),
    completedDate: "",
    status: "Accepted",
    description:
      "Kitchen renovation with new cabinetry, quartz countertops, flooring, lighting updates, and finish work.",
    category: "Kitchen",
    cover: "/images/kitchen.jpg",
    quoteNumber: "PR-1048",
    quoteSentAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    quoteAcceptedAt: acceptedAt,
    quoteAcceptedBy: "Taylor Reed",
    quoteAcceptance: {
      signedName: "Taylor Reed",
      signedAt: acceptedAt,
      signatureStrokes,
      linkId: "demo-link",
      quoteUpdatedAt: acceptedAt,
      quoteSnapshotSha256: "demo-quote-snapshot",
      agreementText: "I approve this quote and its attached scope.",
    },
    acceptedQuoteScope: acceptedScope,
    msaPaymentSchedule: agreement.paymentSchedule,
    msaPermitResponsibility: agreement.permitResponsibility,
    msaContractTerms: agreement.terms,
    msaAgreement: agreement,
    quotePhotos: [],
  };
  const scope: ScopeItem[] = acceptedScope.map((item, index) => ({
    id: `handoff-scope-${index + 1}`,
    projectId: quote.id,
    createdAt: quote.createdAt,
    updatedAt: now,
    sectionId: "handoff-kitchen",
    sectionName: item.section,
    position: index,
    title: item.title,
    details: item.details,
    quantity: 1,
    unit: "job",
    estimate: item.amount,
    subCost: Math.round(item.amount * 0.52),
    materialCost: Math.round(item.amount * 0.18),
    customerVisible: true,
    contractorId: "",
    status: "To do",
  }));
  const deposit: Activity = {
    id: "handoff-deposit",
    projectId: quote.id,
    createdAt: now,
    updatedAt: now,
    activityType: "Payment received",
    actorId: "demo",
    actorName: "Alex Morgan",
    authorId: "demo",
    authorName: "Alex Morgan",
    occurredAt: now,
    summary: "Deposit received",
    notes: "Paid by check #1842.",
    amount: 8_400,
    party: "Taylor Reed",
    paymentMethod: "Check",
    contractorId: "",
    attachmentIds: [],
  };
  return {
    ...workspace,
    quotes: [quote],
    scope: [...scope, ...workspace.scope],
    activities: [deposit, ...(workspace.activities || [])],
  };
}
