import { expect, test } from "@playwright/test";
import {
  customerCompanyDetails,
  customerEmailBusiness,
} from "@/lib/customer-company-details";
import {
  businessConfigSchema,
  defaultRoleNavigation,
  defaultRolePermissions,
} from "@/lib/business-config-schema";
import { renderBusinessEmail } from "@/lib/email-template";
import { defaultOperatingSettings } from "@/lib/operating-settings";
import { demoWorkspace } from "@/lib/demo";
import { settingsEntries } from "@/lib/settings-navigation";
import { openSettingsSection } from "./settings-helpers";

test("legal identity and compliance help destinations reach customer emails with escaped HTML and sensible fallbacks", () => {
  const config = businessConfigSchema.parse({
    profile: {
      name: "QA Remodel",
      email: "office@example.test",
      phone: "9195550100",
    },
    features: {},
    modules: {},
    compliance: {
      legalName: "QA <Legal> LLC",
      helpEmail: "help@example.test",
      helpPhone: "9195550101",
    },
    regional: { timezone: "America/New_York" },
    navigation: ["Settings"],
    roleNavigation: defaultRoleNavigation(),
    rolePermissions: defaultRolePermissions(),
    quotePreferences: {},
  });
  const email = renderBusinessEmail({
    title: "QA",
    message: "Testing",
    preheader: "QA",
    business: customerEmailBusiness(config),
  });
  expect(email.html).toContain("QA &lt;Legal&gt; LLC");
  expect(email.html).toContain("mailto:help@example.test");
  expect(email.text).toContain("9195550101");
  expect(email.html).not.toContain("QA <Legal> LLC");
  config.compliance.legalName = "";
  config.compliance.helpEmail = "";
  config.compliance.helpPhone = "";
  expect(customerCompanyDetails(config)).toEqual({
    legalName: "QA Remodel",
    supportEmail: "office@example.test",
    supportPhone: "9195550100",
  });
  config.profile.email = "";
  expect(customerEmailBusiness(config, "sender@example.test").email).toBe(
    "sender@example.test",
  );
});

test("every settings destination renders on mobile without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo?view=Settings");
  const picker = page.getByLabel("Settings section", { exact: true });
  await expect(picker).toBeVisible();
  const options = await picker.locator("option").evaluateAll((items) =>
    items.map((item) => ({
      id: (item as HTMLOptionElement).value,
      label: item.textContent!.trim(),
    })),
  );
  expect(options).toHaveLength(
    settingsEntries.filter((entry) => !entry.parentId).length,
  );
  for (const { id, label } of options) {
    await openSettingsSection(page, label);
    await expect(picker).toHaveValue(id);
    await expect(page.locator("body")).not.toContainText("Application error");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      label,
    ).toBe(true);
  }
});

test("quote contact changes preserve unrelated custom answers and new contact values populate transferred required fields", async ({
  page,
}) => {
  const settings = defaultOperatingSettings();
  settings.customFields = [
    {
      id: "access",
      label: "Gate access",
      type: "text",
      required: true,
      defaultValue: null,
      options: [],
      targets: ["contact", "quote"],
      transfer: true,
      clientVisible: false,
      archived: false,
    },
    {
      id: "brief",
      label: "Quote brief",
      type: "text",
      required: false,
      defaultValue: null,
      options: [],
      targets: ["quote"],
      transfer: false,
      clientVisible: false,
      archived: false,
    },
  ];
  const w = demoWorkspace();
  w.contacts[0].customValues = { access: "Side gate" };
  await page.addInitScript(
    ({ settings, w }) => {
      localStorage.setItem(
        "servicebuddy-operating-settings-demo-v1",
        JSON.stringify({ settings, revision: 1 }),
      );
      localStorage.setItem("premium-remodel-sample-v1", JSON.stringify(w));
    },
    { settings, w },
  );
  await page.goto("/demo?view=Quotes");
  await page
    .getByRole("button", { name: "New quote", exact: true })
    .first()
    .click();
  const modal = page.getByRole("dialog");
  await modal
    .getByLabel("Quote name", { exact: true })
    .fill("Custom transfer verification");
  await modal
    .getByLabel("Quote brief", { exact: true })
    .fill("Preserve this draft");
  await modal
    .getByRole("combobox", { name: "Find or add a contact" })
    .fill(w.contacts[0].name);
  await modal
    .getByRole("option", { name: new RegExp(w.contacts[0].name) })
    .click();
  await expect(modal.getByLabel("Quote brief", { exact: true })).toHaveValue(
    "Preserve this draft",
  );
  await expect(modal.locator("#quote-field-access")).toHaveValue("Side gate");
  await modal.getByRole("combobox", { name: "Find or add a contact" }).click();
  await modal.getByRole("option", { name: "Add new contact" }).click();
  // New contact and quote fields have separate labels/IDs. Filling the contact field
  // should satisfy the transfer field on the quote without a second manual answer.
  await modal.locator("#new-contact-access").fill("New gate");
  await expect(modal.locator("#quote-field-access")).toHaveValue("New gate");
  await modal.getByLabel("Contact name", { exact: true }).fill("QA New Client");
  await modal.getByLabel("Email", { exact: true }).fill("qa-new@example.test");
  await modal
    .getByRole("button", { name: "Create quote", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("premium-remodel-sample-v1")!),
  );
  const quote = stored.quotes.find(
    (item: { name: string }) => item.name === "Custom transfer verification",
  );
  expect(quote.customValues).toMatchObject({
    access: "New gate",
    brief: "Preserve this draft",
  });
});
