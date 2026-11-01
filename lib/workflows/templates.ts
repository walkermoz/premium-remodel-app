import { workflowDefinitionSchema, type WorkflowObjectType } from "./schema";

export type WorkflowTemplateKey =
  "blank" | "lead-follow-up" | "project-item-handoff";

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
