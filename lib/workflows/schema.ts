import { z } from "zod";

export const workflowSchemaVersion = 1 as const;

export const workflowObjectTypes = [
  "organization",
  "contact",
  "lead",
  "quote",
  "project",
  "item",
  "communication",
  "appointment",
  "payment",
  "user",
  "event",
] as const;

export const workflowObjectTypeSchema = z.enum(workflowObjectTypes);
export type WorkflowObjectType = z.infer<typeof workflowObjectTypeSchema>;

export const workflowEventTypes = [
  "website.form.submitted",
  "contact.created",
  "contact.updated",
  "lead.created",
  "lead.stage.changed",
  "lead.disposition.changed",
  "quote.created",
  "quote.sent",
  "quote.accepted",
  "quote.declined",
  "quote.signed",
  "payment.deposit.received",
  "project.created",
  "project.status.changed",
  "item.created",
  "item.assigned",
  "item.completed",
  "sms.inbound.received",
  "schedule.reached",
  "workflow.manual",
  "webhook.inbound.received",
] as const;

export const workflowEventTypeSchema = z.enum(workflowEventTypes);
export type WorkflowEventType = z.infer<typeof workflowEventTypeSchema>;

const contextRootPattern =
  /^(trigger|event|organization|contact|lead|quote|project|item|actor|outputs)(?:\.[A-Za-z_][A-Za-z0-9_-]*)+$/;

export const workflowReferenceSchema = z.object({
  kind: z.literal("reference"),
  path: z
    .string()
    .min(3)
    .max(240)
    .regex(contextRootPattern, "Choose a supported workflow value."),
});

export const workflowLiteralSchema = z.object({
  kind: z.literal("literal"),
  value: z.union([
    z.string().max(5_000),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z
      .array(z.union([z.string().max(500), z.number().finite(), z.boolean()]))
      .max(100),
  ]),
});

export const workflowOperandSchema = z.discriminatedUnion("kind", [
  workflowReferenceSchema,
  workflowLiteralSchema,
]);
export type WorkflowOperand = z.infer<typeof workflowOperandSchema>;

export const workflowOperators = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "isEmpty",
  "isNotEmpty",
  "greaterThan",
  "lessThan",
  "before",
  "after",
  "isOneOf",
  "isNotOneOf",
  "changedFrom",
  "changedTo",
  "matchesRegex",
] as const;

export const workflowOperatorSchema = z.enum(workflowOperators);

export type WorkflowCondition =
  | {
      kind: "comparison";
      left: z.infer<typeof workflowReferenceSchema>;
      operator: z.infer<typeof workflowOperatorSchema>;
      right?: WorkflowOperand;
    }
  | {
      kind: "group";
      combinator: "and" | "or";
      conditions: WorkflowCondition[];
    };

export const workflowConditionSchema: z.ZodType<WorkflowCondition> = z.lazy(
  () =>
    z.union([
      z.object({
        kind: z.literal("comparison"),
        left: workflowReferenceSchema,
        operator: workflowOperatorSchema,
        right: workflowOperandSchema.optional(),
      }),
      z.object({
        kind: z.literal("group"),
        combinator: z.enum(["and", "or"]),
        conditions: z.array(workflowConditionSchema).min(1).max(50),
      }),
    ]),
);

export const workflowEdgeSchema = z.object({
  id: z.string().trim().min(1).max(120),
  to: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(120).default("Next"),
  order: z.number().int().min(0).max(1000).default(0),
  kind: z.enum(["default", "branch", "always", "fallback"]).default("default"),
  condition: workflowConditionSchema.optional(),
});
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;

export const workflowNodeKinds = [
  "trigger",
  "action",
  "decision",
  "wait",
  "control",
  "terminal",
] as const;

export const workflowNodeKindSchema = z.enum(workflowNodeKinds);

export const workflowNodeSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: z.string().trim().min(3).max(120),
  kind: workflowNodeKindSchema,
  name: z.string().trim().min(1).max(160),
  outputAlias: z
    .string()
    .trim()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .max(80)
    .optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  outgoing: z.array(workflowEdgeSchema).max(50).default([]),
});
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

export const workflowLayoutSchema = z.object({
  nodes: z
    .record(
      z.string(),
      z.object({
        x: z.number().finite(),
        y: z.number().finite(),
        collapsed: z.boolean().optional(),
      }),
    )
    .default({}),
  zoom: z.number().min(0.25).max(2).default(1),
  panX: z.number().finite().default(0),
  panY: z.number().finite().default(0),
});
export type WorkflowLayout = z.infer<typeof workflowLayoutSchema>;

export const workflowRetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  initialDelaySeconds: z.number().int().min(1).max(86_400).default(30),
  multiplier: z.number().min(1).max(10).default(2),
  maxDelaySeconds: z.number().int().min(1).max(604_800).default(3_600),
});

export const workflowSettingsSchema = z.object({
  allowReentry: z.boolean().default(false),
  reentryCooldownSeconds: z.number().int().min(0).max(31_536_000).default(0),
  concurrencyScope: z
    .enum(["contact", "lead", "quote", "project", "item", "event"])
    .default("event"),
  duplicateEventPolicy: z
    .enum(["ignore", "restart", "parallel"])
    .default("ignore"),
  stopOnContactResponse: z.boolean().default(false),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((timezone) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid IANA timezone.")
    .default("America/New_York"),
  communicationWindow: z
    .object({
      enabled: z.boolean().default(false),
      days: z
        .array(z.number().int().min(0).max(6))
        .max(7)
        .default([1, 2, 3, 4, 5]),
      start: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .default("08:00"),
      end: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .default("18:00"),
    })
    .superRefine((window, context) => {
      if (window.enabled && window.days.length === 0)
        context.addIssue({
          code: "custom",
          path: ["days"],
          message: "Choose at least one permitted communication day.",
        });
      if (window.enabled && window.start >= window.end)
        context.addIssue({
          code: "custom",
          path: ["end"],
          message:
            "The communication end time must be later than its start time.",
        });
    })
    .default({
      enabled: false,
      days: [1, 2, 3, 4, 5],
      start: "08:00",
      end: "18:00",
    }),
  senderDefaults: z
    .object({
      emailConnectionId: z.string().uuid().optional(),
      smsConnectionId: z.string().uuid().optional(),
    })
    .default({}),
  maximumRuntimeSeconds: z
    .number()
    .int()
    .min(60)
    .max(31_536_000)
    .default(2_592_000),
  maximumSteps: z.number().int().min(1).max(10_000).default(1_000),
  maximumVisitsPerNode: z.number().int().min(1).max(100).default(25),
  retry: workflowRetryPolicySchema.default({
    maxAttempts: 3,
    initialDelaySeconds: 30,
    multiplier: 2,
    maxDelaySeconds: 3_600,
  }),
  failureBehavior: z
    .enum(["needs_attention", "stop", "continue"])
    .default("needs_attention"),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  folder: z.string().trim().max(120).default(""),
});
export type WorkflowSettings = z.infer<typeof workflowSettingsSchema>;

export const workflowGraphSchema = z.object({
  schemaVersion: z.literal(workflowSchemaVersion),
  primaryObjectType: workflowObjectTypeSchema,
  entryNodeIds: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  nodes: z.array(workflowNodeSchema).min(2).max(500),
});
export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;

export const workflowDefinitionSchema = z
  .object({
    graph: workflowGraphSchema,
    settings: workflowSettingsSchema,
    layout: workflowLayoutSchema.default({
      nodes: {},
      zoom: 1,
      panX: 0,
      panY: 0,
    }),
  })
  .superRefine((definition, context) => {
    if (
      new TextEncoder().encode(JSON.stringify(definition)).byteLength >
      1_000_000
    )
      context.addIssue({
        code: "custom",
        message: "Workflow definitions must be 1 MB or smaller.",
      });
  });
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

export const workflowEventSchema = z
  .object({
    id: z.string().uuid(),
    schemaVersion: z.literal(1),
    type: workflowEventTypeSchema,
    organizationId: z.string().uuid(),
    actor: z
      .object({
        type: z.enum(["user", "contact", "system", "integration"]),
        id: z.string().max(160).optional(),
        name: z.string().max(160).optional(),
      })
      .default({ type: "system" }),
    objectType: workflowObjectTypeSchema,
    objectId: z.string().max(160),
    contactId: z.string().uuid().optional(),
    // PostgreSQL returns timestamptz values with an explicit offset (for
    // example, `+00:00`) rather than always normalizing them to `Z`.
    occurredAt: z.string().datetime({ offset: true }),
    correlationId: z.string().uuid(),
    causationId: z.string().uuid().optional(),
    idempotencyKey: z.string().trim().min(1).max(240),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((event, context) => {
    if (
      new TextEncoder().encode(JSON.stringify(event.payload)).byteLength >
      256_000
    )
      context.addIssue({
        code: "custom",
        path: ["payload"],
        message: "Workflow event payloads must be 256 KB or smaller.",
      });
  });
export type WorkflowEvent = z.infer<typeof workflowEventSchema>;

export const workflowStatusSchema = z.enum(["draft", "published", "archived"]);
export const workflowRunStatusSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "completed",
  "needs_attention",
  "cancelled",
]);

export type WorkflowContext = {
  trigger?: Record<string, unknown>;
  event?: Record<string, unknown>;
  organization?: Record<string, unknown>;
  contact?: Record<string, unknown>;
  lead?: Record<string, unknown>;
  quote?: Record<string, unknown>;
  project?: Record<string, unknown>;
  item?: Record<string, unknown>;
  actor?: Record<string, unknown>;
  outputs?: Record<string, Record<string, unknown>>;
};
