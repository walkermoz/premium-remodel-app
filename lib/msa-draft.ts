import type {
  AcceptedScopeItem,
  MsaContractTerms,
  MsaPaymentStep,
  MsaPermitResponsibility,
  Project,
  Quote,
  ScopeItem,
} from "./types";

export function acceptedScopeSnapshot(
  items: Array<{
    title: string;
    details?: string;
    sectionName?: string;
    estimate: number;
    position?: number;
    customerVisible?: boolean;
  }>,
  category: string,
): AcceptedScopeItem[] {
  return [...items]
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity))
    .map((item) => ({
      section: item.sectionName?.trim() || category || "General scope",
      title: item.title.trim(),
      details: item.details?.trim() || "",
      amount: item.estimate,
      ...(item.customerVisible === false ? { customerVisible: false } : {}),
    }));
}

export const defaultMsaPermitResponsibility: MsaPermitResponsibility =
  "Owner obtains and pays";
export const defaultMsaExclusions =
  "No additional exclusions are listed. Included work is limited to the accepted quote.";
export const defaultMsaAllowances = "No material allowances are included.";
export const defaultMsaRetainage = "No separate retainage applies.";
export const defaultMsaBuildersRisk =
  "No builder’s risk insurance is required by default.";
export const defaultMsaSiteAccess =
  "Owner will provide reasonable site access, available utilities, and a clear work area.";
export const defaultMsaPlans =
  "The accepted quote and its scope of work are the controlling specifications when no separate plans are attached.";
export const defaultMsaDepositCollection =
  "After the owner signs the MSA, make the deposit payable online through Stripe or by offline check. Record payment before work begins; payment is not required at the moment of signing.";
export const msaCancellationAddress =
  "Premium Living Home Improvement LLC d/b/a Premium Remodel, 309 Amiable Loop, Cary, North Carolina 27519";

export function defaultMsaContractTerms(
  project: Project | Quote,
  scope: AcceptedScopeItem[],
): MsaContractTerms {
  const quoteText = [
    project.description,
    (project as Project & { quoteNotes?: string }).quoteNotes || "",
    ...scope.flatMap((item) => [item.title, item.details]),
  ].join("\n");
  return {
    exclusions: /\b(exclusions?|excluded|not included)\b/i.test(quoteText)
      ? "Review exclusions stated in the accepted quote; no additional exclusions are added by default."
      : defaultMsaExclusions,
    allowances: /\ballowances?\b/i.test(quoteText)
      ? "Review the allowance amounts and selection terms stated in the accepted quote."
      : defaultMsaAllowances,
    retainage: defaultMsaRetainage,
    buildersRisk: defaultMsaBuildersRisk,
    siteAccess: defaultMsaSiteAccess,
    plans: defaultMsaPlans,
  };
}

export function defaultMsaPaymentSchedule(
  project: Pick<Project, "category" | "name">,
): MsaPaymentStep[] {
  const kind = `${project.category} ${project.name}`.toLowerCase();
  const finish = kind.includes("kitchen")
    ? "After cabinets, finishes, and tile are installed"
    : kind.includes("bath")
      ? "After waterproofing, tile, and bathroom finishes are installed"
      : "After the primary finishes are installed";
  return [
    {
      id: "deposit",
      milestone: "Deposit after agreement signing and before work begins",
      percent: 50,
    },
    {
      id: "rough-ins",
      milestone:
        "After demolition and plumbing, electrical, and other mechanical rough-ins",
      percent: 25,
    },
    { id: "finishes", milestone: finish, percent: 15 },
    {
      id: "final",
      milestone: "After final walkthrough and substantial completion",
      percent: 10,
    },
  ];
}

export function msaPaymentAmounts(price: number, steps: MsaPaymentStep[]) {
  if (!steps.length) return [];
  const totalCents = Math.round(price * 100);
  const raw = steps.map((step) => (totalCents * step.percent) / 100);
  const cents = raw.map(Math.floor);
  const priority = raw
    .map((value, index) => ({ index, remainder: value - cents[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const remaining = totalCents - cents.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < remaining; index++)
    cents[priority[index % priority.length].index]++;
  return cents.map((value) => value / 100);
}

export type MsaPrefill = {
  owner: string;
  phone: string;
  email: string;
  project: string;
  address: string;
  description: string;
  quoteNumber: string;
  contractPrice: number | null;
  priceSource:
    "accepted price" | "accepted scope" | "current scope" | "missing";
  startDate: string;
  completionDate: string;
  scope: AcceptedScopeItem[];
  scopeSource: "accepted quote" | "current scope";
  paymentSchedule: MsaPaymentStep[];
  scheduleSource: "saved" | "default";
  permitResponsibility: MsaPermitResponsibility;
  exclusions: string;
  allowances: string;
  retainage: string;
  buildersRisk: string;
  siteAccess: string;
  plans: string;
  depositCollection: string;
  cancellationAddress: string;
  effectiveDate: string;
  companySigner: string;
  review: string[];
};

/** Suggestions for staff review, never a completed or signable agreement. */
export function msaPrefill(
  project: Project | Quote,
  items: ScopeItem[],
): MsaPrefill {
  const currentItems = items.filter((item) => item.projectId === project.id);
  const hasAcceptedScope = Boolean(project.acceptedQuoteScope?.length);
  const scope = hasAcceptedScope
    ? project.acceptedQuoteScope!
    : acceptedScopeSnapshot(currentItems, project.category);
  const currentScope = currentItems.reduce(
    (sum, item) => sum + item.estimate,
    0,
  );
  const snapshotTotal = hasAcceptedScope
    ? scope.reduce((sum, item) => sum + item.amount, 0)
    : 0;
  const acceptedPrice =
    typeof project.contractPrice === "number" &&
    Number.isFinite(project.contractPrice) &&
    project.contractPrice > 0
      ? project.contractPrice
      : null;
  const contractPrice =
    acceptedPrice ??
    (snapshotTotal > 0 ? snapshotTotal : null) ??
    (currentScope > 0 ? currentScope : null);
  const contractTerms =
    project.msaContractTerms || defaultMsaContractTerms(project, scope);

  const review = [
    "Confirm the legal owner and every person who must sign; the quote contact may not be the property owner.",
    project.msaPaymentSchedule
      ? "Review the saved payment milestones against the contract price before sending."
      : "Review and save the default payment milestones before sending. The amounts must total the contract price.",
    "Confirm the included work and any project-specific exclusions, allowances, or selection deadlines against the accepted quote.",
    "Confirm whether the default permit responsibility applies to this job, and identify any required permits.",
    "Confirm any separate plans or special site or access requirements for this project.",
    "Confirm whether the default builder’s risk insurance term applies to this project.",
    "Capture the authorized staff member who sends the MSA, including their title and signature.",
    "Set the effective date to the customer’s signing date and complete Exhibit G’s transaction date and cancellation deadline at that time.",
  ];
  if (!project.client.trim()) review.unshift("Add the customer name.");
  if (!project.address.trim()) review.unshift("Add the project address.");
  if (!contractPrice) review.unshift("Set and verify the contract price.");
  else if (!acceptedPrice)
    review.unshift(
      hasAcceptedScope
        ? "Verify the accepted scope total against the signed quote before using it as the contract price."
        : "Verify the current scope total against the accepted quote before using it as the contract price.",
    );
  if (!project.startDate || !project.endDate)
    review.unshift("Confirm the estimated project start and completion dates.");
  if (!scope.length) review.unshift("Add the detailed scope of work.");
  else if (!hasAcceptedScope)
    review.unshift(
      "This older project has no accepted-quote scope snapshot. Compare the current scope with the signed quote before preparing the MSA.",
    );

  return {
    owner: project.client.trim(),
    phone: project.clientPhone?.trim() || "",
    email: project.clientEmail?.trim() || "",
    project: project.name.trim(),
    address: project.address.trim(),
    description: project.description.trim(),
    quoteNumber: project.quoteNumber?.trim() || "",
    contractPrice,
    priceSource: acceptedPrice
      ? "accepted price"
      : contractPrice
        ? hasAcceptedScope
          ? "accepted scope"
          : "current scope"
        : "missing",
    startDate: project.startDate,
    completionDate: project.endDate,
    scope,
    scopeSource: hasAcceptedScope ? "accepted quote" : "current scope",
    paymentSchedule:
      project.msaPaymentSchedule || defaultMsaPaymentSchedule(project),
    scheduleSource: project.msaPaymentSchedule ? "saved" : "default",
    permitResponsibility:
      project.msaPermitResponsibility || defaultMsaPermitResponsibility,
    ...contractTerms,
    depositCollection: defaultMsaDepositCollection,
    cancellationAddress: msaCancellationAddress,
    effectiveDate: "Set when the customer signs",
    companySigner: "Assigned when the MSA is sent",
    review,
  };
}
