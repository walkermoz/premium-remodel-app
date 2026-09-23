import { test, expect } from "@playwright/test";
import {
  countsTowardCloseRate,
  leadDisposition,
  leadPatchFromQuote,
  stageForQuoteStatus,
  withDispositionChange,
} from "@/lib/leads";
import type { Lead } from "@/lib/types";

const baseLead: Lead = {
  id: "00000000-0000-4000-8000-000000000201",
  contactId: "00000000-0000-4000-8000-000000000202",
  name: "Brad Smith",
  project: "Patio door",
  projectDescription: "Replace patio door(s) and handles for the rear patio.",
  status: "New",
  source: "Premium Remodel website",
  submittedAt: "2026-09-23T12:00:00.000Z",
  createdAt: "2026-09-23T12:00:00.000Z",
  updatedAt: "2026-09-23T12:00:00.000Z",
};

test("disposition defaults to Active and junk exits close-rate", () => {
  expect(leadDisposition(baseLead)).toBe("Active");
  expect(countsTowardCloseRate(baseLead)).toBe(true);
  const junked = {
    ...baseLead,
    ...withDispositionChange(baseLead, "Junk", {
      id: "actor",
      name: "Matthew",
    }),
  };
  expect(junked.disposition).toBe("Junk");
  expect(junked.dispositionHistory?.[0]).toMatchObject({
    from: "Active",
    to: "Junk",
    byName: "Matthew",
  });
  expect(countsTowardCloseRate(junked)).toBe(false);
});

test("quote status drives lead funnel stages", () => {
  expect(stageForQuoteStatus("Draft", "New")).toBe("Quote drafted");
  expect(stageForQuoteStatus("Sent", "Follow-up")).toBe("Quote sent");
  expect(stageForQuoteStatus("Declined", "Quote sent")).toBe("Lost");
  expect(stageForQuoteStatus("Expired", "Quote sent")).toBe("Stale");
  expect(
    leadPatchFromQuote(baseLead, { status: "Sent", leadId: baseLead.id }),
  ).toEqual({ status: "Quote sent" });
  expect(
    leadPatchFromQuote(
      baseLead,
      { status: "Draft", leadId: baseLead.id },
      { accepted: true },
    ),
  ).toEqual({ status: "Won" });
});

test("leads UI exposes disposition controls in sample mode", async ({
  page,
}) => {
  await page.goto("/demo?view=Leads");
  await expect(page.getByRole("heading", { name: "Leads." })).toBeVisible();
  await expect(page.getByRole("button", { name: /Active/ })).toBeVisible();
  const detail = page.getByRole("article", { name: "Taylor Reed lead" });
  await expect(detail.getByLabel("Disposition")).toBeVisible();
  await expect(detail.getByRole("button", { name: "Mark Junk" })).toBeVisible();
  await detail.getByLabel("Disposition").selectOption("Test");
  await expect(page.getByRole("button", { name: /^All/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const updated = page.getByRole("article", { name: "Taylor Reed lead" });
  await expect(updated.getByLabel("Disposition")).toHaveValue("Test");
});
