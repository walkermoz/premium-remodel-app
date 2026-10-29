import { expect, test } from "@playwright/test";
import { moveQuoteScopeItem } from "../lib/scope-order";
import type { ScopeItem } from "../lib/types";

test("quote row order requires an authenticated workspace", async ({
  request,
}) => {
  const response = await request.post("/api/workspace/scope-order", {
    headers: { Origin: "http://localhost:3100" },
    data: {
      quoteId: "d711fa59-493c-47d5-806d-18362f32fe61",
      movingId: "ec02922a-89a0-40e3-97ad-1fd8e784ce6f",
      items: [
        {
          id: "ec02922a-89a0-40e3-97ad-1fd8e784ce6f",
          updatedAt: "2026-10-28T00:00:00.000Z",
        },
      ],
      sectionId: "",
      sectionName: "",
    },
  });
  expect(response.status()).toBe(401);
});

test("moving a quote row between sections assigns its destination section", () => {
  const rows = [
    { id: "a", sectionId: "first", sectionName: "Kitchen" },
    { id: "b", sectionId: "first", sectionName: "Kitchen" },
    { id: "c", sectionId: "second", sectionName: "Bathroom" },
  ] as ScopeItem[];
  const moved = moveQuoteScopeItem(rows, "a", "c", "after");
  expect(moved?.map((item) => item.id)).toEqual(["b", "c", "a"]);
  expect(moved?.map((item) => item.position)).toEqual([0, 1, 2]);
  expect(moved?.[2]).toMatchObject({
    sectionId: "second",
    sectionName: "Bathroom",
  });
  expect(rows[0].sectionId).toBe("first");
});

test("quote rows reorder by dragging and keep their order after reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 2200 });
  await page.goto("/demo?view=Quotes");
  await page.getByRole("button", { name: "New quote" }).first().click();
  const quote = page.getByRole("dialog", { name: "New quote" });
  await quote.getByLabel("Quote name").fill("Drag row example");
  await quote.getByLabel("Client name").fill("Test Customer");
  await quote.getByRole("button", { name: "Create quote" }).click();

  for (const title of ["First task", "Second task", "Third task"]) {
    await page.getByRole("button", { name: "Add Custom", exact: true }).click();
    const row = page.locator(".scope-new-row");
    await row
      .getByRole("textbox", { name: "New work item", exact: true })
      .fill(title);
    await row.getByRole("button", { name: `Save ${title}` }).click();
    await expect(row).toHaveCount(0);
  }

  const summaryNames = page.locator(
    ".scope-summary-row .scope-summary-button > span:first-child strong",
  );
  await expect(summaryNames).toHaveText([
    "First task",
    "Second task",
    "Third task",
  ]);
  await page.getByRole("button", { name: "Edit First task" }).click();
  const handle = page.getByRole("button", {
    name: "Drag First task to reorder",
  });
  const target = page.locator(".scope-summary-row").filter({
    has: page.getByRole("button", { name: "Edit Third task" }),
  });
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  const source = await handle.boundingBox();
  expect(source).not.toBeNull();
  await page.mouse.move(
    source!.x + source!.width / 2,
    source!.y + source!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    source!.x + source!.width / 2 + 12,
    source!.y + source!.height / 2 + 3,
    { steps: 5 },
  );
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height - 4, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(summaryNames).toHaveText([
    "Second task",
    "Third task",
    "First task",
  ]);
  await expect(
    page.getByRole("button", { name: "Edit First task" }),
  ).toHaveAttribute("aria-expanded", "true");

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("premium-remodel-sample-v1") || "{}"),
  );
  const created = stored.quotes.find(
    (entry: { name: string }) => entry.name === "Drag row example",
  );
  const savedRows = stored.scope
    .filter((entry: { projectId: string }) => entry.projectId === created.id)
    .sort(
      (a: { position: number }, b: { position: number }) =>
        a.position - b.position,
    );
  expect(savedRows.map((entry: { title: string }) => entry.title)).toEqual([
    "Second task",
    "Third task",
    "First task",
  ]);

  await page.reload();
  await expect(summaryNames).toHaveText([
    "Second task",
    "Third task",
    "First task",
  ]);
  const up = page.getByRole("button", { name: "Drag First task to reorder" });
  await up.focus();
  await up.press("ArrowUp");
  await expect(summaryNames).toHaveText([
    "Second task",
    "First task",
    "Third task",
  ]);
});
