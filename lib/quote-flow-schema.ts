import { z } from "zod";

export const quoteFlowStageTypes = [
  "quote_builder",
  "agreement_details",
  "custom_form",
  "document",
  "signature_collection",
  "initials_collection",
  "deposit_payment",
  "delivery",
  "internal_approval",
  "customer_confirmation",
  "project_conversion",
] as const;

export const quoteFlowBlockTypes = [
  "heading",
  "explanatory_copy",
  "contact_fields",
  "project_fields",
  "custom_text",
  "custom_number",
  "custom_currency",
  "custom_date",
  "custom_checkbox",
  "custom_select",
  "custom_multiselect",
  "custom_file",
  "quote_items",
  "scope_of_work",
  "notes",
  "uploaded_pdf",
  "generated_document",
  "terms_disclosures",
  "signature",
  "initials",
  "payment_schedule",
  "deposit_collection",
  "photos_attachments",
  "staff_information",
  "customer_information",
  "delivery_controls",
  "internal_approval",
  "project_conversion",
] as const;

export const quoteFlowAudiences = ["staff", "customer", "both"] as const;

export const quoteFlowConditionFields = [
  "quote.total",
  "quote.item_ids",
  "quote.categories",
  "project.type",
  "contact.field",
  "project.field",
  "custom.field",
  "payment.status",
  "signature.status",
  "staff.role",
  "customer.response",
] as const;

export const quoteFlowConditionOperators = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "greater_than",
  "greater_than_or_equal",
  "less_than",
  "less_than_or_equal",
  "is_empty",
  "is_not_empty",
] as const;

export type QuoteFlowStageType = (typeof quoteFlowStageTypes)[number];
export type QuoteFlowBlockType = (typeof quoteFlowBlockTypes)[number];
export type QuoteFlowAudience = (typeof quoteFlowAudiences)[number];

export const quoteFlowConditionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  field: z.enum(quoteFlowConditionFields),
  fieldKey: z.string().trim().max(160).nullable().default(null),
  operator: z.enum(quoteFlowConditionOperators),
  value: z.unknown().nullable().default(null),
});

export const quoteFlowConditionGroupSchema = z.object({
  mode: z.enum(["all", "any"]).default("all"),
  rules: z.array(quoteFlowConditionSchema).max(30).default([]),
});

export const quoteFlowBlockSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum(quoteFlowBlockTypes),
  label: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).default(""),
  enabled: z.boolean().default(true),
  required: z.boolean().default(false),
  audience: z.enum(quoteFlowAudiences).default("both"),
  bindingKey: z.string().trim().max(200).nullable().default(null),
  conditions: quoteFlowConditionGroupSchema.default({ mode: "all", rules: [] }),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const quoteFlowStageSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum(quoteFlowStageTypes),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).default(""),
  enabled: z.boolean().default(true),
  required: z.boolean().default(true),
  audience: z.enum(quoteFlowAudiences).default("both"),
  conditions: quoteFlowConditionGroupSchema.default({ mode: "all", rules: [] }),
  blocks: z.array(quoteFlowBlockSchema).max(100).default([]),
});

const unique = (values: string[]) => new Set(values).size === values.length;

export const quoteFlowDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    stages: z.array(quoteFlowStageSchema).min(1).max(50),
  })
  .superRefine((definition, context) => {
    if (!unique(definition.stages.map((stage) => stage.id)))
      context.addIssue({
        code: "custom",
        path: ["stages"],
        message: "Every stage needs a unique ID.",
      });
    if (
      !unique(
        definition.stages.flatMap((stage) =>
          stage.blocks.map((block) => block.id),
        ),
      )
    )
      context.addIssue({
        code: "custom",
        path: ["stages"],
        message: "Every block in a flow needs a unique ID.",
      });
    definition.stages.forEach((stage, stageIndex) => {
      if (!unique(stage.blocks.map((block) => block.id)))
        context.addIssue({
          code: "custom",
          path: ["stages", stageIndex, "blocks"],
          message: "Every block in a stage needs a unique ID.",
        });
      stage.conditions.rules.forEach((rule, ruleIndex) => {
        if (
          [
            "contact.field",
            "project.field",
            "custom.field",
            "customer.response",
          ].includes(rule.field) &&
          !rule.fieldKey
        )
          context.addIssue({
            code: "custom",
            path: [
              "stages",
              stageIndex,
              "conditions",
              "rules",
              ruleIndex,
              "fieldKey",
            ],
            message: "Choose the field this condition evaluates.",
          });
      });
      stage.blocks.forEach((block, blockIndex) => {
        const path = ["stages", stageIndex, "blocks", blockIndex] as const;
        block.conditions.rules.forEach((rule, ruleIndex) => {
          if (
            [
              "contact.field",
              "project.field",
              "custom.field",
              "customer.response",
            ].includes(rule.field) &&
            !rule.fieldKey
          )
            context.addIssue({
              code: "custom",
              path: [...path, "conditions", "rules", ruleIndex, "fieldKey"],
              message: "Choose the field this condition evaluates.",
            });
        });
        if (["custom_select", "custom_multiselect"].includes(block.type)) {
          const options = Array.isArray(block.config.options)
            ? block.config.options.map(String).filter(Boolean)
            : [];
          if (!options.length)
            context.addIssue({
              code: "custom",
              path: [...path, "config", "options"],
              message: "Add at least one choice.",
            });
          if (!unique(options))
            context.addIssue({
              code: "custom",
              path: [...path, "config", "options"],
              message: "Choices must be unique.",
            });
        }
        if (
          ["uploaded_pdf", "generated_document"].includes(block.type) &&
          !block.config.templateId &&
          !block.config.templateKey &&
          !block.config.renderer
        )
          context.addIssue({
            code: "custom",
            path: [...path, "config", "templateId"],
            message: "Choose a published agreement or document.",
          });
        if (["signature", "initials"].includes(block.type)) {
          const order = block.config.order;
          if (
            order !== undefined &&
            (!Number.isInteger(Number(order)) || Number(order) < 1)
          )
            context.addIssue({
              code: "custom",
              path: [...path, "config", "order"],
              message: "Signing order must be a positive whole number.",
            });
          if (
            Array.isArray(block.config.methods) &&
            block.config.methods.length === 0
          )
            context.addIssue({
              code: "custom",
              path: [...path, "config", "methods"],
              message: "Enable at least one signing method.",
            });
        }
        if (block.type === "deposit_collection") {
          const providers = Array.isArray(block.config.providers)
            ? block.config.providers
            : ["stripe", "manual"];
          if (!providers.length)
            context.addIssue({
              code: "custom",
              path: [...path, "config", "providers"],
              message: "Enable at least one payment method.",
            });
          const amountMode = String(block.config.amountMode || "percent");
          if (
            amountMode === "percent" &&
            (Number(block.config.percent ?? 100) <= 0 ||
              Number(block.config.percent ?? 100) > 100)
          )
            context.addIssue({
              code: "custom",
              path: [...path, "config", "percent"],
              message: "Payment percentage must be between 0 and 100.",
            });
          if (amountMode === "fixed" && Number(block.config.amount || 0) <= 0)
            context.addIssue({
              code: "custom",
              path: [...path, "config", "amount"],
              message: "Enter a payment amount greater than zero.",
            });
        }
      });
    });
    const enabled = definition.stages.filter((stage) => stage.enabled);
    if (!enabled.some((stage) => stage.type === "quote_builder"))
      context.addIssue({
        code: "custom",
        path: ["stages"],
        message: "A published flow needs an enabled Quote builder stage.",
      });
  });

export type QuoteFlowCondition = z.infer<typeof quoteFlowConditionSchema>;
export type QuoteFlowConditionGroup = z.infer<
  typeof quoteFlowConditionGroupSchema
>;
export type QuoteFlowBlock = z.infer<typeof quoteFlowBlockSchema>;
export type QuoteFlowStage = z.infer<typeof quoteFlowStageSchema>;
export type QuoteFlowDefinition = z.infer<typeof quoteFlowDefinitionSchema>;

type RegistryItem = {
  label: string;
  description: string;
  defaultAudience: QuoteFlowAudience;
};

export const quoteFlowStageRegistry: Record<QuoteFlowStageType, RegistryItem> =
  {
    quote_builder: {
      label: "Quote builder",
      description: "Customer, items, costs, scope, and customer price.",
      defaultAudience: "staff",
    },
    agreement_details: {
      label: "Agreement details",
      description: "Dates, parties, payment checkpoints, and job terms.",
      defaultAudience: "staff",
    },
    custom_form: {
      label: "Custom form",
      description: "Collect organization-defined project or customer details.",
      defaultAudience: "both",
    },
    document: {
      label: "Document",
      description: "Present an uploaded or generated agreement.",
      defaultAudience: "customer",
    },
    signature_collection: {
      label: "Document signing",
      description:
        "Choose documents, map their data, and collect signer roles in order.",
      defaultAudience: "customer",
    },
    initials_collection: {
      label: "Initials",
      description: "Require initials beside important terms or disclosures.",
      defaultAudience: "customer",
    },
    deposit_payment: {
      label: "Deposit or payment",
      description: "Collect or record the configured payment checkpoint.",
      defaultAudience: "both",
    },
    delivery: {
      label: "Email & portal delivery",
      description: "Send the packet and manage portal communication.",
      defaultAudience: "staff",
    },
    internal_approval: {
      label: "Internal approval",
      description: "Require an authorized teammate to approve progression.",
      defaultAudience: "staff",
    },
    customer_confirmation: {
      label: "Customer confirmation",
      description: "Collect a final acknowledgment or selection.",
      defaultAudience: "customer",
    },
    project_conversion: {
      label: "Create project",
      description: "Move the completed quote and its items into Planning.",
      defaultAudience: "staff",
    },
  };

export const quoteFlowBlockRegistry: Record<QuoteFlowBlockType, RegistryItem> =
  {
    heading: {
      label: "Heading",
      description: "Section heading and orientation copy.",
      defaultAudience: "both",
    },
    explanatory_copy: {
      label: "Explanatory copy",
      description: "Short instructions or context.",
      defaultAudience: "both",
    },
    contact_fields: {
      label: "Contact fields",
      description: "Name, email, phone, and address from the Contact.",
      defaultAudience: "both",
    },
    project_fields: {
      label: "Project fields",
      description: "Project name, type, address, and dates.",
      defaultAudience: "both",
    },
    custom_text: {
      label: "Text field",
      description: "Single or multiline text response.",
      defaultAudience: "both",
    },
    custom_number: {
      label: "Number field",
      description: "Numeric response.",
      defaultAudience: "both",
    },
    custom_currency: {
      label: "Currency field",
      description: "Currency response.",
      defaultAudience: "both",
    },
    custom_date: {
      label: "Date field",
      description: "Date response.",
      defaultAudience: "both",
    },
    custom_checkbox: {
      label: "Checkbox",
      description: "Required or optional acknowledgment.",
      defaultAudience: "both",
    },
    custom_select: {
      label: "Dropdown",
      description: "Choose one configured option.",
      defaultAudience: "both",
    },
    custom_multiselect: {
      label: "Multiple choice",
      description: "Choose several configured options.",
      defaultAudience: "both",
    },
    custom_file: {
      label: "File upload",
      description: "Attach a requested file.",
      defaultAudience: "both",
    },
    quote_items: {
      label: "Quote items & pricing",
      description: "Current item, cost, and pricing builder.",
      defaultAudience: "staff",
    },
    scope_of_work: {
      label: "Scope of work",
      description: "Customer-facing included work.",
      defaultAudience: "both",
    },
    notes: {
      label: "Notes",
      description: "Quote or project notes.",
      defaultAudience: "staff",
    },
    uploaded_pdf: {
      label: "Uploaded PDF",
      description: "An organization-owned PDF document.",
      defaultAudience: "customer",
    },
    generated_document: {
      label: "Generated document",
      description: "A ServiceBuddy-rendered agreement.",
      defaultAudience: "customer",
    },
    terms_disclosures: {
      label: "Terms & disclosures",
      description: "Required legal or operational terms.",
      defaultAudience: "customer",
    },
    signature: {
      label: "Signature",
      description: "Signature assigned to a signer role.",
      defaultAudience: "customer",
    },
    initials: {
      label: "Initials",
      description: "Initials assigned to a signer role.",
      defaultAudience: "customer",
    },
    payment_schedule: {
      label: "Payment schedule",
      description: "Deposit and checkpoint schedule.",
      defaultAudience: "both",
    },
    deposit_collection: {
      label: "Deposit collection",
      description: "Online or manually recorded deposit.",
      defaultAudience: "both",
    },
    photos_attachments: {
      label: "Photos & attachments",
      description: "Project photos and files.",
      defaultAudience: "both",
    },
    staff_information: {
      label: "Staff-only information",
      description: "Operational content hidden from customers.",
      defaultAudience: "staff",
    },
    customer_information: {
      label: "Customer information",
      description: "Customer-visible content hidden from staff-only tools.",
      defaultAudience: "customer",
    },
    delivery_controls: {
      label: "Delivery controls",
      description: "Email, portal, and on-device actions.",
      defaultAudience: "staff",
    },
    internal_approval: {
      label: "Approval control",
      description: "Approval status and authorized approver.",
      defaultAudience: "staff",
    },
    project_conversion: {
      label: "Project conversion",
      description: "Create Planning project from completed quote.",
      defaultAudience: "staff",
    },
  };

export type QuoteFlowBlockCompletionRule =
  | "automatic"
  | "value_required"
  | "signature_required"
  | "payment_required"
  | "approval_required";

export type QuoteFlowBlockPresentation = "hidden" | "read_only" | "editable";

export type QuoteFlowBlockContract = {
  completionRule: QuoteFlowBlockCompletionRule;
  actions: string[];
  validation: string[];
  presentation: Record<
    "staff" | "portal" | "device",
    QuoteFlowBlockPresentation
  >;
};

/**
 * The shared runtime contract for a configurable block. Workspace, portal,
 * and on-device renderers all resolve behavior here instead of inventing
 * page-specific visibility, completion, or action rules.
 */
export function quoteFlowBlockContract(
  block: QuoteFlowBlock,
): QuoteFlowBlockContract {
  const customerEditable = block.audience !== "staff";
  const staffVisible = block.audience !== "customer";
  const valueTypes = new Set<QuoteFlowBlockType>([
    "custom_text",
    "custom_number",
    "custom_currency",
    "custom_date",
    "custom_checkbox",
    "custom_select",
    "custom_multiselect",
    "custom_file",
  ]);
  let completionRule: QuoteFlowBlockCompletionRule = valueTypes.has(block.type)
    ? "value_required"
    : "automatic";
  if (["signature", "initials"].includes(block.type))
    completionRule = "signature_required";
  if (block.type === "deposit_collection") completionRule = "payment_required";
  if (block.type === "internal_approval") completionRule = "approval_required";

  const actions: string[] = [];
  if (["uploaded_pdf", "generated_document"].includes(block.type))
    actions.push("preview", "download", "replace");
  if (["signature", "initials"].includes(block.type)) {
    const methods = Array.isArray(block.config.methods)
      ? block.config.methods.map(String)
      : ["remote", "onsite", "in_person"];
    if (methods.includes("remote")) actions.push("send", "resend");
    if (methods.includes("onsite")) actions.push("sign_on_device");
    if (methods.includes("in_person")) actions.push("mark_signed_in_person");
    actions.push("void");
  }
  if (block.type === "delivery_controls")
    actions.push("send", "resend", "copy_portal_link");
  if (block.type === "deposit_collection") actions.push("record_payment");
  if (block.type === "project_conversion") actions.push("create_project");

  const validation: string[] = [];
  if (block.required) validation.push("required");
  if (["custom_select", "custom_multiselect"].includes(block.type))
    validation.push("configured_options");
  if (["uploaded_pdf", "generated_document"].includes(block.type))
    validation.push("published_document_template");
  if (["signature", "initials"].includes(block.type))
    validation.push("assigned_signer", "allowed_signing_method");

  return {
    completionRule,
    actions,
    validation,
    presentation: {
      staff: staffVisible ? "editable" : "read_only",
      portal: customerEditable ? "editable" : "hidden",
      device: customerEditable ? "editable" : "hidden",
    },
  };
}

export function createQuoteFlowBlock(type: QuoteFlowBlockType): QuoteFlowBlock {
  const item = quoteFlowBlockRegistry[type];
  return quoteFlowBlockSchema.parse({
    id: `${type}_${crypto.randomUUID().slice(0, 8)}`,
    type,
    label: item.label,
    description: item.description,
    audience: item.defaultAudience,
  });
}

export function createQuoteFlowStage(type: QuoteFlowStageType): QuoteFlowStage {
  const item = quoteFlowStageRegistry[type];
  const blocks =
    type === "signature_collection"
      ? [
          {
            ...createQuoteFlowBlock("generated_document"),
            label: "Document to sign",
            required: true,
            bindingKey: "documents.primary",
          },
          {
            ...createQuoteFlowBlock("signature"),
            label: "Customer signature",
            required: true,
            bindingKey: "signing.customer_signature",
            config: {
              signerRoleId: "customer",
              order: 1,
              methods: ["remote", "onsite", "in_person"],
            },
          },
        ]
      : [];
  return quoteFlowStageSchema.parse({
    id: `${type}_${crypto.randomUUID().slice(0, 8)}`,
    type,
    title: item.label,
    description: item.description,
    audience: item.defaultAudience,
    blocks,
  });
}

export const premiumRemodelQuoteFlowDefinition: QuoteFlowDefinition =
  quoteFlowDefinitionSchema.parse({
    schemaVersion: 1,
    stages: [
      {
        id: "quote_and_pricing",
        type: "quote_builder",
        title: "Quote & pricing",
        description: "Customer, items, costs, and price",
        audience: "staff",
        blocks: [
          {
            id: "customer",
            type: "contact_fields",
            label: "Customer contact",
            required: true,
            audience: "staff",
            bindingKey: "quote.contact",
          },
          {
            id: "items",
            type: "quote_items",
            label: "Items, costs, and pricing",
            required: true,
            audience: "staff",
            bindingKey: "quote.items",
            config: { renderer: "premium_quote_builder_v1" },
          },
          {
            id: "scope",
            type: "scope_of_work",
            label: "Scope of work",
            required: true,
            audience: "both",
            bindingKey: "quote.scope",
          },
          {
            id: "notes",
            type: "notes",
            label: "Notes",
            audience: "staff",
            bindingKey: "quote.notes",
          },
          {
            id: "photos",
            type: "photos_attachments",
            label: "Photos & attachments",
            audience: "both",
            bindingKey: "quote.attachments",
          },
        ],
      },
      {
        id: "agreement_details",
        type: "agreement_details",
        title: "Agreement details",
        description: "Dates, payments, parties, and terms",
        audience: "staff",
        blocks: [
          {
            id: "premium_msa",
            type: "generated_document",
            label: "Master services agreement",
            required: true,
            audience: "both",
            bindingKey: "agreement.premium_msa",
            config: {
              templateKey: "premium_remodel_master_services_agreement",
              renderer: "legacy_premium_msa_v1",
            },
          },
          {
            id: "payment_schedule",
            type: "payment_schedule",
            label: "Payment checkpoints",
            required: true,
            audience: "both",
            bindingKey: "agreement.payment_schedule",
          },
          {
            id: "agreement_terms",
            type: "terms_disclosures",
            label: "Agreement terms",
            required: true,
            audience: "customer",
            bindingKey: "agreement.terms",
          },
        ],
      },
      {
        id: "company_approval",
        type: "signature_collection",
        title: "Company approval",
        description: "Review and sign as the company representative",
        audience: "staff",
        blocks: [
          {
            id: "staff_signature",
            type: "signature",
            label: "Company representative signature",
            required: true,
            audience: "staff",
            bindingKey: "agreement.staff_signature",
            config: {
              signerRoleId: "staff",
              order: 1,
              methods: ["onsite"],
              renderer: "legacy_premium_msa_staff_v1",
            },
          },
        ],
      },
      {
        id: "send_and_complete",
        type: "delivery",
        title: "Customer completion",
        description: "Share the packet and collect customer signatures",
        audience: "both",
        blocks: [
          {
            id: "delivery",
            type: "delivery_controls",
            label: "Email, portal, or on-device signing",
            required: true,
            audience: "staff",
            bindingKey: "delivery",
            config: { renderer: "legacy_quote_portal_v1" },
          },
          {
            id: "quote_signature",
            type: "signature",
            label: "Quote acceptance",
            required: true,
            audience: "customer",
            bindingKey: "quote.customer_signature",
            config: { signerRoleId: "customer", order: 1 },
          },
          {
            id: "msa_signature",
            type: "signature",
            label: "Service agreement signature",
            required: true,
            audience: "customer",
            bindingKey: "agreement.customer_signature",
            config: { signerRoleId: "customer", order: 2 },
          },
        ],
      },
      {
        id: "deposit",
        type: "deposit_payment",
        title: "Deposit",
        description: "Collect online or record an offline payment",
        audience: "both",
        blocks: [
          {
            id: "deposit",
            type: "deposit_collection",
            label: "Deposit received",
            required: true,
            audience: "both",
            bindingKey: "payment.deposit",
            config: { providers: ["stripe", "manual_check"] },
          },
        ],
      },
      {
        id: "create_project",
        type: "project_conversion",
        title: "Create project",
        description: "Carry accepted items into Planning",
        audience: "staff",
        blocks: [
          {
            id: "project_conversion",
            type: "project_conversion",
            label: "Create Planning project",
            required: true,
            audience: "staff",
            bindingKey: "project.conversion",
            config: { renderer: "premium_quote_promotion_v1" },
          },
        ],
      },
    ],
  });

export const defaultQuoteFlowDefinition: QuoteFlowDefinition =
  quoteFlowDefinitionSchema.parse({
    schemaVersion: 1,
    stages: [
      {
        id: "quote_and_pricing",
        type: "quote_builder",
        title: "Quote & pricing",
        description: "Customer, items, costs, and price",
        audience: "staff",
        blocks: [
          {
            id: "customer",
            type: "contact_fields",
            label: "Customer contact",
            required: true,
            audience: "staff",
            bindingKey: "quote.contact",
          },
          {
            id: "items",
            type: "quote_items",
            label: "Items, costs, and pricing",
            required: true,
            audience: "staff",
            bindingKey: "quote.items",
            config: { renderer: "servicebuddy_quote_builder_v1" },
          },
          {
            id: "scope",
            type: "scope_of_work",
            label: "Scope of work",
            required: true,
            audience: "both",
            bindingKey: "quote.scope",
          },
        ],
      },
      {
        id: "send_and_complete",
        type: "delivery",
        title: "Customer completion",
        description: "Send, sign, and confirm customer approval",
        audience: "both",
        blocks: [
          {
            id: "delivery",
            type: "delivery_controls",
            label: "Email, portal, or on-device signing",
            required: true,
            audience: "staff",
            bindingKey: "delivery",
          },
          {
            id: "quote_signature",
            type: "signature",
            label: "Quote acceptance",
            required: true,
            audience: "customer",
            bindingKey: "quote.customer_signature",
            config: { signerRoleId: "customer", order: 1 },
          },
        ],
      },
      {
        id: "create_project",
        type: "project_conversion",
        title: "Create project",
        description: "Carry accepted items into Planning",
        audience: "staff",
        blocks: [
          {
            id: "project_conversion",
            type: "project_conversion",
            label: "Create Planning project",
            required: true,
            audience: "staff",
            bindingKey: "project.conversion",
          },
        ],
      },
    ],
  });

function comparable(value: unknown) {
  if (typeof value === "number") return value;
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Number(value))
  )
    return Number(value);
  return value;
}

export function quoteFlowConditionMatches(
  condition: QuoteFlowCondition,
  value: unknown,
): boolean {
  const expected = condition.value;
  switch (condition.operator) {
    case "is_empty":
      return (
        value === null ||
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      );
    case "is_not_empty":
      return !quoteFlowConditionMatches(
        { ...condition, operator: "is_empty" },
        value,
      );
    case "contains":
      return Array.isArray(value)
        ? value.some((item) => item === expected)
        : String(value ?? "")
            .toLowerCase()
            .includes(String(expected ?? "").toLowerCase());
    case "not_contains":
      return !quoteFlowConditionMatches(
        { ...condition, operator: "contains" },
        value,
      );
    case "equals":
      return comparable(value) === comparable(expected);
    case "not_equals":
      return comparable(value) !== comparable(expected);
    case "greater_than":
      return Number(value) > Number(expected);
    case "greater_than_or_equal":
      return Number(value) >= Number(expected);
    case "less_than":
      return Number(value) < Number(expected);
    case "less_than_or_equal":
      return Number(value) <= Number(expected);
  }
}

export function quoteFlowConditionsMatch(
  group: QuoteFlowConditionGroup,
  resolve: (condition: QuoteFlowCondition) => unknown,
) {
  if (!group.rules.length) return true;
  const results = group.rules.map((condition) =>
    quoteFlowConditionMatches(condition, resolve(condition)),
  );
  return group.mode === "all" ? results.every(Boolean) : results.some(Boolean);
}
