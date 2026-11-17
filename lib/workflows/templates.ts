import { workflowDefinitionSchema, type WorkflowObjectType } from "./schema";

export type WorkflowTemplateKey =
  | "blank"
  | "lead-follow-up"
  | "project-item-handoff"
  | "invoice-payment-reminders";

export function workflowTemplateDefinition(
  key: WorkflowTemplateKey,
  primaryObjectType: WorkflowObjectType,
) {
  if (key === "blank")
    return workflowDefinitionSchema.parse({
      graph: {
        schemaVersion: 1,
        primaryObjectType,
        entryNodeIds: ["manual-trigger"],
        nodes: [
          {
            id: "manual-trigger",
            type: "trigger.manual",
            kind: "trigger",
            name: "Manual enrollment",
            config: { eventType: "workflow.manual" },
            outgoing: [
              { id: "manual-end", to: "end", label: "Continue", order: 0 },
            ],
          },
          {
            id: "end",
            type: "control.end",
            kind: "terminal",
            name: "End workflow",
            config: { reason: "Completed" },
            outgoing: [],
          },
        ],
      },
      settings: { concurrencyScope: "event" },
      layout: {
        nodes: {
          "manual-trigger": { x: 480, y: 80 },
          end: { x: 480, y: 300 },
        },
      },
    });
  if (key === "lead-follow-up")
    return workflowDefinitionSchema.parse({
      graph: {
        schemaVersion: 1,
        primaryObjectType: "lead",
        entryNodeIds: ["lead-created"],
        nodes: [
          {
            id: "lead-created",
            type: "trigger.leadCreated",
            kind: "trigger",
            name: "Lead created",
            config: { eventType: "lead.created" },
            outgoing: [
              {
                id: "lead-wait",
                to: "wait-one-day",
                label: "Continue",
                order: 0,
              },
            ],
          },
          {
            id: "wait-one-day",
            type: "logic.wait",
            kind: "wait",
            name: "Wait one day",
            config: { mode: "duration", amount: 1, unit: "days" },
            outgoing: [
              {
                id: "wait-email",
                to: "follow-up-email",
                label: "Resume",
                order: 0,
              },
            ],
          },
          {
            id: "follow-up-email",
            type: "action.sendEmail",
            kind: "action",
            name: "Send follow-up email",
            config: {
              enabled: true,
              recipient: { kind: "reference", path: "contact.email" },
              subject: "Following up on your project",
              body: "Hi {{contact.firstName}}, we wanted to follow up on your project request.",
              missingValueBehavior: "skip",
            },
            outgoing: [
              { id: "email-end", to: "end", label: "Continue", order: 0 },
            ],
          },
          {
            id: "end",
            type: "control.end",
            kind: "terminal",
            name: "End workflow",
            config: { reason: "Follow-up completed" },
            outgoing: [],
          },
        ],
      },
      settings: { concurrencyScope: "lead", allowReentry: false },
      layout: { nodes: {}, zoom: 1, panX: 0, panY: 0 },
    });
  if (key === "invoice-payment-reminders")
    return workflowDefinitionSchema.parse({
      graph: {
        schemaVersion: 1,
        primaryObjectType: "invoice",
        entryNodeIds: ["invoice-created"],
        nodes: [
          {
            id: "invoice-created",
            type: "trigger.invoiceCreated",
            kind: "trigger",
            name: "Invoice created",
            config: { eventType: "invoice.created" },
            outgoing: [
              {
                id: "invoice-first-wait",
                to: "wait-for-payment",
                label: "Monitor payment",
                order: 0,
              },
            ],
          },
          {
            id: "wait-for-payment",
            type: "logic.wait",
            kind: "wait",
            name: "Wait up to three days for payment",
            config: {
              mode: "event",
              eventType: "invoice.payment.received",
              timeoutSeconds: 259_200,
              timeoutBehavior: "continue",
            },
            outgoing: [
              {
                id: "first-wait-check",
                to: "first-payment-check",
                label: "Payment or timeout",
                order: 0,
              },
            ],
          },
          {
            id: "first-payment-check",
            type: "logic.router",
            kind: "decision",
            name: "Was payment received?",
            config: {},
            outgoing: [
              {
                id: "first-check-paid",
                to: "paid-end",
                label: "Paid",
                order: 0,
                kind: "branch",
                condition: {
                  kind: "comparison",
                  left: { kind: "reference", path: "event.type" },
                  operator: "equals",
                  right: {
                    kind: "literal",
                    value: "invoice.payment.received",
                  },
                },
              },
              {
                id: "first-check-reminder",
                to: "first-email",
                label: "Still open",
                order: 1,
                kind: "fallback",
              },
            ],
          },
          {
            id: "first-email",
            type: "action.sendEmail",
            kind: "action",
            name: "Send friendly payment reminder",
            config: {
              enabled: true,
              connectionFailureBehavior: "skip",
              presentation: "business",
              recipient: { kind: "reference", path: "event.payload.email" },
              subject: "Payment reminder for {{event.payload.invoiceNumber}}",
              body: "Hi {{event.payload.customerName}},\n\nThis is a friendly reminder that {{event.payload.amountDue}} is due for {{event.payload.invoiceNumber}}. You can review the invoice and payment options here: {{event.payload.invoiceUrl}}\n\nIf payment is already on the way, no action is needed.\n\nThanks,\n{{organization.name}}",
              missingValueBehavior: "skip",
            },
            outgoing: [
              {
                id: "first-email-sms",
                to: "first-sms-policy",
                label: "Continue",
                order: 0,
              },
            ],
          },
          {
            id: "first-sms-policy",
            type: "system.smsPolicyGate",
            kind: "action",
            name: "SMS consent and DND policy",
            outputAlias: "invoiceSmsPolicy",
            config: {
              category: "appointment",
              recipient: { kind: "reference", path: "event.payload.phone" },
              contactId: { kind: "reference", path: "event.contactId" },
            },
            outgoing: [
              {
                id: "first-policy-sms",
                to: "first-sms",
                label: "Allowed",
                order: 0,
              },
            ],
          },
          {
            id: "first-sms",
            type: "action.sendSms",
            kind: "action",
            name: "Optional payment reminder text",
            config: {
              enabled: false,
              connectionFailureBehavior: "skip",
              recipient: { kind: "reference", path: "event.payload.phone" },
              contactId: { kind: "reference", path: "event.contactId" },
              category: "appointment",
              body: "{{organization.name}}: Friendly reminder that {{event.payload.amountDue}} is due for {{event.payload.invoiceNumber}}. Review payment options: {{event.payload.invoiceUrl}}. STOP to opt out; HELP for help.",
              missingValueBehavior: "skip",
            },
            outgoing: [
              {
                id: "first-sms-second-wait",
                to: "wait-for-overdue-payment",
                label: "Continue",
                order: 0,
              },
            ],
          },
          {
            id: "wait-for-overdue-payment",
            type: "logic.wait",
            kind: "wait",
            name: "Wait four more days for payment",
            config: {
              mode: "event",
              eventType: "invoice.payment.received",
              timeoutSeconds: 345_600,
              timeoutBehavior: "continue",
            },
            outgoing: [
              {
                id: "second-wait-check",
                to: "overdue-payment-check",
                label: "Payment or timeout",
                order: 0,
              },
            ],
          },
          {
            id: "overdue-payment-check",
            type: "logic.router",
            kind: "decision",
            name: "Was payment received?",
            config: {},
            outgoing: [
              {
                id: "overdue-check-paid",
                to: "paid-end",
                label: "Paid",
                order: 0,
                kind: "branch",
                condition: {
                  kind: "comparison",
                  left: { kind: "reference", path: "event.type" },
                  operator: "equals",
                  right: {
                    kind: "literal",
                    value: "invoice.payment.received",
                  },
                },
              },
              {
                id: "overdue-check-email",
                to: "overdue-email",
                label: "Overdue",
                order: 1,
                kind: "fallback",
              },
            ],
          },
          {
            id: "overdue-email",
            type: "action.sendEmail",
            kind: "action",
            name: "Send overdue payment reminder",
            config: {
              enabled: true,
              connectionFailureBehavior: "skip",
              presentation: "business",
              recipient: { kind: "reference", path: "event.payload.email" },
              subject: "Payment overdue for {{event.payload.invoiceNumber}}",
              body: "Hi {{event.payload.customerName}},\n\nOur records still show {{event.payload.amountDue}} due for {{event.payload.invoiceNumber}}. Please review the invoice and payment options here: {{event.payload.invoiceUrl}}\n\nIf you have already paid or need help, please reply to this email.\n\nThanks,\n{{organization.name}}",
              missingValueBehavior: "skip",
            },
            outgoing: [
              {
                id: "overdue-email-team",
                to: "notify-team",
                label: "Escalate",
                order: 0,
              },
            ],
          },
          {
            id: "notify-team",
            type: "action.internalNotification",
            kind: "action",
            name: "Notify the team about overdue payment",
            config: {
              enabled: true,
              connectionFailureBehavior: "skip",
              channel: "connected_team",
              title: "Invoice payment is overdue",
              body: "{{event.payload.invoiceNumber}} for {{event.payload.customerName}} still has {{event.payload.amountDue}} due.",
            },
            outgoing: [
              {
                id: "team-overdue-end",
                to: "overdue-end",
                label: "Continue",
                order: 0,
              },
            ],
          },
          {
            id: "paid-end",
            type: "control.end",
            kind: "terminal",
            name: "Payment received",
            config: { reason: "Payment received; reminders stopped." },
            outgoing: [],
          },
          {
            id: "overdue-end",
            type: "control.end",
            kind: "terminal",
            name: "Overdue follow-up completed",
            config: { reason: "Overdue reminder and team alert completed." },
            outgoing: [],
          },
        ],
      },
      settings: {
        concurrencyScope: "event",
        allowReentry: true,
        communicationWindow: {
          enabled: true,
          days: [1, 2, 3, 4, 5],
          start: "08:00",
          end: "18:00",
        },
      },
      layout: { nodes: {}, zoom: 1, panX: 0, panY: 0 },
    });
  return workflowDefinitionSchema.parse({
    graph: {
      schemaVersion: 1,
      primaryObjectType: "project",
      entryNodeIds: ["project-created"],
      nodes: [
        {
          id: "project-created",
          type: "trigger.projectCreated",
          kind: "trigger",
          name: "Project created",
          config: { eventType: "project.created" },
          outgoing: [
            {
              id: "project-item",
              to: "create-item",
              label: "Continue",
              order: 0,
            },
          ],
        },
        {
          id: "create-item",
          type: "action.createItem",
          kind: "action",
          name: "Create kickoff Item",
          outputAlias: "kickoffItem",
          config: {
            fields: {
              projectId: { kind: "reference", path: "project.id" },
              title: { kind: "literal", value: "Project kickoff" },
              status: { kind: "literal", value: "To do" },
            },
          },
          outgoing: [
            {
              id: "item-notify",
              to: "notify-team",
              label: "Continue",
              order: 0,
            },
          ],
        },
        {
          id: "notify-team",
          type: "action.internalNotification",
          kind: "action",
          name: "Notify team",
          config: {
            enabled: true,
            channel: "connected_team",
            title: "Project ready for kickoff",
            body: "{{project.name}} is ready. A kickoff Item was created.",
          },
          outgoing: [
            { id: "notify-end", to: "end", label: "Continue", order: 0 },
          ],
        },
        {
          id: "end",
          type: "control.end",
          kind: "terminal",
          name: "End workflow",
          config: { reason: "Project handoff completed" },
          outgoing: [],
        },
      ],
    },
    settings: { concurrencyScope: "project", allowReentry: false },
    layout: { nodes: {}, zoom: 1, panX: 0, panY: 0 },
  });
}
