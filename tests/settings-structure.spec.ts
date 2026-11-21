import { expect, test } from "@playwright/test";
import {
  businessConfigSchema,
  defaultRoleNavigation,
  defaultRolePermissions,
} from "../lib/business-config-schema";
import {
  canOpenSettings,
  resolveSettingsSection,
  settingsEntries,
} from "../lib/settings-navigation";
import { openSettingsSection } from "./settings-helpers";

test("settings visibility respects individual capabilities and disabled modules", () => {
  const config = businessConfigSchema.parse({
    profile: { name: "Test business" },
    features: {},
    modules: {},
    compliance: {},
    regional: { timezone: "America/New_York" },
    quotePreferences: {},
    navigation: ["Settings"],
    roleNavigation: defaultRoleNavigation(),
    rolePermissions: defaultRolePermissions(),
  });
  config.rolePermissions.office = ["branding.manage", "secrets.manage"];
  const visible = settingsEntries
    .filter((entry) => canOpenSettings(entry, config, "office"))
    .map((entry) => entry.id);
  expect(visible).toContain("brand");
  expect(visible).toContain("secrets");
  expect(visible).not.toContain("company");
  expect(visible).not.toContain("connections");
  expect(visible).not.toContain("organization");
  expect(
    canOpenSettings(
      settingsEntries.find((entry) => entry.id === "stripe")!,
      config,
      "owner",
    ),
  ).toBe(false);
  config.modules.payments = true;
  config.rolePermissions.office = ["connections.manage"];
  expect(
    canOpenSettings(
      settingsEntries.find((entry) => entry.id === "stripe")!,
      config,
      "office",
    ),
  ).toBe(false);
  config.rolePermissions.office.push("payments.manage");
  expect(
    canOpenSettings(
      settingsEntries.find((entry) => entry.id === "stripe")!,
      config,
      "office",
    ),
  ).toBe(true);
});

test("old settings and connection links resolve to focused destinations", () => {
  expect(resolveSettingsSection("#business")).toBe("brand");
  expect(resolveSettingsSection("#account")).toBe("security");
  expect(resolveSettingsSection("#connection-twilio")).toBe("phone");
  expect(resolveSettingsSection("#connection-google-calendar")).toBe(
    "calendar",
  );
});

test("settings search, history and business drafts survive section changes", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings#company");
  await page
    .getByLabel("Company name", { exact: true })
    .fill("Draft company identity");
  await openSettingsSection(page, "Brand & documents");
  await openSettingsSection(page, "Phone & texting");
  const region = page.getByRole("region", {
    name: "Phone & texting",
    exact: true,
  });
  await expect(region).toBeVisible();
  await expect(
    page.getByText("Your unsaved business changes are kept", { exact: false }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page
      .getByRole("navigation", { name: "Settings categories" })
      .getByRole("button", { name: "Brand & documents", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await openSettingsSection(page, "Company details");
  await expect(page.getByLabel("Company name", { exact: true })).toHaveValue(
    "Draft company identity",
  );
  const search = page.getByRole("searchbox", { name: "Search settings" });
  await search.fill("twilio");
  await expect(
    page
      .getByRole("navigation", { name: "Settings categories" })
      .getByRole("button", { name: "Phone & texting", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Settings categories" })
      .getByRole("button", { name: "Company details", exact: true }),
  ).toHaveCount(0);
  await search.clear();
  await openSettingsSection(page, "Company details");
  // Restore the draft so the test can close without an unload confirmation.
  await page
    .getByLabel("Company name", { exact: true })
    .fill("Premium Remodel");
});

test("mobile settings keep connection drafts and fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo?view=Settings#phone");
  await expect(
    page.getByLabel("Settings section", { exact: true }),
  ).toHaveValue("phone");
  await expect(
    page.getByRole("region", { name: "Phone & texting", exact: true }),
  ).toBeVisible();
  await openSettingsSection(page, "Account security");
  await page
    .getByLabel("New password", { exact: true })
    .fill("test-only-unsaved-password");
  await openSettingsSection(page, "Appearance & device");
  await page.getByLabel("Color theme").selectOption("dark");
  await openSettingsSection(page, "Account security");
  await expect(page.getByLabel("New password", { exact: true })).toHaveValue(
    "test-only-unsaved-password",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("New password", { exact: true }).clear();
});

test("each available section opens its supported controls or workspace links", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings");
  const navigation = page.getByRole("navigation", {
    name: "Settings categories",
  });
  const labels = await navigation.getByRole("button").allTextContents();
  for (const label of labels) {
    await openSettingsSection(page, label.trim());
    await expect(
      navigation.getByRole("button", { name: label.trim(), exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator("body")).not.toContainText("Application error");
    await page.getByText("What can I configure here?", { exact: true }).click();
    await expect(
      page.locator("details[open]").getByRole("listitem").first(),
    ).toBeVisible();
  }
});
