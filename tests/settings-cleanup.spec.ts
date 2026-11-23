import { expect, test } from "@playwright/test";
import {
  businessConfigSchema,
  defaultRoleNavigation,
  defaultRolePermissions,
} from "@/lib/business-config-schema";
import {
  canOpenSettings,
  settingsEntries,
  settingsNavigationEntries,
  settingsRootId,
  settingsWorkspaceDestination,
} from "@/lib/settings-navigation";
import { openSettingsSection } from "./settings-helpers";

test("grouped settings retain leaf permissions while removing workspace launchers", () => {
  for (const id of [
    "products",
    "team",
    "schedule",
    "intake",
    "automations",
    "messages",
  ])
    expect(settingsEntries.some((entry) => entry.id === id)).toBe(false);
  expect(settingsEntries.filter((entry) => !entry.parentId)).toHaveLength(22);
  expect(settingsEntries).toHaveLength(30);
  const config = businessConfigSchema.parse({
    profile: { name: "QA" },
    features: {},
    modules: {},
    compliance: {},
    regional: { timezone: "America/New_York" },
    quotePreferences: {},
    navigation: ["Settings"],
    roleNavigation: defaultRoleNavigation(),
    rolePermissions: defaultRolePermissions(),
  });
  config.rolePermissions.office = ["branding.manage"];
  expect(
    settingsNavigationEntries(config, "office").map((entry) => entry.id),
  ).toContain("company");
  expect(
    canOpenSettings(
      settingsEntries.find((entry) => entry.id === "company")!,
      config,
      "office",
    ),
  ).toBe(false);
  expect(
    canOpenSettings(
      settingsEntries.find((entry) => entry.id === "brand")!,
      config,
      "office",
    ),
  ).toBe(true);
  expect(settingsRootId("brand")).toBe("company");
  expect(settingsRootId("working-hours")).toBe("portal");
  expect(settingsRootId("phone")).toBe("connections");
  expect(settingsRootId("access")).toBe("permissions");
});

test("every retained settings editor remains reachable at phone width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/demo?view=Settings");
  for (const entry of settingsEntries) {
    await openSettingsSection(page, entry.label);
    await expect(
      page.getByLabel("Settings section", { exact: true }),
    ).toHaveValue(settingsRootId(entry.id));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      entry.id,
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("legacy shortcut URLs open their real workspace tabs and enforce role access", async ({
  page,
}) => {
  for (const id of ["products", "team", "schedule", "intake", "automations"]) {
    const view = settingsWorkspaceDestination(id)!;
    await page.goto(`/demo?view=Settings#${id}`);
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("view") === view && !url.hash,
    );
  }
  await page.goto("/demo?as=doorknocker&view=Settings#products");
  await expect(
    page.getByText("This workspace is unavailable for your role", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/view=Settings/);
});

test("company integrations open their actual editors and old message links reach templates", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings#connections");
  await expect(
    page.getByRole("region", { name: "Company email", exact: true }),
  ).toBeVisible();
  const subsections = page.getByRole("navigation", {
    name: "Settings subsections",
  });
  await expect(
    subsections.getByRole("button", {
      name: "My Google Calendar",
      exact: true,
    }),
  ).toHaveCount(0);
  await subsections
    .getByRole("button", { name: "Phone & texting", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Phone & texting", exact: true }),
  ).toBeVisible();
  await page.goto("/demo?view=Settings#messages");
  await expect(
    page.getByLabel("Lead acknowledgement subject", { exact: true }),
  ).toBeVisible();
  await openSettingsSection(page, "Working hours");
  await expect(
    page
      .getByRole("navigation", { name: "Settings categories" })
      .getByRole("button", { name: "Customer portal", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("grouped controls remain readable in dark mode", async ({ page }) => {
  await page.goto("/demo?view=Settings#connections");
  await page
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click();
  const button = page
    .getByRole("navigation", { name: "Settings subsections" })
    .getByRole("button", { name: "Phone & texting", exact: true });
  const colors = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    return { foreground: style.color, background: style.backgroundColor };
  });
  const luminance = (color: string) => {
    const rgb = color
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number)
      .map((value) => {
        const channel = value / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const foreground = luminance(colors.foreground),
    background = luminance(colors.background);
  expect(
    (Math.max(foreground, background) + 0.05) /
      (Math.min(foreground, background) + 0.05),
  ).toBeGreaterThanOrEqual(4.5);
});
