import type { ScopeItem } from "./types";

export function orderedScopeItems(items: ScopeItem[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.position !== undefined && b.item.position !== undefined)
        return a.item.position - b.item.position || a.index - b.index;
      if (a.item.position !== undefined) return -1;
      if (b.item.position !== undefined) return 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

export function moveQuoteScopeItem(
  orderedItems: ScopeItem[],
  movingId: string,
  targetId: string,
  placement: "before" | "after",
): ScopeItem[] | null {
  const sourceIndex = orderedItems.findIndex((item) => item.id === movingId);
  const target = orderedItems.find((item) => item.id === targetId);
  if (sourceIndex < 0 || !target || movingId === targetId) return null;

  const next = orderedItems.filter((item) => item.id !== movingId);
  const targetIndex = next.findIndex((item) => item.id === targetId);
  const insertAt = targetIndex + (placement === "after" ? 1 : 0);
  if (insertAt === sourceIndex) return null;

  const moving = orderedItems[sourceIndex];
  next.splice(insertAt, 0, {
    ...moving,
    sectionId: target.sectionId || "",
    sectionName: target.sectionName || "",
  });
  return next.map((item, position) => ({ ...item, position }));
}
