import { expect, test } from "@playwright/test";

test("customer contacts are separate from trades and fill new quotes", async ({
  page,
}) => {
  await page.goto("/demo?view=Contacts");
  await expect(page.getByRole("heading", { name: "Contacts." })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Trade contacts", exact: true }),
  ).toBeVisible();
  const customer = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Taylor Reed" }) });
  await expect(customer).toContainText("taylor@example.com");
  await expect(customer).toContainText("1214 Willowbrook Drive");
  await customer.getByRole("button", { name: "New quote" }).click();
  const quote = page.getByRole("dialog", { name: "New quote" });
  await expect(quote.getByLabel("Customer contact")).toHaveValue(
    "00000000-0000-4000-8000-000000000101",
  );
  await expect(quote.getByLabel("Client email")).toHaveValue(
    "taylor@example.com",
  );
  await expect(quote.getByLabel("Linked lead")).toHaveCount(0);
  await quote.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Add customer" }).click();
  const contact = page.getByRole("dialog", { name: "New customer contact" });
  await contact.getByLabel("First name").fill("Morgan");
  await contact.getByLabel("Last name").fill("Lane");
  await contact.getByLabel("Email").fill("morgan@example.com");
  await contact.getByLabel("Phone").fill("9195550188");
  await contact.getByLabel("Address").fill("7 Maple Street, Cary, NC");
  await contact
    .getByRole("button", { name: "Create customer contact" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Morgan Lane" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Quotes", exact: true }).click();
  await page
    .getByRole("button", { name: /New quote/i })
    .first()
    .click();
  const newQuote = page.getByRole("dialog", { name: "New quote" });
  await newQuote
    .getByLabel("Customer contact")
    .selectOption({ label: "Morgan Lane · morgan@example.com" });
  await expect(newQuote.getByLabel("Client name")).toHaveValue("Morgan Lane");
  await expect(newQuote.getByLabel("Client phone")).toHaveValue("9195550188");
  await expect(newQuote.getByLabel("Address")).toHaveValue(
    "7 Maple Street, Cary, NC",
  );
  await newQuote.getByLabel("Quote name").fill("Morgan's kitchen update");
  await newQuote.getByRole("button", { name: "Create quote" }).click();
  await expect(newQuote).toBeHidden();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("premium-remodel-sample-v1") || "{}"),
  );
  const newContact = saved.contacts.find(
    (item: { name: string }) => item.name === "Morgan Lane",
  );
  const createdQuote = saved.quotes.find(
    (item: { name: string }) => item.name === "Morgan's kitchen update",
  );
  expect(createdQuote.contactId).toBe(newContact.id);
  expect(createdQuote.leadId).toBeUndefined();
});
