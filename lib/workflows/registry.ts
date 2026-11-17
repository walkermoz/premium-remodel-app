import { z } from "zod";
import {
  workflowConditionSchema,
  workflowEventSchema,
  workflowEventTypeSchema,
  workflowObjectTypeSchema,
  workflowOperandSchema,
  type WorkflowNodeKind,
} from "./registry-types";
import {
  isPublicWorkflowWebhookUrl,
  isSensitiveWorkflowHeader,
} from "./webhook-safety";

export type WorkflowNodeCategory =
  | "Triggers"
  | "CRM"
  | "Communication"
  | "Quotes"
  | "Projects"
  | "Items"
  | "Logic"
  | "Integrations"
  | "Workflow control"
  | "System policy";

export type WorkflowNodeDefinition = {
  type: string;
  kind: WorkflowNodeKind;
  category: WorkflowNodeCategory;
  name: string;
  description: string;
  icon: string;
  configSchema: z.ZodType;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  editor: {
    kind:
      | "trigger"
      | "field_mapping"
      | "communication"
      | "condition"
      | "wait"
      | "integration"
      | "workflow_control"
      | "system_policy"
      | "schema";
  };
  validate: (config: unknown) => {
    valid: boolean;
    issues: Array<{ path: string; message: string }>;
  };
  context: readonly string[];
  outputFields: readonly string[];
  retry: "none" | "safe" | "idempotent";
  connection?: "email" | "sms" | "internal" | "webhook";
  requiredPermissions: readonly string[];
  sideEffect: boolean;
  executor: string;
  systemControlled?: boolean;
};

const triggerConfigSchema = z.object({
  eventType: workflowEventTypeSchema,
  filters: workflowConditionSchema.optional(),
});

const scheduledTriggerConfigSchema = z.object({
  eventType: z.literal("schedule.reached"),
  schedule: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("once"), at: z.iso.datetime() }),
    z.object({
      mode: z.literal("interval"),
      amount: z.number().int().min(1).max(525_600),
      unit: z.enum(["minutes", "hours", "days"]),
      startAt: z.iso.datetime().optional(),
    }),
  ]),
  filters: workflowConditionSchema.optional(),
});

const fieldMappingSchema = z.record(z.string().max(120), workflowOperandSchema);

const findContactSchema = z.object({
  matchFields: z
    .array(z.enum(["email", "phone", "id"]))
    .min(1)
    .max(3),
  email: workflowOperandSchema.optional(),
  phone: workflowOperandSchema.optional(),
  id: workflowOperandSchema.optional(),
  multipleMatch: z.enum(["latest", "earliest", "fail"]).default("latest"),
});

const findOrCreateContactSchema = findContactSchema.extend({
  matchExisting: z.boolean().default(true),
  fields: fieldMappingSchema,
});

const createObjectSchema = z.object({ fields: fieldMappingSchema });
const createProjectFromQuoteSchema = createObjectSchema.extend({
  quoteId: workflowOperandSchema,
});
const upsertQuoteSchema = createObjectSchema.extend({
  objectId: workflowOperandSchema.optional(),
});
const updateObjectSchema = z.object({
  objectType: workflowObjectTypeSchema,
  objectId: workflowOperandSchema,
  fields: fieldMappingSchema,
});

const resultTrackingSchema = z.object({
  objectType: z.enum(["contact", "lead", "quote", "project", "item"]),
  objectId: workflowOperandSchema,
  field: z
    .string()
    .trim()
    .regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/),
});

const connectionFailureBehaviorSchema = z
  .enum(["block", "skip"])
  .default("block");

const sendEmailSchema = z.object({
  enabled: z.boolean().default(true),
  connectionFailureBehavior: connectionFailureBehaviorSchema,
  /** Historical versions only; new workflows use ordinary presentation and tracking config. */
  templateKey: z.string().trim().max(120).optional(),
  presentation: z.enum(["plain", "business"]).default("plain"),
  resultTracking: resultTrackingSchema.optional(),
  recipient: workflowOperandSchema,
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(50_000),
  missingValueBehavior: z
    .enum(["blank", "fallback", "skip", "error"])
    .default("skip"),
  fallbackValue: z.string().max(500).optional(),
  connectionId: z.string().uuid().optional(),
});

const sendSmsSchema = z.object({
  enabled: z.boolean().default(true),
  connectionFailureBehavior: connectionFailureBehaviorSchema,
  templateKey: z.string().trim().max(120).optional(),
  resultTracking: resultTrackingSchema.optional(),
  recipient: workflowOperandSchema,
  contactId: workflowOperandSchema.optional(),
  body: z.string().min(1).max(1_600),
  category: z.enum(["appointment", "marketing"]),
  missingValueBehavior: z
    .enum(["blank", "fallback", "skip", "error"])
    .default("skip"),
  fallbackValue: z.string().max(500).optional(),
  connectionId: z.string().uuid().optional(),
});

const sendDirectSmsSchema = z.object({
  enabled: z.boolean().default(true),
  connectionFailureBehavior: connectionFailureBehaviorSchema,
  recipients: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        phone: z
          .string()
          .trim()
          .min(7)
          .max(40)
          .regex(/^\+?[0-9().\-\s]+$/, "Enter a valid recipient phone number."),
      }),
    )
    .min(1)
    .max(20),
  body: z.string().min(1).max(1_600),
  missingValueBehavior: z
    .enum(["blank", "fallback", "skip", "error"])
    .default("blank"),
  fallbackValue: z.string().max(500).optional(),
  connectionId: z.string().uuid().optional(),
});

const notificationSchema = z.object({
  enabled: z.boolean().default(true),
  connectionFailureBehavior: connectionFailureBehaviorSchema,
  templateKey: z.string().trim().max(120).optional(),
  channel: z.enum(["connected_team", "user"]),
  recipient: workflowOperandSchema.optional(),
  title: z.string().min(1).max(300),
  body: z.string().min(1).max(10_000),
  connectionId: z.string().uuid().optional(),
});

const waitSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("duration"),
    amount: z.number().int().min(1).max(31_536_000),
    unit: z.enum(["seconds", "minutes", "hours", "days"]),
  }),
  z.object({
    mode: z.literal("timestamp"),
    timestamp: workflowOperandSchema,
    pastBehavior: z
      .enum(["continue", "exit", "skip_communications"])
      .default("continue"),
  }),
  z.object({
    mode: z.literal("relative"),
    date: workflowOperandSchema,
    direction: z.enum(["before", "after"]),
    amount: z.number().int().min(1).max(31_536_000),
    unit: z.enum(["minutes", "hours", "days"]),
  }),
  z.object({
    mode: z.literal("event"),
    eventType: workflowEventTypeSchema,
    condition: workflowConditionSchema.optional(),
    timeoutSeconds: z.number().int().min(1).max(31_536_000).optional(),
    timeoutBehavior: z.enum(["continue", "exit"]).default("continue"),
  }),
  z.object({
    mode: z.literal("condition"),
    condition: workflowConditionSchema,
    timeoutSeconds: z.number().int().min(1).max(31_536_000).optional(),
    pollSeconds: z.number().int().min(60).max(86_400).default(900),
    timeoutBehavior: z.enum(["continue", "exit"]).default("continue"),
  }),
]);

const webhookSchema = z
  .object({
    enabled: z.boolean().default(true),
    connectionFailureBehavior: connectionFailureBehaviorSchema,
    templateKey: z.string().trim().max(120).optional(),
    resultTracking: resultTrackingSchema.optional(),
    destination: z.enum(["custom", "discord_lead_webhook"]).default("custom"),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    url: z.string().max(2_000).default(""),
    urlSecretId: z.uuid().optional(),
    headers: z
      .record(z.string().max(120), z.string().max(2_000))
      .default({})
      .refine(
        (headers) =>
          Object.keys(headers).every(
            (name) => !isSensitiveWorkflowHeader(name),
          ),
        "Store credentials in an organization connection, not workflow headers.",
      ),
    secretHeaders: z
      .record(
        z
          .string()
          .max(120)
          .regex(/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/),
        z.uuid(),
      )
      .default({})
      .refine(
        (headers) =>
          Object.keys(headers).every(
            (name) =>
              ![
                "host",
                "content-length",
                "content-type",
                "idempotency-key",
                "transfer-encoding",
                "connection",
                "te",
                "trailer",
                "upgrade",
                "expect",
                "proxy-authorization",
              ].includes(name.toLowerCase()),
          ),
        "Connection and request framing headers are managed by ServiceBuddy.",
      ),
    bodyType: z.enum(["json", "text"]).default("json"),
    body: z.string().max(100_000).default(""),
    missingValueBehavior: z
      .enum(["blank", "fallback", "skip", "error"])
      .default("blank"),
    fallbackValue: z.string().max(500).optional(),
    connectionId: z.string().uuid().optional(),
    timeoutSeconds: z.number().int().min(1).max(30).default(15),
    saveResponse: z.boolean().default(false),
  })
  .superRefine((config, context) => {
    if (
      config.enabled !== false &&
      config.destination === "custom" &&
      !config.urlSecretId &&
      !isPublicWorkflowWebhookUrl(config.url)
    )
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "Use a public HTTPS URL without embedded credentials.",
      });
    if (config.bodyType === "json" && config.body.trim())
      try {
        JSON.parse(config.body);
      } catch {
        context.addIssue({
          code: "custom",
          path: ["body"],
          message: "Enter a valid JSON request body.",
        });
      }
  });

const workflowReferenceConfigSchema = z.object({
  workflowId: z.string().uuid(),
  objectId: workflowOperandSchema.optional(),
});

const definitions: WorkflowNodeDefinition[] = [];

function inferredContext(
  definition: Pick<WorkflowNodeDefinition, "type" | "category">,
) {
  const type = definition.type.toLocaleLowerCase();
  const context = new Set<string>(["event", "organization"]);
  if (type.includes("contact") || definition.category === "Communication")
    context.add("contact");
  if (type.includes("lead")) context.add("lead");
  if (type.includes("quote")) context.add("quote");
  if (type.includes("project")) context.add("project");
  if (type.includes("item")) context.add("item");
  if (type.includes("sms") || type.includes("notification"))
    context.add("communication");
  if (type.includes("assignuser")) context.add("actor");
  if (definition.category === "Workflow control") context.add("outputs");
  return [...context];
}

function register(
  definition: Omit<
    WorkflowNodeDefinition,
    | "context"
    | "inputSchema"
    | "outputSchema"
    | "outputFields"
    | "retry"
    | "sideEffect"
    | "editor"
    | "validate"
    | "requiredPermissions"
  > &
    Partial<
      Pick<
        WorkflowNodeDefinition,
        | "context"
        | "inputSchema"
        | "outputSchema"
        | "outputFields"
        | "retry"
        | "sideEffect"
        | "editor"
        | "requiredPermissions"
      >
    >,
) {
  const inputSchema = z.object({
    organizationId: z.uuid(),
    runId: z.uuid(),
    nodeId: z.string().trim().min(1).max(120),
    idempotencyKey: z.string().trim().min(1).max(500),
    event: workflowEventSchema,
    context: z.record(z.string(), z.unknown()),
  });
  const outputSchema = z
    .object(
      Object.fromEntries(
        (definition.outputFields || []).map((field) => [
          field,
          z.unknown().optional(),
        ]),
      ),
    )
    .passthrough();
  const editor =
    definition.editor ||
    ({
      kind:
        definition.kind === "trigger"
          ? "trigger"
          : definition.kind === "decision"
            ? "condition"
            : definition.kind === "wait"
              ? "wait"
              : definition.category === "Communication"
                ? "communication"
                : definition.category === "Integrations"
                  ? "integration"
                  : definition.category === "System policy"
                    ? "system_policy"
                    : definition.category === "Workflow control"
                      ? "workflow_control"
                      : definition.sideEffect
                        ? "field_mapping"
                        : "schema",
    } satisfies WorkflowNodeDefinition["editor"]);
  const requiredPermissions =
    definition.requiredPermissions ||
    (definition.category === "System policy"
      ? ["platform.sms_policy"]
      : definition.sideEffect
        ? ["automation.execute"]
        : ["automation.configure"]);
  const completed: WorkflowNodeDefinition = {
    context: inferredContext(definition),
    outputFields: [],
    inputSchema,
    outputSchema,
    retry: "none",
    sideEffect: false,
    requiredPermissions,
    editor,
    validate: (config) => {
      const result = definition.configSchema.safeParse(config);
      return result.success
        ? { valid: true, issues: [] }
        : {
            valid: false,
            issues: result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          };
    },
    ...definition,
  };
  definitions.push(completed);
}

const triggerNames: Record<string, string> = {
  "trigger.websiteFormSubmitted": "Website form submitted",
  "trigger.contactCreated": "Contact created",
  "trigger.contactUpdated": "Contact updated",
  "trigger.leadCreated": "Lead created",
  "trigger.leadStageChanged": "Lead stage changed",
  "trigger.leadDispositionChanged": "Lead disposition changed",
  "trigger.quoteCreated": "Quote created",
  "trigger.quoteSent": "Quote sent",
  "trigger.quoteAccepted": "Quote accepted",
  "trigger.quoteDeclined": "Quote declined",
  "trigger.quoteSigned": "Quote signed",
  "trigger.depositReceived": "Deposit received",
  "trigger.invoiceCreated": "Invoice created",
  "trigger.invoicePaymentReceived": "Invoice payment received",
  "trigger.projectCreated": "Project created",
  "trigger.projectStatusChanged": "Project status changed",
  "trigger.itemCreated": "Item created",
  "trigger.itemAssigned": "Item assigned",
  "trigger.itemCompleted": "Item completed",
  "trigger.inboundSms": "Inbound SMS received",
  "trigger.schedule": "Scheduled time",
  "trigger.manual": "Manual enrollment",
  "trigger.inboundWebhook": "Inbound webhook",
};

for (const [type, name] of Object.entries(triggerNames))
  register({
    type,
    kind: "trigger",
    category: "Triggers",
    name,
    description: `Start a workflow when ${name.toLocaleLowerCase()}.`,
    icon: "Zap",
    configSchema:
      type === "trigger.schedule"
        ? scheduledTriggerConfigSchema
        : triggerConfigSchema,
    executor: "trigger.event",
  });

register({
  type: "action.findContact",
  kind: "action",
  category: "CRM",
  name: "Find Contact",
  description: "Find a Contact using ID, email, or phone.",
  icon: "Search",
  configSchema: findContactSchema,
  outputFields: ["contact", "found"],
  executor: "contact.find",
});
register({
  type: "action.findOrCreateContact",
  kind: "action",
  category: "CRM",
  name: "Find or create Contact",
  description: "Reuse a matching Contact or create a new Contact.",
  icon: "UserRoundSearch",
  configSchema: findOrCreateContactSchema,
  outputFields: ["contact", "created", "reused"],
  retry: "idempotent",
  sideEffect: true,
  executor: "contact.findOrCreate",
});

for (const [type, category, name, executor] of [
  ["action.createContact", "CRM", "Create Contact", "contact.create"],
  ["action.createLead", "CRM", "Create Lead", "lead.create"],
  ["action.createItem", "Items", "Create Item", "item.create"],
] as const)
  register({
    type,
    kind: "action",
    category,
    name,
    description: `${name} using mapped workflow values.`,
    icon: "Plus",
    configSchema: createObjectSchema,
    outputFields: ["record", "id"],
    retry: "idempotent",
    sideEffect: true,
    executor,
  });

register({
  type: "action.createProjectFromQuote",
  kind: "action",
  category: "Projects",
  name: "Create Project from Quote",
  description:
    "Create a Project from the selected Quote and expose it to later steps.",
  icon: "FolderKanban",
  configSchema: createProjectFromQuoteSchema,
  outputFields: ["record", "id", "created", "quoteId"],
  retry: "idempotent",
  sideEffect: true,
  executor: "project.createFromQuote",
});

register({
  type: "action.createOrUpdateQuote",
  kind: "action",
  category: "Quotes",
  name: "Create or update Quote",
  description:
    "Update a selected Quote, or create one when no Quote ID is supplied.",
  icon: "FilePenLine",
  configSchema: upsertQuoteSchema,
  outputFields: ["record", "id", "created"],
  retry: "idempotent",
  sideEffect: true,
  executor: "quote.upsert",
});

for (const [type, name, executor] of [
  ["action.updateContact", "Update Contact", "contact.update"],
  ["action.updateLead", "Update Lead", "lead.update"],
  ["action.updateObject", "Update object fields", "object.update"],
] as const)
  register({
    type,
    kind: "action",
    category: "CRM",
    name,
    description: "Update mapped fields on an existing object.",
    icon: "Pencil",
    configSchema: updateObjectSchema,
    outputFields: ["record", "id"],
    retry: "idempotent",
    sideEffect: true,
    executor,
  });

register({
  type: "action.assignUser",
  kind: "action",
  category: "CRM",
  name: "Assign user",
  description: "Assign a workspace user to the current object.",
  icon: "UserCheck",
  configSchema: z.object({
    objectType: workflowObjectTypeSchema,
    objectId: workflowOperandSchema,
    userId: workflowOperandSchema,
  }),
  retry: "idempotent",
  sideEffect: true,
  executor: "object.assignUser",
});
register({
  type: "action.addNote",
  kind: "action",
  category: "CRM",
  name: "Add note",
  description: "Add a note to an object timeline.",
  icon: "NotebookPen",
  configSchema: z.object({
    objectType: workflowObjectTypeSchema,
    objectId: workflowOperandSchema,
    body: z.string().min(1).max(20_000),
  }),
  retry: "idempotent",
  sideEffect: true,
  executor: "object.addNote",
});
register({
  type: "action.sendEmail",
  kind: "action",
  category: "Communication",
  name: "Send email",
  description: "Send an email through the organization mailbox.",
  icon: "Mail",
  configSchema: sendEmailSchema,
  outputFields: ["status", "messageId"],
  retry: "safe",
  connection: "email",
  sideEffect: true,
  executor: "communication.sendEmail",
});
register({
  type: "action.sendSms",
  kind: "action",
  category: "Communication",
  name: "Send SMS",
  description: "Send a consent-checked SMS through the organization number.",
  icon: "MessageSquareText",
  configSchema: sendSmsSchema,
  outputFields: ["status", "messageSid"],
  retry: "safe",
  connection: "sms",
  sideEffect: true,
  executor: "communication.sendSms",
});
register({
  type: "action.sendDirectSms",
  kind: "action",
  category: "Communication",
  name: "Send SMS",
  description: "Send an SMS to one or more configured recipients.",
  icon: "MessagesSquare",
  configSchema: sendDirectSmsSchema,
  outputFields: ["status", "deliveries"],
  retry: "none",
  connection: "sms",
  sideEffect: true,
  executor: "communication.sendDirectSms",
});
register({
  type: "action.internalNotification",
  kind: "action",
  category: "Communication",
  name: "Send internal notification",
  description: "Notify a connected team channel or workspace user.",
  icon: "BellRing",
  configSchema: notificationSchema,
  outputFields: ["status"],
  retry: "safe",
  connection: "internal",
  sideEffect: true,
  executor: "communication.internalNotification",
});
register({
  type: "action.webhook",
  kind: "action",
  category: "Integrations",
  name: "HTTPS request",
  description: "Send a configurable request to a public HTTPS endpoint.",
  icon: "Webhook",
  configSchema: webhookSchema,
  outputFields: ["status", "response"],
  retry: "safe",
  connection: "webhook",
  sideEffect: true,
  executor: "integration.webhook",
});
for (const [type, name, executor] of [
  ["action.enrollWorkflow", "Enroll in workflow", "workflow.enroll"],
  ["action.removeWorkflow", "Remove from workflow", "workflow.remove"],
] as const)
  register({
    type,
    kind: "action",
    category: "Workflow control",
    name,
    description: `${name} for the current execution object.`,
    icon: "Workflow",
    configSchema: workflowReferenceConfigSchema,
    retry: "idempotent",
    sideEffect: true,
    executor,
  });
register({
  type: "logic.ifElse",
  kind: "decision",
  category: "Logic",
  name: "If / Else",
  description: "Run only the first matching branch, with a required fallback.",
  icon: "GitBranch",
  configSchema: z.object({}),
  executor: "logic.ifElse",
});
register({
  type: "logic.router",
  kind: "decision",
  category: "Logic",
  name: "Router",
  description: "Run every matching branch in displayed order.",
  icon: "Route",
  configSchema: z.object({}),
  executor: "logic.router",
});
register({
  type: "logic.wait",
  kind: "wait",
  category: "Logic",
  name: "Wait",
  description: "Pause durably until a time, event, or condition.",
  icon: "Clock3",
  configSchema: waitSchema,
  executor: "logic.wait",
});
register({
  type: "control.goto",
  kind: "control",
  category: "Workflow control",
  name: "Go To",
  description: "Continue at another node with loop safeguards.",
  icon: "CornerDownRight",
  configSchema: z.object({}),
  executor: "control.goto",
});
register({
  type: "control.end",
  kind: "terminal",
  category: "Workflow control",
  name: "End workflow",
  description: "Complete this workflow path.",
  icon: "CircleStop",
  configSchema: z.object({ reason: z.string().max(300).default("Completed") }),
  executor: "control.end",
});
register({
  type: "system.smsPolicyGate",
  kind: "action",
  category: "System policy",
  name: "SMS consent and DND policy",
  description:
    "Enforce saved consent, recipient ownership, DND, and organization-number isolation.",
  icon: "ShieldCheck",
  configSchema: z.object({
    category: z.enum(["appointment", "marketing"]),
    recipient: workflowOperandSchema,
    contactId: workflowOperandSchema.optional(),
  }),
  outputFields: ["allowed", "reason"],
  executor: "policy.sms",
  systemControlled: true,
});
register({
  type: "system.applySmsCompliance",
  kind: "action",
  category: "System policy",
  name: "Apply SMS compliance event",
  description: "Apply a verified HELP, STOP, or START event idempotently.",
  icon: "ShieldCheck",
  configSchema: z.object({ eventType: z.enum(["help", "stop", "start"]) }),
  retry: "idempotent",
  sideEffect: true,
  executor: "policy.applySmsCompliance",
  systemControlled: true,
});

export const workflowNodeRegistry = new Map(
  definitions.map((definition) => [definition.type, definition]),
);
export const workflowNodeDefinitions = Object.freeze([...definitions]);

export function workflowNodeDefinition(type: string) {
  return workflowNodeRegistry.get(type);
}
