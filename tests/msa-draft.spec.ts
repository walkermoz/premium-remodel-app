import { expect, test } from "@playwright/test";
import { msaPaymentAmounts, msaPrefill } from "@/lib/msa-draft";
import type { Project, ScopeItem } from "@/lib/types";

const project: Project = {
  id: "11111111-1111-4111-8111-111111111111",
  createdAt: "2026-10-23T10:00:00.000Z",
  updatedAt: "2026-10-23T10:00:00.000Z",
  name: "Bathroom remodel",
  address: "100 Test Lane, Cary, NC 27513",
  client: "Taylor Customer",
  clientEmail: "taylor@example.com",
  clientPhone: "919-555-0101",
  contractPrice: 4900,
  quoteNumber: "135",
  quoteAcceptedAt: "2026-10-23T10:00:00.000Z",
  startDate: "2026-11-02",
  endDate: "2026-11-20",
  status: "Planning",
  description: "Remodel the primary bathroom.",
  category: "Bathroom",
  cover: "",
};

const item: ScopeItem = {
  id: "22222222-2222-4222-8222-222222222222",
  projectId: project.id,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  title: "Shower waterproofing",
  details: "Waterproof shower walls and floor.",
  quantity: 1,
  unit: "job",
  estimate: 5200,
  subCost: 0,
  materialCost: 0,
  contractorId: "",
  status: "To do",
};

test("MSA prefill uses accepted price and agreed kitchen/bathroom defaults", () => {
  const draft = msaPrefill(project, [item]);
  expect(draft.owner).toBe("Taylor Customer");
  expect(draft.contractPrice).toBe(4900);
  expect(draft.priceSource).toBe("accepted price");
  expect(draft.scopeSource).toBe("current scope");
  expect(draft.scope).toEqual([
    {
      section: "Bathroom",
      title: "Shower waterproofing",
      details: "Waterproof shower walls and floor.",
      amount: 5200,
    },
  ]);
  expect(draft.paymentSchedule.map((step) => step.percent)).toEqual([
    50, 25, 15, 10,
  ]);
  expect(draft.paymentSchedule[0].milestone).toContain("before work begins");
  expect(draft.paymentSchedule[2].milestone).toContain("bathroom finishes");
  expect(msaPaymentAmounts(4900, draft.paymentSchedule)).toEqual([
    2450, 1225, 735, 490,
  ]);
  expect(draft.permitResponsibility).toBe("Owner obtains and pays");
  expect(draft.allowances).toContain("No material allowances");
  expect(draft.companySigner).toBe("Assigned when the MSA is sent");
  expect(draft.review.join(" ")).toContain("legal owner");
});

test("MSA keeps the accepted quote scope when project scope later changes", () => {
  const draft = msaPrefill(
    {
      ...project,
      acceptedQuoteScope: [
        {
          section: "Bathroom",
          title: "Original waterproofing",
          details: "Accepted scope",
          amount: 4900,
        },
      ],
    },
    [item],
  );
  expect(draft.scopeSource).toBe("accepted quote");
  expect(draft.scope[0].title).toBe("Original waterproofing");
  expect(draft.review.join(" ")).not.toContain(
    "no accepted-quote scope snapshot",
  );
});

test("payment amounts allocate rounding cents without changing the total", () => {
  const result = msaPaymentAmounts(0.01, [
    { id: "a", milestone: "First", percent: 33.34 },
    { id: "b", milestone: "Second", percent: 33.33 },
    { id: "c", milestone: "Third", percent: 33.33 },
  ]);
  expect(result).toEqual([0.01, 0, 0]);
  expect(result.reduce((sum, amount) => sum + amount, 0)).toBe(0.01);
});

test("older accepted projects identify a live scope total for verification", () => {
  const draft = msaPrefill({ ...project, contractPrice: undefined }, [item]);
  expect(draft.contractPrice).toBe(5200);
  expect(draft.priceSource).toBe("current scope");
  expect(draft.review.join(" ")).toContain("against the accepted quote");
});

test("saved payment terms and quoted allowances override the defaults", () => {
  const draft = msaPrefill(
    {
      ...project,
      category: "Kitchen",
      msaPermitResponsibility: "Premium Remodel obtains; owner pays fees",
      msaPaymentSchedule: [
        { id: "first", milestone: "Deposit", percent: 60 },
        { id: "final", milestone: "Final walkthrough", percent: 40 },
      ],
      msaContractTerms: {
        exclusions: "No structural work",
        allowances: "$5,000 cabinet allowance",
        retainage: "None",
        buildersRisk: "Not required",
        siteAccess: "Weekdays 8–5",
        plans: "Kitchen plan dated October 1",
      },
    },
    [
      {
        ...item,
        title: "Cabinet allowance",
        details: "$5,000 cabinet selection allowance",
      },
    ],
  );
  expect(draft.scheduleSource).toBe("saved");
  expect(draft.paymentSchedule.map((step) => step.percent)).toEqual([60, 40]);
  expect(draft.permitResponsibility).toBe(
    "Premium Remodel obtains; owner pays fees",
  );
  expect(draft.allowances).toBe("$5,000 cabinet allowance");
  expect(draft.siteAccess).toBe("Weekdays 8–5");
});

test("quote allowances are flagged when staff has not set project terms", () => {
  const draft = msaPrefill(project, [
    { ...item, title: "Tile allowance", details: "$1,200 allowance" },
  ]);
  expect(draft.allowances).toContain("accepted quote");
});
