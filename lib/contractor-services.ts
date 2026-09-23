// Keep contacts that offer both trades in each service category without
// duplicating the contractor or changing existing project assignments.
export function contractorServices(trade: string): string[] {
  const value = trade.trim();
  const parts = value.split(/\s*(?:&|\/|,|\band\b)\s*/i);
  if (
    parts.length === 2 &&
    parts.some((part) => /^(?:tile|tiling)$/i.test(part)) &&
    parts.some((part) => /^plumbing$/i.test(part))
  ) {
    return ["Tiling", "Plumbing"];
  }
  if (/^(?:tile|tiling)$/i.test(value)) return ["Tiling"];
  if (/^plumbing$/i.test(value)) return ["Plumbing"];
  return [value];
}
