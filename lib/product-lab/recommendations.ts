import type { ProductRecommendationDraft } from "./types";

const sharedSpec = {
  permissions: "Organization-configurable roles with explicit audit history",
  tenancy: "All business records remain organization-scoped",
  rollout:
    "Preview, synthetic organization, Premium Remodel regression, then an organization-aware flag",
  observability:
    "Track completion, failure, adoption, support burden, and rollback state",
};

export function initialProductRecommendations(): ProductRecommendationDraft[] {
  return [
    {
      title: "Unified scheduling and dispatch board",
      problem:
        "Office and field teams cannot yet plan capacity, assignments, routes, and arrival status in one coherent journey.",
      outcome:
        "A dispatcher can schedule and reassign work quickly while field users receive an unambiguous daily plan.",
      evidence:
        "Scheduling, project items, team locations, and field workflows exist, but the end-to-end dispatch journey remains partial.",
      competitorGap:
        "Jobber and ServiceTitan make dispatch a primary daily operating surface.",
      integration:
        "Build on projects, items, contacts, team availability, calendar events, notifications, and the ServiceBuddy field app.",
      value: "High",
      effort: "Large",
      risk: "Medium",
      confidence: "High",
      spec: {
        ...sharedSpec,
        objects: ["project", "item", "team_member", "schedule_entry"],
        surfaces: ["workspace", "field_app", "notifications"],
        nonGoals: [
          "Payroll",
          "automatic route optimization in the first release",
        ],
      },
    },
    {
      title: "Invoice follow-up and payment reminders",
      problem:
        "Signed work can create an invoice, but teams still need a clear, configurable path from milestone due to payment received.",
      outcome:
        "Organizations collect deposits and milestone payments faster without manually chasing every customer.",
      evidence:
        "Quotes, documents, deposits, invoices, Stripe, email, SMS, and workflows already provide the required foundations.",
      competitorGap:
        "Jobber and ServiceTitan both turn invoice reminders into a standard operational workflow.",
      integration:
        "Add invoice lifecycle events and reusable reminder templates to the existing workflow engine and client portal.",
      value: "High",
      effort: "Medium",
      risk: "Medium",
      confidence: "High",
      spec: {
        ...sharedSpec,
        objects: ["invoice", "payment_milestone", "contact", "communication"],
        surfaces: ["workspace", "client_portal", "email", "sms"],
        nonGoals: ["Collections agency services", "financing underwriting"],
      },
    },
    {
      title: "Reusable online booking intake",
      problem:
        "Website leads enter ServiceBuddy, but organizations cannot yet publish a configurable booking experience with service rules and availability.",
      outcome:
        "A qualified customer can request or reserve the right appointment without back-and-forth data entry.",
      evidence:
        "Public webhooks, lead intake, contacts, consent, calendars, and automation are already modular platform capabilities.",
      competitorGap:
        "Online booking is a polished acquisition path in Jobber and Topline Pro.",
      integration:
        "Create an organization-owned booking form definition that emits existing lead and scheduling events.",
      value: "High",
      effort: "Medium",
      risk: "Low",
      confidence: "High",
      spec: {
        ...sharedSpec,
        objects: ["form", "lead", "contact", "schedule_entry"],
        surfaces: ["public_form", "workspace", "email", "sms"],
        nonGoals: ["Replacing an organization's website builder"],
      },
    },
    {
      title: "Budget versus actual job costing",
      problem:
        "Cost-first quotes establish expected margin, but teams cannot consistently compare it with actual labor, material, and trade spend during delivery.",
      outcome:
        "Owners see margin drift early and learn which price-book items need correction.",
      evidence:
        "The quote system already captures sub, material, time-based, overhead, and customer pricing inputs.",
      competitorGap:
        "ServiceTitan provides deeper operational job-cost visibility than ServiceBuddy currently offers.",
      integration:
        "Preserve quote cost snapshots and add actual cost entries, variance events, permissions, and reporting.",
      value: "High",
      effort: "Large",
      risk: "Medium",
      confidence: "High",
      spec: {
        ...sharedSpec,
        objects: ["quote_revision", "project", "item", "actual_cost"],
        surfaces: ["workspace", "reporting", "workflow_events"],
        nonGoals: [
          "General ledger accounting",
          "inventory purchasing in the first release",
        ],
      },
    },
  ];
}
