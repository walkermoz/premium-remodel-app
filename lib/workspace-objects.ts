type ObjectAction =
  | "add"
  | "addNew"
  | "create"
  | "edit"
  | "findOrAdd"
  | "findOrCreate"
  | "select";

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function defineWorkspaceObject(singular: string, plural: string) {
  return {
    singular,
    plural,
    singularTitle: titleCase(singular),
    pluralTitle: titleCase(plural),
    actions: {
      add: `Add ${singular}`,
      addNew: `Add new ${singular}`,
      create: `Create ${singular}`,
      edit: `Edit ${singular}`,
      findOrAdd: `Find or add a ${singular}`,
      findOrCreate: `Find or create ${singular}`,
      select: `Select ${singular}`,
    } satisfies Record<ObjectAction, string>,
  };
}

/**
 * Canonical workspace nouns and their action labels.
 *
 * Product UI should use these labels when it refers to a saved object. Natural
 * language such as “customer signature” can still describe a person's role.
 */
export const workspaceObjects = {
  contact: defineWorkspaceObject("contact", "contacts"),
  tradeContact: defineWorkspaceObject("trade contact", "trade contacts"),
  lead: defineWorkspaceObject("lead", "leads"),
  quote: defineWorkspaceObject("quote", "quotes"),
  project: defineWorkspaceObject("project", "projects"),
  item: defineWorkspaceObject("item", "items"),
} as const;

export const workspaceActionLabels = {
  websiteLead: {
    contact: workspaceObjects.contact.singularTitle,
    lead: workspaceObjects.lead.singularTitle,
    email: "Confirmation email",
    sms: "Confirmation text",
    team: "Team notification",
    record: "Record",
  },
} as const;
