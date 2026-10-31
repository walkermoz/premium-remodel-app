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
  await customer.getByRole("button", { name: "History" }).click();
  const history = page.getByRole("dialog", { name: "Taylor Reed" });
  await expect(history.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(history.getByText("Text sent")).toBeVisible();
  await expect(history.getByText("Email sent")).toBeVisible();
  await expect(history.getByText(/schedule a visit/)).toBeVisible();
  await history.getByRole("button", { name: "Email" }).click();
  await expect(history.getByText("Text sent")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await history.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await customer.getByRole("button", { name: "New quote" }).click();
  const quote = page.getByRole("dialog", { name: "New quote" });
  await expect(quote.getByLabel("Find or add a contact")).toHaveValue(
    "Taylor Reed",
  );
  await expect(quote.getByLabel("Email")).toHaveValue("taylor@example.com");
  await expect(quote.getByLabel("Customer name")).toHaveAttribute(
    "readonly",
    "",
  );
  await expect(quote.getByLabel("Linked lead")).toHaveCount(0);
  await quote.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Add customer" }).click();
  const contact = page.getByRole("dialog", { name: "New customer contact" });
  await contact.getByLabel("First name").fill("Morgan");
  await contact.getByLabel("Last name").fill("Lane");
  await contact.getByLabel("Address").fill("7 Maple Street, Cary, NC");
  await contact
    .getByRole("button", { name: "Create customer contact" })
    .click();
  await expect(contact.getByRole("alert")).toContainText(
    "Enter an email address or phone number.",
  );
  await contact.getByLabel("Phone").fill("9195550188");
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
  const picker = newQuote.getByLabel("Find or add a contact");
  await picker.click();
  const contactOptions = newQuote.getByRole("listbox", {
    name: "Customer contacts",
  });
  await expect(contactOptions.getByRole("option").first()).toContainText(
    "Add new contact",
  );
  await picker.fill("Morgan");
  await contactOptions.getByRole("option", { name: /Morgan Lane/ }).click();
  await expect(newQuote.getByLabel("Customer name")).toHaveValue("Morgan Lane");
  await expect(newQuote.getByLabel("Phone")).toHaveValue("9195550188");
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

test("a new quote creates one customer contact and uses it for the quote", async ({
  page,
}) => {
  await page.goto("/demo?view=Quotes");
  await page.getByRole("button", { name: "New quote" }).first().click();
  const quote = page.getByRole("dialog", { name: "New quote" });

  await expect(quote.getByLabel("Find or add a contact")).toHaveValue(
    "Add new contact",
  );
  await quote.getByLabel("Quote name").fill("Avery's bathroom");
  await quote.getByLabel("Customer name").fill("Avery Stone");
  await quote.getByLabel("Email").fill("avery@example.com");
  await quote.getByLabel("Address").fill("18 Oak Street, Raleigh, NC");
  await quote.getByRole("button", { name: "Create quote" }).click();
  await expect(quote).toBeHidden();

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("premium-remodel-sample-v1") || "{}"),
  );
  const createdContact = saved.contacts.find(
    (item: { email: string }) => item.email === "avery@example.com",
  );
  const createdQuote = saved.quotes.find(
    (item: { name: string }) => item.name === "Avery's bathroom",
  );
  expect(createdContact).toMatchObject({
    name: "Avery Stone",
    email: "avery@example.com",
    phone: "",
    address: "18 Oak Street, Raleigh, NC",
  });
  expect(createdQuote).toMatchObject({
    contactId: createdContact.id,
    client: "Avery Stone",
    clientEmail: "avery@example.com",
    address: "18 Oak Street, Raleigh, NC",
  });
});
