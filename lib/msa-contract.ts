import { createHash } from "node:crypto";
import { z } from "zod";
import source from "./msa-general-terms.json" with { type: "json" };
import { msaPaymentAmounts, msaPrefill } from "./msa-draft";
import { signatureStrokesSchema } from "./quote-signature";
import type { MsaAgreement, Project, ScopeItem } from "./types";

export const msaCompanyName =
  "Premium Living Home Improvement LLC d/b/a Premium Remodel";
export const msaCompanyAddress = "309 Amiable Loop, Cary, North Carolina 27519";
export const msaGeneralTerms = source.blocks;

export const staffMsaInput = z.object({
  owner: z.string().trim().min(2).max(150),
  ownerEmail: z.email().max(320),
  signerTitle: z.string().trim().min(2).max(100),
  signatureStrokes: signatureStrokesSchema,
});
export const customerMsaInput = z.object({
  signedName: z.string().trim().min(2).max(150),
  signatureStrokes: signatureStrokesSchema,
  termsSha256: z.string().regex(/^[a-f0-9]{64}$/),
  transactionDate: z.iso.date(),
  agreed: z.literal(true),
});

export function easternDate(at: string | Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/New_York",
  }).formatToParts(new Date(at));
  const part = (kind: string) =>
    parts.find((item) => item.type === kind)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function nthWeekday(year: number, month: number, weekday: number, nth: number) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
}
function lastWeekday(year: number, month: number, weekday: number) {
  const last = new Date(Date.UTC(year, month, 0));
  return last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7);
}
function federalHoliday(day: Date) {
  const year = day.getUTCFullYear();
  const month = day.getUTCMonth() + 1;
  const date = day.getUTCDate();
  const observed = (m: number, d: number) => {
    const actual = new Date(Date.UTC(year, m - 1, d));
    const shift =
      actual.getUTCDay() === 6 ? -1 : actual.getUTCDay() === 0 ? 1 : 0;
    actual.setUTCDate(actual.getUTCDate() + shift);
    return actual.getUTCMonth() + 1 === month && actual.getUTCDate() === date;
  };
  return (
    observed(1, 1) ||
    observed(6, 19) ||
    observed(7, 4) ||
    observed(11, 11) ||
    observed(12, 25) ||
    (month === 1 && date === nthWeekday(year, 1, 1, 3)) ||
    (month === 2 && date === nthWeekday(year, 2, 1, 3)) ||
    (month === 5 && date === lastWeekday(year, 5, 1)) ||
    (month === 9 && date === nthWeekday(year, 9, 1, 1)) ||
    (month === 10 && date === nthWeekday(year, 10, 1, 2)) ||
    (month === 11 && date === nthWeekday(year, 11, 4, 4))
  );
}

/** Conservative three-business-day deadline used on the completed notice. */
export function cancellationDeadline(transactionDate: string) {
  const day = new Date(`${transactionDate}T12:00:00Z`);
  let counted = 0;
  while (counted < 3) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6 && !federalHoliday(day))
      counted++;
  }
  return day.toISOString().slice(0, 10);
}

export function prepareMsa(
  project: Project,
  items: ScopeItem[],
  input: z.infer<typeof staffMsaInput>,
  signer: { id: string; name: string },
  at: string,
): MsaAgreement {
  if (!project.quoteAcceptedAt)
    throw new Error("Accept the quote before preparing the agreement.");
  if (!project.acceptedQuoteScope?.length || !project.contractPrice)
    throw new Error(
      "This project needs a verified accepted quote scope and price before an agreement can be sent.",
    );
  if (
    Math.round(
      project.acceptedQuoteScope.reduce((sum, item) => sum + item.amount, 0) *
        100,
    ) !== Math.round(project.contractPrice * 100)
  )
    throw new Error(
      "The accepted scope total differs from the contract price. Review the accepted quote before sending the agreement.",
    );
  const draft = msaPrefill(project, items);
  if (
    !draft.contractPrice ||
    draft.contractPrice <= 0 ||
    !draft.scope.length ||
    !draft.address
  )
    throw new Error(
      "Add the accepted scope, contract price, and project address before sending the agreement.",
    );
  if (
    !project.msaPaymentSchedule ||
    !project.msaContractTerms ||
    !project.msaPermitResponsibility
  )
    throw new Error(
      "Save and review the MSA payment schedule and contract terms before sending.",
    );
  const sum = draft.paymentSchedule.reduce(
    (total, step) => total + step.percent,
    0,
  );
  if (
    !draft.paymentSchedule.length ||
    Math.abs(sum - 100) > 0.001 ||
    draft.paymentSchedule.some(
      (step) => !step.milestone.trim() || step.percent <= 0,
    )
  )
    throw new Error("Payment milestones must be complete and total 100%.");
  if (Object.values(project.msaContractTerms).some((value) => !value.trim()))
    throw new Error("Complete every contract term before sending.");
  if (
    /^Review (?:exclusions|the allowance amounts)/i.test(
      project.msaContractTerms.exclusions,
    ) ||
    /^Review (?:exclusions|the allowance amounts)/i.test(
      project.msaContractTerms.allowances,
    )
  )
    throw new Error(
      "Replace the quoted exclusions or allowance review prompts with the actual accepted terms before sending.",
    );
  const body = {
    version: 1 as const,
    owner: input.owner,
    ownerEmail: input.ownerEmail.toLowerCase(),
    ownerPhone: project.clientPhone?.trim() || "",
    projectName: project.name,
    address: project.address,
    quoteNumber: project.quoteNumber || "",
    price: draft.contractPrice,
    scope: draft.scope,
    paymentSchedule: draft.paymentSchedule,
    permitResponsibility: draft.permitResponsibility,
    terms: project.msaContractTerms,
    generalTerms: source.blocks,
    estimatedStart: project.startDate,
    estimatedCompletion: project.endDate,
  };
  return {
    ...body,
    status: "prepared",
    termsSha256: createHash("sha256")
      .update(JSON.stringify({ body, template: source.sourceSha256 }))
      .digest("hex"),
    staffUserId: signer.id,
    staffSignature: {
      name: signer.name,
      title: input.signerTitle,
      signedAt: at,
      signatureStrokes: input.signatureStrokes,
    },
  };
}

export function msaPaymentRows(agreement: MsaAgreement) {
  const amounts = msaPaymentAmounts(agreement.price, agreement.paymentSchedule);
  return agreement.paymentSchedule.map((step, index) => ({
    ...step,
    amount: amounts[index],
  }));
}
