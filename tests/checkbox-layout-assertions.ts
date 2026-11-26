import { expect, type Locator } from "@playwright/test";

export async function expectCheckboxRows(checkboxes: Locator) {
  const rows = await checkboxes.evaluateAll((inputs) =>
    inputs
      .filter((input) => (input as HTMLElement).offsetWidth > 0)
      .map((input) => {
        const box = input.getBoundingClientRect();
        const label = input.closest("label")!;
        const text = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        let textBounds: DOMRect | undefined;
        let textTransform = "";
        while ((node = text.nextNode())) {
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const bounds = range.getBoundingClientRect();
          if (!bounds.width || !bounds.height) continue;
          textBounds = bounds;
          textTransform = getComputedStyle(node.parentElement!).textTransform;
          break;
        }
        return {
          width: box.width,
          height: box.height,
          padding: getComputedStyle(input).padding,
          textTransform,
          gap: textBounds ? textBounds.left - box.right : null,
          topDifference: textBounds ? Math.abs(textBounds.top - box.top) : null,
        };
      }),
  );
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.width).toBe(18);
    expect(row.height).toBe(18);
    expect(row.padding).toBe("0px");
    expect(row.textTransform).toBe("none");
    expect(row.gap).toBeGreaterThanOrEqual(8);
    expect(row.topDifference).toBeLessThan(8);
  }
}
