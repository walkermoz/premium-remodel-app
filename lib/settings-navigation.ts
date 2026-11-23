import type {
  BusinessConfig,
  OrganizationCapability,
  NavigationPage,
} from "./business-config-schema";
import type { WorkspaceGroup } from "./types";

export type BusinessSettingsTab =
  | "brand"
  | "details"
  | "modules"
  | "compliance"
  | "quotes"
  | "access"
  | "permissions";
type SettingsEntry = {
  id: string;
  group: string;
  label: string;
  description: string;
  questions: string[];
  scope?: "personal";
  capabilities?: OrganizationCapability[];
  module?: keyof BusinessConfig["modules"];
  businessTab?: BusinessSettingsTab;
  parentId?: string;
  ownerOnly?: boolean;
};

// One catalog drives navigation, search, mobile options and section guidance.
// Provider setup stays in its existing editor; workspace links reuse real tools.
export const settingsEntries: SettingsEntry[] = [
  {
    id: "setup",
    group: "Get started",
    label: "Setup checklist",
    description: "Check the connections and defaults your business needs.",
    questions: [
      "Are your company details complete?",
      "Are email, phone, payments and calendar ready?",
    ],
    capabilities: ["connections.manage"],
  },
  {
    id: "company",
    group: "Business",
    label: "Company",
    description:
      "Company details, branding, legal information and regional preferences.",
    questions: [
      "What company name, website, email and phone should customers see?",
      "Should address suggestions prioritize Wake County or search nationwide?",
    ],
    capabilities: ["business.manage"],
    businessTab: "details",
  },
  {
    id: "brand",
    parentId: "company",
    group: "Business",
    label: "Brand & documents",
    description: "Your logos, workspace identity and customer portal banner.",
    questions: [
      "Which primary logo, reversed logo and square mark should we use?",
      "What banner should appear in the customer portal?",
    ],
    capabilities: ["branding.manage"],
    businessTab: "brand",
  },

  {
    id: "modules",
    group: "Business",
    label: "Modules",
    description: "Choose the product areas this organization uses.",
    questions: [
      "Which optional tools should this business enable?",
      "Who should have access after a tool is enabled?",
    ],
    capabilities: ["business.manage"],
    businessTab: "modules",
  },
  {
    id: "compliance",
    parentId: "company",
    group: "Business",
    label: "Compliance & region",
    description:
      "Legal identity, messaging policies, offline payment instructions and regional defaults.",
    questions: [
      "What legal name, terms, privacy policy and SMS help details apply?",
      "Who are checks payable to, and where should customers mail them?",
      "Which timezone, locale and service area should the workspace use?",
    ],
    capabilities: ["business.manage", "compliance.manage"],
    businessTab: "compliance",
  },

  {
    id: "access",
    parentId: "permissions",
    group: "Team",
    label: "Navigation by role",
    description: "Choose and order the workspace tabs each role sees.",
    questions: [
      "Which workspace areas should each role see?",
      "In what order should those areas appear?",
    ],
    capabilities: ["permissions.manage"],
    businessTab: "access",
  },
  {
    id: "permissions",
    group: "Team",
    label: "Roles & access",
    description: "Choose the workspace tabs and actions each role can access.",
    questions: [
      "Who can manage company settings, money, templates and connections?",
      "Who can see costs, signing tools and audit history?",
    ],
    capabilities: ["permissions.manage"],
    businessTab: "permissions",
  },

  {
    id: "quotes",
    group: "Work",
    label: "Quotes & payments",
    description:
      "Quote editor tools, customer price detail and online payment method.",
    questions: [
      "Should quotes show internal costs and the price-book picker?",
      "Should customers see item prices or just the project total?",
      "Should online payment links use Stripe or manual payments only?",
    ],
    capabilities: ["business.manage"],
    businessTab: "quotes",
  },
  {
    id: "agreements",
    group: "Work",
    label: "Agreement templates",
    description:
      "Reusable organization-owned agreement documents and signing setup.",
    questions: [
      "What agreement text and signing fields should each template contain?",
      "Which documents should your team reuse?",
    ],
    capabilities: ["agreements.manage"],
    module: "agreements",
  },
  {
    id: "quote-flows",
    group: "Work",
    label: "Quote & agreement flows",
    description:
      "Build and publish the stages from quote approval through project creation.",
    questions: [
      "Which documents, questions and signatures are required?",
      "Which published flow should be the organization default?",
    ],
    capabilities: ["quote_flows.manage"],
    module: "agreements",
  },
  {
    id: "portal",
    group: "Customers",
    label: "Customer portal",
    description:
      "Choose which schedules, documents, invoices, payments and requests customers can access.",
    questions: [
      "Which portal sections and schedule times should customers see?",
      "What branding and price detail should customers see?",
      "Which quote or project portal link should you share?",
    ],
    capabilities: ["business.manage"],
  },

  {
    id: "connections",
    group: "Connections",
    label: "Connected accounts",
    description:
      "Configure the company email, texting, payments and Google Business Profile accounts.",
    questions: [
      "Which provider needs setup or reconnection?",
      "Which company account should send messages or process payments?",
    ],
    capabilities: ["connections.manage"],
  },
  {
    id: "email",
    parentId: "connections",
    group: "Connections",
    label: "Company email",
    description: "Connect the Google account used to send company email.",
    questions: ["Which Google account should send company email?"],
    capabilities: ["connections.manage"],
  },
  {
    id: "phone",
    parentId: "connections",
    group: "Connections",
    label: "Phone & texting",
    description:
      "Configure the shared Twilio account and company texting number.",
    questions: [
      "Which Twilio account and existing phone number should this business use?",
    ],
    capabilities: ["connections.manage"],
  },
  {
    id: "reviews",
    parentId: "connections",
    group: "Connections",
    label: "Google reviews",
    description:
      "Connect the Google account that manages your business profile.",
    questions: [
      "Which Google account and business location should supply the reviews?",
    ],
    capabilities: ["connections.manage"],
  },
  {
    id: "stripe",
    parentId: "connections",
    group: "Connections",
    label: "Stripe payments",
    description: "Configure the Stripe connection used by this organization.",
    questions: ["Which Stripe account should process customer payments?"],
    capabilities: ["connections.manage"],
    module: "payments",
  },
  {
    id: "alerts",
    group: "Workspace",
    label: "Company alerts",
    description: "Create and remove notices shown to workspace roles.",
    questions: [
      "What notice should your team see, and which roles should see it?",
    ],
    capabilities: ["alerts.manage"],
  },
  {
    id: "history",
    group: "Workspace",
    label: "Workspace history",
    description: "Review the organization's existing audit history.",
    questions: ["Who changed a record, and when?"],
    capabilities: ["audit.view"],
  },
  {
    id: "generation",
    group: "Workspace",
    label: "AI tools",
    description: "Choose the existing generation settings for this business.",
    questions: ["Which model and generation defaults should the team use?"],
    capabilities: ["generation.manage"],
    module: "imageGeneration",
  },
  {
    id: "secrets",
    group: "Advanced",
    label: "Workflow secrets",
    description: "Manage encrypted credentials used by workflows.",
    questions: ["Which credentials do your workflow actions require?"],
    capabilities: ["secrets.manage"],
  },
  {
    id: "api-keys",
    group: "Advanced",
    label: "Developer API access",
    description:
      "Create and revoke organization API keys using the existing key manager.",
    questions: [
      "Which integration needs API access, and when should that access end?",
    ],
    capabilities: ["api_keys.manage"],
  },
  {
    id: "organization",
    group: "Advanced",
    label: "Organization",
    description: "Owner-only organization lifecycle controls.",
    questions: ["Do you need to archive or restore this business?"],
    ownerOnly: true,
  },
  {
    id: "security",
    group: "My account",
    label: "Account security",
    description: "Change your own password and secure your account.",
    questions: ["What new password should protect your account?"],
    scope: "personal",
  },
  {
    id: "calendar",
    group: "My account",
    label: "My Google Calendar",
    description: "Connect your own calendar for assigned work.",
    questions: [
      "Which Google account and calendar should receive your assigned tasks?",
    ],
    scope: "personal",
  },
  {
    id: "appearance",
    group: "My account",
    label: "Appearance & device",
    description: "Your display preferences and app installation.",
    questions: [
      "Which theme should this device use?",
      "Would you like to install the app?",
    ],
    scope: "personal",
  },
  {
    id: "working-hours",
    parentId: "portal",
    group: "Customers",
    label: "Working hours",
    description:
      "Business hours and holiday information shown in the customer portal.",
    questions: [
      "When is the business open?",
      "Which holiday hours should customers see in the portal?",
    ],
    capabilities: ["business.manage"],
  },
  {
    id: "custom-fields",
    group: "Business",
    label: "Custom fields",
    description: "Reusable typed fields on contacts, quotes and projects.",
    questions: [
      "Which fields are required, transferred between records or customer-visible?",
    ],
    capabilities: ["business.manage"],
  },
  {
    id: "forms",
    group: "Work",
    label: "Reusable forms",
    description:
      "Project form templates, questions and completion requirements.",
    questions: [
      "What should the crew collect, and which forms must be complete before closeout?",
    ],
    capabilities: ["business.manage"],
  },
  {
    id: "invoice-defaults",
    group: "Work",
    label: "Invoice defaults",
    description: "Titles, deposit terms and notes for new contract invoices.",
    questions: [
      "What deposit percentage and due period should new agreements use?",
      "What note should the customer see?",
    ],
    capabilities: ["business.manage"],
  },
  {
    id: "message-templates",
    group: "Customers",
    label: "Message templates",
    description:
      "Quote email, lead acknowledgement and schedule text defaults.",
    questions: [
      "What should new customer messages say?",
      "Which supported variables should personalize them?",
    ],
    capabilities: ["business.manage"],
  },
];

export function canOpenSettings(
  entry: SettingsEntry,
  config: BusinessConfig,
  group: WorkspaceGroup,
) {
  if (entry.ownerOnly && group !== "owner") return false;
  if (entry.module && !config.modules[entry.module]) return false;
  if (
    entry.capabilities &&
    group !== "owner" &&
    !entry.capabilities.some((capability) =>
      config.rolePermissions[group].includes(capability),
    )
  )
    return false;
  if (
    entry.id === "stripe" &&
    group !== "owner" &&
    !config.rolePermissions[group].includes("payments.manage")
  )
    return false;
  return true;
}

const legacySections: Record<string, string> = {
  business: "brand",
  messages: "message-templates",
  workspace: "appearance",
  account: "security",
  "connection-google-mail": "email",
  "connection-google-business": "reviews",
  "connection-twilio": "phone",
  "connection-stripe": "stripe",
  "connection-google-calendar": "calendar",
  "connection-openrouter": "generation",
  "connection-secrets": "secrets",
};
export function resolveSettingsSection(value: string) {
  const raw = value.replace(/^#/, "");
  return legacySections[raw] || raw;
}

/** Canonical settings remain addressable for OAuth, search and existing links.
 * Only roots appear in the sidebar; child editors retain their own permissions. */
export function settingsRootId(id: string) {
  return settingsEntries.find((entry) => entry.id === id)?.parentId || id;
}
export function settingsNavigationEntries(
  config: BusinessConfig,
  group: WorkspaceGroup,
) {
  return settingsEntries.filter(
    (entry) =>
      !entry.parentId &&
      (canOpenSettings(entry, config, group) ||
        settingsEntries.some(
          (child) =>
            child.parentId === entry.id &&
            canOpenSettings(child, config, group),
        )),
  );
}
export function settingsWorkspaceDestination(
  value: string,
): NavigationPage | undefined {
  const id = value.replace(/^#/, "");
  return (
    {
      products: "Price book",
      team: "Team",
      schedule: "Upcoming",
      intake: "Leads",
      automations: "Automation",
    } as Record<string, NavigationPage>
  )[id];
}
