import { z } from "zod";

const id = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/);
const text = z.string().trim().max(5000);
export const fieldValueSchema = z.union([
  z.string().max(5000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export type FieldValue = z.infer<typeof fieldValueSchema>;
export const customValuesSchema = z
  .record(id, fieldValueSchema)
  .refine((v) => Object.keys(v).length <= 100, "Too many field values.");
export const fieldSchema = z
  .object({
    id,
    label: z.string().trim().min(1).max(160),
    type: z.enum(["text", "textarea", "number", "boolean", "select", "date"]),
    required: z.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
    defaultValue: fieldValueSchema.default(null),
  })
  .superRefine((field, ctx) => {
    if (
      field.type === "select" &&
      (!field.options.length ||
        new Set(field.options).size !== field.options.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Choice fields need unique options.",
      });
  });
export type FieldDefinition = z.infer<typeof fieldSchema>;
const targets = z
  .array(z.enum(["contact", "quote", "project"]))
  .min(1)
  .max(3)
  .refine((v) => new Set(v).size === v.length, "Choose each record type once.");
export type CustomRecordKind = "contact" | "quote" | "project";
export const customFieldSchema = fieldSchema.safeExtend({
  targets,
  transfer: z.boolean().default(false),
  clientVisible: z.boolean().default(false),
  archived: z.boolean().default(false),
});
export const formTemplateSchema = z.object({
  id,
  title: z.string().trim().min(1).max(160),
  archived: z.boolean().default(false),
  autoAssign: z.boolean().default(false),
  required: z.boolean().default(false),
  fields: z.array(fieldSchema).min(1).max(40),
});
const uniqueIds = (values: Array<{ id: string }>) =>
  new Set(values.map((v) => v.id)).size === values.length;
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Enter a real date.",
  );
const daySchema = z
  .object({
    day: z.number().int().min(0).max(6),
    open: z.boolean(),
    start: time,
    end: time,
  })
  .refine(
    (v) => !v.open || v.end > v.start,
    "Closing time must be after opening time.",
  );
const exceptionSchema = z
  .object({
    date,
    closed: z.boolean(),
    start: time,
    end: time,
    note: z.string().trim().max(200),
  })
  .refine(
    (v) => v.closed || v.end > v.start,
    "Closing time must be after opening time.",
  );
export const invoiceDefaultsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  dueDays: z.number().int().min(0).max(365),
  depositPercent: z.number().finite().min(1).max(99),
  customerNote: text,
});
export type InvoiceDefaults = z.infer<typeof invoiceDefaultsSchema>;
const templateTokens = [
  "firstName",
  "clientName",
  "businessName",
  "quoteName",
  "quoteNumber",
  "senderName",
];
function validTokens(value: string) {
  return [...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].every((match) =>
    templateTokens.includes(match[1]),
  );
}
const messageBody = text
  .min(1)
  .refine(validTokens, "Use only the supported template variables.");
const subject = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .refine(
    (v) => !/[\r\n\x00-\x1f\x7f]/.test(v),
    "Subjects cannot contain line breaks.",
  )
  .refine(validTokens, "Use only supported template variables.");
export const operatingSettingsSchema = z.object({
  hours: z.object({
    enabled: z.boolean(),
    /** Legacy storage compatibility only. Hours never restrict actions. */
    blockOutside: z.boolean().default(false),
    days: z
      .array(daySchema)
      .length(7)
      .refine(
        (v) => new Set(v.map((d) => d.day)).size === 7,
        "Set each weekday once.",
      ),
    exceptions: z
      .array(exceptionSchema)
      .max(100)
      .refine(
        (v) => new Set(v.map((d) => d.date)).size === v.length,
        "Set each exception date once.",
      ),
  }),
  customFields: z
    .array(customFieldSchema)
    .max(100)
    .refine(uniqueIds, "Field identifiers must be unique."),
  forms: z
    .array(formTemplateSchema)
    .max(50)
    .refine(uniqueIds, "Template identifiers must be unique.")
    .refine(
      (v) => v.every((t) => uniqueIds(t.fields)),
      "Question identifiers must be unique in each form.",
    ),
  invoices: invoiceDefaultsSchema,
  messages: z.object({
    quoteSubject: subject,
    quoteBody: messageBody,
    leadSubject: subject,
    leadBody: messageBody,
    scheduleFooter: z.string().trim().min(1).max(160),
  }),
  portal: z
    .object({
      schedule: z.boolean(),
      scheduleTimes: z.boolean(),
      quotes: z.boolean(),
      agreements: z.boolean(),
      invoices: z.boolean(),
      payments: z.boolean(),
      requests: z.boolean(),
    })
    .refine(
      (v) => !v.payments || v.invoices,
      "Enable invoices before enabling portal payments.",
    ),
});
export type OperatingSettings = z.infer<typeof operatingSettingsSchema>;
export type OperatingSection = keyof OperatingSettings;
export const operatingSections = [
  "hours",
  "customFields",
  "forms",
  "invoices",
  "messages",
  "portal",
] as const;

export function defaultOperatingSettings(): OperatingSettings {
  return {
    hours: {
      enabled: false,
      blockOutside: false,
      days: Array.from({ length: 7 }, (_, day) => ({
        day,
        open: day > 0 && day < 6,
        start: "08:00",
        end: "17:00",
      })),
      exceptions: [],
    },
    customFields: [],
    forms: [],
    invoices: {
      title: "Contract invoice",
      dueDays: 0,
      depositPercent: 50,
      customerNote: "",
    },
    messages: {
      quoteSubject: "{{businessName}} Quote #{{quoteNumber}} - {{quoteName}}",
      quoteBody:
        "Hi {{firstName}},\n\nI’ve attached your quote for {{quoteName}}. Use the button below to open your private portal and complete the required documents in one guided signing session. Any deposit options will appear after the documents are complete.\n\nIf you have any questions or would like to talk through anything, just reply to this email or give me a call.\n\nThanks,\n{{senderName}} from {{businessName}}",
      leadSubject: "We received your remodel request",
      leadBody:
        "Hi {{firstName}},\n\nThanks for reaching out to {{businessName}}. We received your remodel request and will review the details before following up about next steps.\n\nIf there is anything else we should know, you can reply directly to this email.\n\nThanks,\n{{businessName}} Team",
      scheduleFooter: "Reply if you have a question.",
    },
    portal: {
      schedule: true,
      scheduleTimes: true,
      quotes: true,
      agreements: true,
      invoices: true,
      payments: true,
      requests: true,
    },
  };
}
export function renderMessageTemplate(
  template: string,
  values: Record<string, string>,
) {
  return template.replace(
    /\{\{\s*([^{}]+?)\s*\}\}/g,
    (_, key: string) => values[key] || "",
  );
}
export function validateFieldValues(
  fields: FieldDefinition[],
  values: Record<string, FieldValue>,
  complete = true,
) {
  const result: Record<string, FieldValue> = {};
  for (const field of fields) {
    const value =
      values[field.id] === undefined ? field.defaultValue : values[field.id];
    const empty = value === null || value === "";
    if (
      complete &&
      field.required &&
      (empty || (field.type === "boolean" && value !== true))
    )
      throw new Error(`${field.label} is required.`);
    if (!empty) {
      if (
        field.type === "number" &&
        (typeof value !== "number" || !Number.isFinite(value))
      )
        throw new Error(`${field.label} must be a number.`);
      if (field.type === "boolean" && typeof value !== "boolean")
        throw new Error(`${field.label} must be a checkbox value.`);
      if (
        !["number", "boolean"].includes(field.type) &&
        typeof value !== "string"
      )
        throw new Error(`${field.label} must be text.`);
      if (field.type === "select" && !field.options.includes(String(value)))
        throw new Error(`${field.label} needs a listed option.`);
      if (field.type === "date" && !date.safeParse(value).success)
        throw new Error(`${field.label} needs a real date.`);
    }
    result[field.id] = value;
  }
  return result;
}
export function customFieldsFor(
  settings: OperatingSettings,
  kind: CustomRecordKind,
) {
  return settings.customFields.filter(
    (f) => !f.archived && f.targets.includes(kind),
  );
}
export function publicCustomFields(
  settings: OperatingSettings,
  kind: CustomRecordKind,
  values: Record<string, FieldValue>,
) {
  return customFieldsFor(settings, kind)
    .filter(
      (f) =>
        f.clientVisible &&
        values[f.id] !== null &&
        values[f.id] !== undefined &&
        values[f.id] !== "",
    )
    .map((f) => ({ id: f.id, label: f.label, value: String(values[f.id]) }));
}

export const recordFormSchema = z.object({
  id,
  templateId: id,
  title: z.string().max(160),
  required: z.boolean().default(false),
  fields: z.array(fieldSchema).max(40),
  answers: customValuesSchema,
  status: z.enum(["draft", "complete"]),
  completedAt: z.string().optional(),
  completedBy: z.string().max(160).optional(),
});
export type RecordForm = z.infer<typeof recordFormSchema>;
export function assignForm(
  template: OperatingSettings["forms"][number],
  formId: string,
): RecordForm {
  return {
    id: formId,
    templateId: template.id,
    title: template.title,
    required: template.required,
    fields: structuredClone(template.fields),
    answers: validateFieldValues(template.fields, {}, false),
    status: "draft",
  };
}
export function normalizeRecordForms(
  settings: OperatingSettings,
  incoming: RecordForm[],
  existing: RecordForm[],
  by: string,
  now: string,
) {
  if (incoming.length > 100)
    throw new Error("A project can have up to 100 assigned forms.");
  if (!uniqueIds(incoming))
    throw new Error("Each assigned form needs a unique identifier.");
  for (const old of existing)
    if (!incoming.some((f) => f.id === old.id))
      throw new Error(
        "Archive the template instead of deleting assigned form history.",
      );
  return incoming.map((input) => {
    const old = existing.find((f) => f.id === input.id);
    if (old?.status === "complete") {
      if (
        input.status !== old.status ||
        JSON.stringify(input.answers) !== JSON.stringify(old.answers)
      )
        throw new Error(
          "Completed forms are locked. Assign a new copy for a correction.",
        );
      return old;
    }
    const template = settings.forms.find(
      (t) => t.id === input.templateId && !t.archived,
    );
    if (!old && !template)
      throw new Error("This form template is not available.");
    const form = old || assignForm(template!, input.id);
    const answers = validateFieldValues(
      form.fields,
      input.answers,
      input.status === "complete",
    );
    return {
      ...form,
      answers,
      status: input.status,
      ...(input.status === "complete"
        ? { completedAt: now, completedBy: by }
        : {}),
    };
  });
}
export function depositSchedule(
  percent: number,
  steps: Array<{ id: string; milestone: string; percent: number }>,
) {
  if (!steps.length) return steps;
  if (steps.length === 1) return [{ ...steps[0], percent: 100 }];
  const remaining = steps.slice(1),
    sum = remaining.reduce((n, s) => n + s.percent, 0);
  let used = percent;
  return steps.map((step, index) => {
    const share =
      index === 0
        ? percent
        : index === steps.length - 1
          ? Math.round((100 - used) * 100) / 100
          : Math.round(
              (100 - percent) *
                (sum ? step.percent / sum : 1 / remaining.length) *
                100,
            ) / 100;
    if (index > 0) used += share;
    return { ...step, percent: share };
  });
}

export function validateOperatingChange(
  current: OperatingSettings,
  section: OperatingSection,
  value: unknown,
): OperatingSettings {
  const next = operatingSettingsSchema.parse({ ...current, [section]: value });
  for (const field of next.customFields)
    validateFieldValues([field], {}, false);
  for (const form of next.forms) validateFieldValues(form.fields, {}, false);
  if (section === "customFields")
    for (const old of current.customFields) {
      const field = next.customFields.find((f) => f.id === old.id);
      if (
        !field ||
        field.type !== old.type ||
        JSON.stringify(field.targets) !== JSON.stringify(old.targets) ||
        old.options.some((option) => !field.options.includes(option))
      )
        throw new Error(
          "Saved fields keep their type, record types and existing options. Archive the field and add a new one to replace it.",
        );
    }
  if (
    section === "forms" &&
    current.forms.some((old) => !next.forms.some((f) => f.id === old.id))
  )
    throw new Error("Archive templates instead of deleting their history.");
  return next;
}
