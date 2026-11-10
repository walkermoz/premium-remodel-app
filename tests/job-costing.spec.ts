import { expect, test } from "@playwright/test";
import { jobCostSummary } from "../lib/job-costing";
import type { ActualCost, ScopeItem } from "../lib/types";

const base = {
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

test("job costing compares accepted scope costs with actual spend", () => {
  const scope: ScopeItem[] = [
    {
      ...base,
      id: "scope-1",
      projectId: "project-1",
      title: "Cabinets",
      quantity: 1,
      unit: "job",
      estimate: 20_000,
      subCost: 9_000,
      materialCost: 3_000,
      contractorId: "",
      status: "In progress",
    },
  ];
  const actualCosts: ActualCost[] = [
    {
      ...base,
      id: "cost-1",
      projectId: "project-1",
      scopeItemId: "scope-1",
      category: "Subcontractor",
      description: "Install draw",
      vendor: "Cabinet crew",
      amount: 10_500,
      incurredAt: "2026-11-05",
      notes: "",
      recordedById: "user-1",
      recordedByName: "Alex",
    },
    {
      ...base,
      id: "cost-2",
      projectId: "project-1",
      category: "Permit",
      description: "Permit fee",
      vendor: "City",
      amount: 2_000,
      incurredAt: "2026-11-06",
      notes: "",
      recordedById: "user-1",
      recordedByName: "Alex",
    },
  ];

  expect(jobCostSummary("project-1", scope, actualCosts)).toMatchObject({
    revenue: 20_000,
    budget: 12_000,
    actual: 12_500,
    variance: -500,
    budgetMargin: 8_000,
    actualMargin: 7_500,
    actualMarginPercent: 0.375,
    unallocated: 2_000,
    byItem: [{ budget: 12_000, actual: 10_500, variance: 1_500 }],
  });
});

test("job costing stays organization-ready by filtering every project", () => {
  const costs = [
    {
      ...base,
      id: "other",
      projectId: "another-project",
      category: "Other" as const,
      description: "Unrelated",
      vendor: "",
      amount: 999,
      incurredAt: "2026-11-01",
      notes: "",
      recordedById: "user",
      recordedByName: "User",
    },
  ];
  expect(jobCostSummary("project-1", [], costs).actual).toBe(0);
});

test("an accepted quote snapshot stays fixed when the live scope changes", () => {
  const liveScope = [
    {
      ...base,
      id: "scope-1",
      projectId: "project-1",
      title: "Cabinets",
      quantity: 1,
      unit: "job",
      estimate: 30_000,
      subCost: 15_000,
      materialCost: 5_000,
      contractorId: "",
      status: "To do" as const,
    },
  ];
  const snapshot = {
    capturedAt: "2026-11-01T00:00:00.000Z",
    source: "accepted_quote" as const,
    items: [
      {
        scopeItemId: "scope-1",
        title: "Cabinets",
        estimate: 20_000,
        subCost: 9_000,
        materialCost: 3_000,
      },
    ],
  };
  expect(jobCostSummary("project-1", liveScope, [], snapshot)).toMatchObject({
    revenue: 20_000,
    budget: 12_000,
    budgetMargin: 8_000,
  });
});
