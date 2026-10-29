import type { BusinessConfig } from "./business-config-schema";
import type { NavigationPage } from "./business-config-schema";
import type { WorkspaceGroup } from "./types";
import type { EntityKind, Workspace } from "./types";

const recordTabs: Record<EntityKind, NavigationPage[]> = {
  project: ["Overview", "Projects", "Quotes", "Upcoming"],
  quote: ["Overview", "Projects", "Quotes", "Leads"],
  task: ["Overview", "Projects", "Upcoming"],
  contractor: ["Projects", "Quotes", "Contractors"],
  scope: ["Projects", "Quotes"],
  comment: ["Projects", "Quotes"],
  attachment: ["Projects", "Quotes"],
  activity: ["Overview", "Projects", "Quotes"],
  alert: ["Settings"],
  contact: ["Contacts", "Leads", "Quotes", "Door knocking"],
  lead: ["Overview", "Leads", "Quotes", "Door knocking"],
  door_visit: ["Door knocking"],
};
const recordEditTabs: Record<EntityKind, NavigationPage[]> = {
  project: ["Projects"],
  quote: ["Quotes"],
  task: ["Projects", "Upcoming"],
  contractor: ["Contractors", "Projects", "Quotes"],
  scope: ["Projects", "Quotes"],
  comment: ["Projects", "Quotes"],
  attachment: ["Projects", "Quotes"],
  activity: ["Projects", "Quotes"],
  alert: ["Settings"],
  contact: ["Contacts", "Leads", "Quotes"],
  lead: ["Leads"],
  door_visit: ["Door knocking"],
};

export function canOpenWorkspaceTab(
  config: BusinessConfig,
  group: WorkspaceGroup,
  page: NavigationPage | "Activity",
): boolean {
  const tab = page === "Activity" ? "Overview" : page;
  if (tab === "Settings") return true;
  if (!config.navigation.includes(tab)) return false;
  if (!config.roleNavigation[group].includes(tab)) return false;
  if (tab === "Door knocking") return config.features.doorKnocking;
  if (tab === "Price book") return config.features.priceBook;
  if (tab === "Generate") return config.features.imageGeneration;
  return true;
}

export function canAccessWorkspaceRecord(
  config: BusinessConfig,
  group: WorkspaceGroup,
  kind: EntityKind,
): boolean {
  return recordTabs[kind].some((tab) =>
    canOpenWorkspaceTab(config, group, tab),
  );
}

export function canEditWorkspaceRecord(
  config: BusinessConfig,
  group: WorkspaceGroup,
  kind: EntityKind,
): boolean {
  return recordEditTabs[kind].some((tab) =>
    canOpenWorkspaceTab(config, group, tab),
  );
}

export function filterWorkspaceForTabs(
  workspace: Workspace,
  config: BusinessConfig,
  group: WorkspaceGroup,
): Workspace {
  const result = { ...workspace };
  const collections: Array<[EntityKind, keyof Workspace]> = [
    ["project", "projects"],
    ["quote", "quotes"],
    ["task", "tasks"],
    ["contractor", "contractors"],
    ["scope", "scope"],
    ["comment", "comments"],
    ["attachment", "attachments"],
    ["activity", "activities"],
    ["contact", "contacts"],
    ["lead", "leads"],
    ["door_visit", "doorVisits"],
  ];
  for (const [kind, key] of collections) {
    if (!canAccessWorkspaceRecord(config, group, kind))
      Object.assign(result, { [key]: [] });
  }
  return result;
}
