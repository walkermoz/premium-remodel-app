import type { ActualCost, Project, ScopeItem } from "./types";

const cents = (value: number) => Math.round(value * 100);

export function jobCostSummary(
  projectId: string,
  scope: ScopeItem[],
  actualCosts: ActualCost[],
  snapshot?: Project["jobCostBudgetSnapshot"],
) {
  const items = scope.filter((item) => item.projectId === projectId);
  const costs = actualCosts.filter((item) => item.projectId === projectId);
  const budgetItems = snapshot?.items.length
    ? snapshot.items
    : items.map((item) => ({
        scopeItemId: item.id,
        title: item.title,
        estimate: item.estimate,
        subCost: item.subCost,
        materialCost: item.materialCost || 0,
      }));
  const revenueCents = budgetItems.reduce(
    (total, item) => total + cents(item.estimate),
    0,
  );
  const budgetCents = budgetItems.reduce(
    (total, item) =>
      total + cents(item.subCost) + cents(item.materialCost || 0),
    0,
  );
  const actualCents = costs.reduce(
    (total, item) => total + cents(item.amount),
    0,
  );
  const byItem = budgetItems.map((item) => {
    const itemBudgetCents = cents(item.subCost) + cents(item.materialCost || 0);
    const itemActualCents = costs
      .filter((cost) => cost.scopeItemId === item.scopeItemId)
      .reduce((total, cost) => total + cents(cost.amount), 0);
    return {
      item: {
        id: item.scopeItemId,
        title: item.title,
      },
      budget: itemBudgetCents / 100,
      actual: itemActualCents / 100,
      variance: (itemBudgetCents - itemActualCents) / 100,
    };
  });
  const unallocatedCents = costs
    .filter((cost) => !cost.scopeItemId)
    .reduce((total, cost) => total + cents(cost.amount), 0);
  return {
    revenue: revenueCents / 100,
    budget: budgetCents / 100,
    actual: actualCents / 100,
    variance: (budgetCents - actualCents) / 100,
    budgetMargin: (revenueCents - budgetCents) / 100,
    actualMargin: (revenueCents - actualCents) / 100,
    actualMarginPercent:
      revenueCents > 0 ? (revenueCents - actualCents) / revenueCents : null,
    unallocated: unallocatedCents / 100,
    byItem,
    costs: costs.sort(
      (a, b) =>
        b.incurredAt.localeCompare(a.incurredAt) ||
        b.createdAt.localeCompare(a.createdAt),
    ),
  };
}
