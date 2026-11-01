import {
  workflowDefinitionSchema,
  type WorkflowCondition,
  type WorkflowDefinition,
  type WorkflowOperand,
} from "./schema";

const ref = (path: string): WorkflowOperand => ({ kind: "reference", path });
const literal = (value: string | number | boolean | null): WorkflowOperand => ({
  kind: "literal",
  value,
});
const comparison = (
  path: string,
  operator: Extract<WorkflowCondition, { kind: "comparison" }>["operator"],
  right?: WorkflowOperand,
): WorkflowCondition => ({
  kind: "comparison",
  left: { kind: "reference", path },
  operator,
  ...(right ? { right } : {}),
});

const discordLeadRequestBody = JSON.stringify(
  {
    username: "Premium Remodel Bot",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: "🔔 New Lead - Premium Living Home Improvement",
        description:
          "🔥 New inbound lead ready for follow-up\n\n**Name**\n{{event.payload.name}}\n\n**Email**\n{{event.payload.email}}\n\n**Phone**\n{{event.payload.phone}}\n\n**Address**\n{{event.payload.address}}, {{event.payload.zip}}\n\n**Project**\n{{event.payload.project}}\n\n**Project description**\n{{event.payload.description}}",
        color: 3066993,
        footer: { text: "Premium Remodel Lead Intake" },
        timestamp: "{{event.occurredAt}}",
      },
    ],
  },
  null,
  2,
);

export type WebsiteLeadSeedOptions = {
  name?: string;
  sourceLabel?: string;
  initialStage?: "New" | "Follow-up";
  initialDisposition?: "Active" | "Future" | "Test";
  matchExistingContacts?: boolean;
  sendAcknowledgement?: boolean;
  sendSmsAcknowledgement?: boolean;
  sendTeamNotification?: boolean;
};

export function websiteLeadWorkflowSeed(
  options: WebsiteLeadSeedOptions = {},
): WorkflowDefinition {
  const source = options.sourceLabel || "Website form";
  const stage = options.initialStage || "New";
  const disposition = options.initialDisposition || "Active";
  return workflowDefinitionSchema.parse({
    graph: {
      schemaVersion: 1,
      primaryObjectType: "lead",
      entryNodeIds: ["website-form"],
      nodes: [
        {
          id: "website-form",
          type: "trigger.websiteFormSubmitted",
          kind: "trigger",
          name: "Website form submitted",
          config: { eventType: "website.form.submitted" },
          outgoing: [
            {
              id: "website-contact",
              to: "find-contact",
              label: "Capture",
              order: 0,
            },
          ],
        },
        {
          id: "find-contact",
          type: "action.findOrCreateContact",
          kind: "action",
          name: "Find or create Contact",
          outputAlias: "contactResult",
          config: {
            matchFields: ["email", "phone"],
            email: ref("event.payload.email"),
            phone: ref("event.payload.phone"),
            multipleMatch: "latest",
            matchExisting: options.matchExistingContacts ?? true,
            fields: {
              firstName: ref("event.payload.firstName"),
              lastName: ref("event.payload.lastName"),
              name: ref("event.payload.name"),
              email: ref("event.payload.email"),
              phone: ref("event.payload.phone"),
              address: ref("event.payload.address"),
              zip: ref("event.payload.zip"),
              source: literal(source),
            },
          },
          outgoing: [
            {
              id: "contact-lead",
              to: "create-lead",
              label: "Contact ready",
              order: 0,
            },
          ],
        },
        {
          id: "create-lead",
          type: "action.createLead",
          kind: "action",
          name: "Create Lead",
          outputAlias: "leadResult",
          config: {
            fields: {
              contactId: ref("outputs.contactResult.contact.id"),
              name: ref("event.payload.name"),
              project: ref("event.payload.project"),
              projectDescription: ref("event.payload.description"),
              source: literal(source),
              status: literal(stage),
              disposition: literal(disposition),
              approvalState: literal("none"),
              submittedAt: ref("event.occurredAt"),
              smsAppointmentOptIn: ref("event.payload.smsAppointmentOptIn"),
              smsMarketingOptIn: ref("event.payload.smsMarketingOptIn"),
              websiteSubmission: ref("event.payload.websiteSubmission"),
              smsConsentEvidence: ref("event.payload.smsConsentEvidence"),
              leadAttribution: ref("event.payload.leadAttribution"),
              otherSubmittedFields: ref("event.payload.otherSubmittedFields"),
            },
          },
          outgoing: [
            {
              id: "lead-router",
              to: "delivery-router",
              label: "Lead created",
              order: 0,
            },
          ],
        },
        {
          id: "delivery-router",
          type: "logic.router",
          kind: "decision",
          name: "Customer and team follow-up",
          config: {},
          outgoing: [
            {
              id: "router-email",
              to: "confirmation-email",
              label: "Email available",
              order: 0,
              kind: "branch",
              condition: comparison("event.payload.email", "isNotEmpty"),
            },
            {
              id: "router-sms",
              to: "sms-policy",
              label: "Appointment texts accepted",
              order: 1,
              kind: "branch",
              condition: {
                kind: "group",
                combinator: "and",
                conditions: [
                  comparison(
                    "event.payload.smsAppointmentOptIn",
                    "equals",
                    literal(true),
                  ),
                  comparison("event.payload.phone", "isNotEmpty"),
                ],
              },
            },
            {
              id: "router-team",
              to: "team-notification",
              label: "Team notification",
              order: 2,
              kind: "always",
            },
          ],
        },
        {
          id: "confirmation-email",
          type: "action.sendEmail",
          kind: "action",
          name: "Send confirmation email",
          config: {
            enabled: options.sendAcknowledgement ?? true,
            templateKey: "website-lead-acknowledgement",
            recipient: ref("event.payload.email"),
            subject: "We received your remodel request",
            body: "Hi {{event.payload.firstName}}, we received your remodel request and will be in touch soon.",
            missingValueBehavior: "blank",
          },
          outgoing: [
            { id: "email-end", to: "end-email", label: "Done", order: 0 },
          ],
        },
        {
          id: "end-email",
          type: "control.end",
          kind: "terminal",
          name: "Email path complete",
          config: { reason: "Email path complete" },
          outgoing: [],
        },
        {
          id: "sms-policy",
          type: "system.smsPolicyGate",
          kind: "action",
          name: "SMS consent and DND policy",
          outputAlias: "smsPolicy",
          config: {
            category: "appointment",
            recipient: ref("event.payload.phone"),
            contactId: ref("outputs.contactResult.contact.id"),
          },
          outgoing: [
            {
              id: "policy-sms",
              to: "confirmation-sms",
              label: "Allowed",
              order: 0,
            },
          ],
        },
        {
          id: "confirmation-sms",
          type: "action.sendSms",
          kind: "action",
          name: "Send confirmation text",
          config: {
            enabled: options.sendSmsAcknowledgement ?? true,
            templateKey: "website-lead-acknowledgement",
            recipient: ref("event.payload.phone"),
            contactId: ref("outputs.contactResult.contact.id"),
            category: "appointment",
            body: "{{organization.name}}: We received your {{event.payload.project}} request. A member of our team will be in touch soon to schedule a visit. STOP to opt out; HELP for help.",
            missingValueBehavior: "fallback",
            fallbackValue: "remodeling",
          },
          outgoing: [{ id: "sms-end", to: "end-sms", label: "Done", order: 0 }],
        },
        {
          id: "end-sms",
          type: "control.end",
          kind: "terminal",
          name: "SMS path complete",
          config: { reason: "SMS path complete" },
          outgoing: [],
        },
        {
          id: "team-notification",
          type: "action.webhook",
          kind: "action",
          name: "Send lead to Discord",
          config: {
            enabled: options.sendTeamNotification ?? true,
            destination: "discord_lead_webhook",
            method: "POST",
            url: "",
            headers: {},
            bodyType: "json",
            body: discordLeadRequestBody,
            missingValueBehavior: "fallback",
            fallbackValue: "Not provided",
            timeoutSeconds: 15,
            saveResponse: false,
            templateKey: "website-lead-team-notification",
          },
          outgoing: [
            { id: "team-end", to: "end-team", label: "Done", order: 0 },
          ],
        },
        {
          id: "end-team",
          type: "control.end",
          kind: "terminal",
          name: "Team path complete",
          config: { reason: "Team path complete" },
          outgoing: [],
        },
      ],
    },
    settings: {
      allowReentry: true,
      concurrencyScope: "event",
      duplicateEventPolicy: "ignore",
      timezone: "America/New_York",
      failureBehavior: "needs_attention",
      tags: ["Lead intake"],
      folder: "Lead management",
    },
    layout: {
      nodes: {
        "website-form": { x: 480, y: 40 },
        "find-contact": { x: 480, y: 190 },
        "create-lead": { x: 480, y: 340 },
        "delivery-router": { x: 480, y: 490 },
        "confirmation-email": { x: 60, y: 680 },
        "sms-policy": { x: 480, y: 680 },
        "confirmation-sms": { x: 480, y: 830 },
        "team-notification": { x: 900, y: 680 },
        "end-email": { x: 60, y: 860 },
        "end-sms": { x: 480, y: 1010 },
        "end-team": { x: 900, y: 860 },
      },
    },
  });
}

export function smsComplianceWorkflowSeed(): WorkflowDefinition {
  return workflowDefinitionSchema.parse({
    graph: {
      schemaVersion: 1,
      primaryObjectType: "communication",
      entryNodeIds: ["inbound-sms"],
      nodes: [
        {
          id: "inbound-sms",
          type: "trigger.inboundSms",
          kind: "trigger",
          name: "Customer sends a text",
          config: { eventType: "sms.inbound.received" },
          outgoing: [
            {
              id: "sms-router",
              to: "keyword-router",
              label: "Verified message",
              order: 0,
            },
          ],
        },
        {
          id: "keyword-router",
          type: "logic.ifElse",
          kind: "decision",
          name: "Recognize compliance keyword",
          config: {},
          outgoing: [
            {
              id: "keyword-stop",
              to: "apply-stop",
              label: "STOP family",
              order: 0,
              kind: "branch",
              condition: comparison(
                "event.payload.complianceType",
                "equals",
                literal("stop"),
              ),
            },
            {
              id: "keyword-start",
              to: "apply-start",
              label: "START family",
              order: 1,
              kind: "branch",
              condition: comparison(
                "event.payload.complianceType",
                "equals",
                literal("start"),
              ),
            },
            {
              id: "keyword-help",
              to: "apply-help",
              label: "HELP family",
              order: 2,
              kind: "branch",
              condition: comparison(
                "event.payload.complianceType",
                "equals",
                literal("help"),
              ),
            },
            {
              id: "keyword-other",
              to: "end-other",
              label: "Other message",
              order: 3,
              kind: "fallback",
            },
          ],
        },
        ...(["stop", "start", "help"] as const).map((eventType) => ({
          id: `apply-${eventType}`,
          type: "system.applySmsCompliance",
          kind: "action" as const,
          name:
            eventType === "stop"
              ? "Add to Do Not Disturb"
              : eventType === "start"
                ? "Customer restores permission"
                : "Send help information",
          config: { eventType },
          outgoing: [
            {
              id: `${eventType}-end`,
              to: `end-${eventType}`,
              label: "Recorded",
              order: 0,
            },
          ],
        })),
        ...(["stop", "start", "help"] as const).map((eventType) => ({
          id: `end-${eventType}`,
          type: "control.end",
          kind: "terminal" as const,
          name: `${eventType.toUpperCase()} path complete`,
          config: { reason: `${eventType.toUpperCase()} recorded` },
          outgoing: [],
        })),
        {
          id: "end-other",
          type: "control.end",
          kind: "terminal",
          name: "No compliance action",
          config: { reason: "Message was not a compliance keyword" },
          outgoing: [],
        },
      ],
    },
    settings: {
      allowReentry: true,
      concurrencyScope: "event",
      duplicateEventPolicy: "ignore",
      timezone: "America/New_York",
      failureBehavior: "needs_attention",
      tags: ["Required compliance"],
      folder: "Communication",
    },
    layout: { nodes: {} },
  });
}

export const seededWorkflowNames = {
  website: "Website lead intake",
  sms: "Inbound text compliance",
} as const;
