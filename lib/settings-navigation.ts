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
  workspace?: NavigationPage;
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
    label: "Company details",
    description:
      "The company identity used throughout your workspace and quotes.",
    questions: [
      "What company name, website, email and phone should customers see?",
      "Should address suggestions prioritize Wake County or search nationwide?",
    ],
    capabilities: ["business.manage"],
    businessTab: "details",
  },
  {
    id: "brand",
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
    id: "products",
    group: "Business",
    label: "Products & services",
    description:
      "Manage reusable labor, materials and contractor pricing in your price book.",
    questions: [
      "Which items and prices should your team reuse?",
      "What costs, units and descriptions should each item include?",
    ],
    capabilities: ["pricebook.manage"],
    module: "priceBook",
    workspace: "Price book",
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
    id: "team",
    group: "Team",
    label: "Manage team",
    description: "Invite people and manage existing workspace members.",
    questions: [
      "Who needs access to this business?",
      "What name, contact information and role should each member have?",
    ],
    capabilities: ["team.manage"],
    workspace: "Team",
  },
  {
    id: "access",
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
    label: "Roles & permissions",
    description: "Control which actions each role can manage.",
    questions: [
      "Who can manage company settings, money, templates and connections?",
      "Who can see costs, signing tools and audit history?",
    ],
    capabilities: ["permissions.manage"],
    businessTab: "permissions",
  },
  {
    id: "schedule",
    group: "Team",
    label: "Schedule & availability",
    description: "Manage scheduled work and connect your own Google Calendar.",
    questions: [
      "When is work scheduled, and who is assigned?",
      "Which personal Google Calendar should receive your assigned tasks?",
    ],
    workspace: "Upcoming",
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
    capabilities: ["business.manage", "branding.manage", "quotes.manage"],
  },
  {
    id: "intake",
    group: "Customers",
    label: "Requests & booking",
    description:
      "Manage leads and schedule consultations using the existing intake tools.",
    questions: [
      "What project, contact information and notes has the customer provided?",
      "When should your team schedule the consultation?",
    ],
    workspace: "Leads",
  },
  {
    id: "messages",
    group: "Customers",
    label: "Messages & notifications",
    description:
      "Configure company communication providers and the workflows that deliver messages.",
    questions: [
      "Which company email and phone number should send messages?",
      "Who should receive each workflow notification, and when should it run?",
    ],
    capabilities: [
      "connections.manage",
      "workflows.manage",
      "compliance.manage",
    ],
  },
  {
    id: "automations",
    group: "Customers",
    label: "Automations",
    description:
      "Reuse the workflow editor for triggers, branches, recipients and delivery results.",
    questions: [
      "What event should trigger the workflow?",
      "What conditions, recipients and actions should apply?",
    ],
    capabilities: ["workflows.manage"],
    module: "automations",
    workspace: "Automation",
  },
  {
    id: "connections",
    group: "Connections",
    label: "Connected accounts",
    description:
      "Open the company or personal connection you want to configure.",
    questions: [
      "Which provider needs setup or reconnection?",
      "Is this a company account or your own calendar?",
    ],
    capabilities: ["connections.manage"],
  },
  {
    id: "email",
    group: "Connections",
    label: "Company email",
    description: "Connect the Google account used to send company email.",
    questions: ["Which Google account should send company email?"],
    capabilities: ["connections.manage"],
  },
  {
    id: "phone",
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
    group: "Workspace",
    label: "Workflow secrets",
    description: "Manage encrypted credentials used by workflows.",
    questions: ["Which credentials do your workflow actions require?"],
    capabilities: ["secrets.manage"],
  },
  {
    id: "api-keys",
    group: "Workspace",
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
    group: "Workspace",
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
    group: "Team",
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
  if (
    entry.workspace &&
    !config.roleNavigation[group].includes(entry.workspace)
  )
    return false;
  return true;
}

const legacySections: Record<string, string> = {
  business: "brand",
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
