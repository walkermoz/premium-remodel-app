import type { Activity, Project, ScopeItem } from "./types";

const cents = (value: number) => Math.round(value * 100);
export const percentLabel = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value);
export const projectMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

export function scopeTotal(items: ScopeItem[], projectId?: string) {
  return (
    items
      .filter((item) => !projectId || item.projectId === projectId)
      .reduce((total, item) => total + cents(item.estimate), 0) / 100
  );
}

export function scopeCosts(items: ScopeItem[], projectId?: string) {
  let subCents = 0;
  let materialCents = 0;
  for (const item of items) {
    if (projectId && item.projectId !== projectId) continue;
    subCents += cents(item.subCost);
    materialCents += cents(item.materialCost ?? 0);
  }
  return {
    subCosts: subCents / 100,
    materialCosts: materialCents / 100,
    costs: (subCents + materialCents) / 100,
  };
}

export function scopeDifference(item: ScopeItem) {
  return (
    (cents(item.estimate) -
      cents(item.subCost) -
      cents(item.materialCost ?? 0)) /
    100
  );
}

// A browser opened before material costs were added must not erase saved costs.
export function preserveScopeCosts(
  input: Record<string, unknown>,
  current?: ScopeItem | null,
) {
  return {
    ...input,
    materialCost:
      input.materialCost === undefined
        ? (current?.materialCost ?? 0)
        : input.materialCost,
  };
}

export function projectFinances(
  project: Pick<Project, "id" | "contractPrice">,
  scope: ScopeItem[],
  activities: Activity[] = [],
) {
  const total = scopeTotal(scope, project.id);
  const costs = scopeCosts(scope, project.id);
  const costCents = cents(costs.costs);
  const payments = activities
    .filter(
      (item) =>
        item.projectId === project.id &&
        item.activityType === "Payment received",
    )
    .sort(
      (a, b) =>
        Date.parse(b.occurredAt) - Date.parse(a.occurredAt) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  const collectedCents = payments.reduce(
    (sum, item) => sum + cents(item.amount || 0),
    0,
  );
  const totalCents = cents(total);
  const remainingCents = Math.max(0, totalCents - collectedCents);
  return {
    total,
    ...costs,
    margin: (totalCents - costCents) / 100,
    marginPercent:
      totalCents > 0 ? (totalCents - costCents) / totalCents : null,
    collected: collectedCents / 100,
    remaining: remainingCents / 100,
    credit: Math.max(0, collectedCents - totalCents) / 100,
    collectedPercent: totalCents > 0 ? collectedCents / totalCents : null,
    remainingPercent: totalCents > 0 ? remainingCents / totalCents : null,
    legacyDifference:
      typeof project.contractPrice === "number"
        ? (totalCents - cents(project.contractPrice)) / 100
        : 0,
    payments,
  };
}
