import { randomUUID } from "node:crypto";
import { expect, password, test } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };

cloudTest(
  "contact communication history is private and visible in the contact",
  async ({ company, page }) => {
    const now = new Date().toISOString();
    const contactId = randomUUID();
    const contact = {
      id: contactId,
      firstName: "Casey",
      lastName: "Morgan",
      name: "Casey Morgan",
      email: "casey@example.com",
      phone: "+19195550144",
      zip: "27513",
      address: "14 Oak Street, Cary, NC",
      source: "Test",
      createdAt: now,
      updatedAt: now,
    };
    expect(
      (
        await company.admin.from("remodel_records").insert({
          id: contactId,
          organization_id: company.organizationId,
          kind: "contact",
          project_id: null,
          data: contact,
          updated_at: now,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await company.admin.from("remodel_contact_communications").insert({
          organization_id: company.organizationId,
          contact_id: contactId,
          channel: "email",
          recipient: contact.email,
          subject: "Your quote is ready",
          body: "Please review the attached quote and private client link.",
          related_kind: "quote",
          related_id: randomUUID(),
          provider_id: `test-${randomUUID()}`,
          dedupe_key: `test-${randomUUID()}`,
          sent_at: now,
        })
      ).error,
    ).toBeNull();

    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers: origin,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const response = await api.get(`/api/contacts/${contactId}/communications`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        expect.objectContaining({
          contactId,
          channel: "email",
          status: "sent",
          recipient: contact.email,
          subject: "Your quote is ready",
        }),
      ],
      hasMore: false,
    });

    await page.goto("/?view=Contacts");
    const row = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: contact.name }) });
    await row.getByRole("button", { name: "History" }).click();
    const dialog = page.getByRole("dialog", { name: contact.name });
    await expect(dialog.getByText("Your quote is ready")).toBeVisible();
    await expect(
      dialog.getByText("Please review the attached quote"),
    ).toBeVisible();
  },
);
