import { expect, type Page } from "@playwright/test";
import { settingsEntries, settingsRootId } from "@/lib/settings-navigation";

export async function openSettingsSection(page: Page, label: string) {
  await expect(
    page.locator(
      '#settings-section:visible, nav[aria-label="Settings categories"]:visible',
    ),
  ).toHaveCount(1);
  const aliases: Record<string, string> = {
    "Company details": "company",
    "Roles & permissions": "permissions",
  };
  const entry = settingsEntries.find(
    (item) => item.id === aliases[label] || item.label === label,
  );
  if (!entry) throw new Error(`Unknown settings section: ${label}`);
  const root = settingsEntries.find(
    (item) => item.id === settingsRootId(entry.id),
  )!;
  const picker = page.getByLabel("Settings section", { exact: true });
  if (await picker.isVisible()) {
    if ((await picker.inputValue()) !== root.id)
      await picker.selectOption(root.id);
  } else {
    const navigation = page.getByRole("navigation", {
      name: "Settings categories",
    });
    if (root.group === "Advanced") {
      const advanced = navigation.locator("details");
      if (
        !(await advanced.evaluate(
          (element) => (element as HTMLDetailsElement).open,
        ))
      )
        await advanced.locator("summary").click();
    }
    const button = navigation.getByRole("button", {
      name: root.label,
      exact: true,
    });
    if ((await button.getAttribute("aria-current")) !== "page")
      await button.click();
  }
  const subsections = page.getByRole("navigation", {
    name: "Settings subsections",
  });
  if (entry.id !== "connections" && (await subsections.count())) {
    const paneLabel =
      entry.id === "company"
        ? "Company details"
        : entry.id === "permissions"
          ? "Permissions"
          : entry.id === "portal"
            ? "Portal visibility"
            : entry.label;
    const pane = subsections.getByRole("button", {
      name: paneLabel,
      exact: true,
    });
    if ((await pane.getAttribute("aria-current")) !== "page")
      await pane.click();
  }
}
