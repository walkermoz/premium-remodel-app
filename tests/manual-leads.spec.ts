import { test, expect, password } from "./supabase-fixture";
import { buildManualLeadRecords } from "@/lib/manual-lead";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const input = {
  name: "Jordan Lee",
  email: "jordan@example.com",
  phone: "(919) 555-0123",
  address: "1214 Willowbrook Drive, Cary, NC",
  zip: "27513",
  project: "Bathroom remodel",
  projectDescription: "Replace the shower and tile.",
};

test("manual leads start active without implied SMS consent", () => {
  const { contact, lead } = buildManualLeadRecords(
    input,
    "00000000-0000-4000-8000-000000000101",
    "00000000-0000-4000-8000-000000000102",
    "2026-10-21T12:00:00.000Z",
  );
  expect(contact.phone).toBe("+19195550123");
  expect(contact.name).toBe("Jordan Lee");
  expect(lead.contactId).toBe(contact.id);
  expect(lead.source).toBe("Dashboard");
  expect(lead.disposition).toBe("Active");
  expect(lead.smsAppointmentOptIn).toBe(false);
  expect(lead.smsMarketingOptIn).toBe(false);
  expect(() =>
    buildManualLeadRecords(
      { ...input, phone: "", email: "" },
      contact.id,
      lead.id,
      lead.createdAt,
    ),
  ).toThrow();
});

test("sample workspace creates a linked lead from Leads", async ({ page }) => {
  await page.goto("/demo?view=Leads");
  await page.getByRole("button", { name: "New lead" }).click();
  const dialog = page.getByRole("dialog", { name: "New lead" });
  await dialog.getByLabel("Customer name").fill(input.name);
  await dialog.getByLabel("Project or service").fill(input.project);
  await dialog.getByRole("button", { name: "Create lead" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Enter an email address or phone number.",
  );
  await dialog.getByLabel("Email").fill(input.email);
  await dialog.getByLabel("Phone").fill(input.phone);
  await dialog.getByLabel("Project description").fill(input.projectDescription);
  await dialog.getByRole("button", { name: "Create lead" }).click();
  await expect(dialog).not.toBeVisible();
  const detail = page.getByRole("article", { name: "Jordan Lee lead" });
  await expect(detail).toContainText("Bathroom remodel");
  await expect(detail.getByRole("link", { name: input.email })).toBeVisible();
  await expect(
    detail.getByRole("link", { name: "+19195550123" }),
  ).toBeVisible();
  await expect(detail).toContainText("Dashboard");
  await page.reload();
  await expect(detail).toBeVisible();
});

cloudTest(
  "manual lead intake saves contact and lead together",
  async ({ company, page, request }) => {
    const origin = { Origin: "http://localhost:3100" };
    expect(
      (
        await request.post("/api/leads/manual", {
          headers: origin,
          data: input,
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await page.request.post("/api/auth", {
          headers: origin,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const invalid = await page.request.post("/api/leads/manual", {
      headers: origin,
      data: { ...input, email: "", phone: "" },
    });
    expect(invalid.status()).toBe(400);
    const response = await page.request.post("/api/leads/manual", {
      headers: origin,
      data: input,
    });
    expect(response.status()).toBe(201);
    const created = await response.json();
    expect(created.lead.contactId).toBe(created.contact.id);
    expect(created.lead.source).toBe("Dashboard");
    const workspace = await (await page.request.get("/api/workspace")).json();
    expect(workspace.contacts).toHaveLength(1);
    expect(workspace.leads).toHaveLength(1);
    expect(workspace.leads[0].contactId).toBe(workspace.contacts[0].id);
  },
);
