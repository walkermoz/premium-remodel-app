import { z } from "zod";

export const agreementSourceTypes = [
  "uploaded_pdf",
  "servicebuddy_document",
  "legacy_premium_msa",
] as const;

export const agreementTemplateStatuses = [
  "draft",
  "published",
  "archived",
] as const;

export const agreementFieldTypes = [
  "text",
  "multiline_text",
  "number",
  "currency",
  "date",
  "checkbox",
  "initials",
  "signature",
] as const;

export const agreementSignerRoleSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_-]{1,79}$/),
  label: z.string().trim().min(1).max(120),
  partyType: z.enum(["customer", "staff", "other"]),
  order: z.number().int().min(1).max(50),
  required: z.boolean().default(true),
  nameBinding: z.string().trim().max(160).nullable().default(null),
  emailBinding: z.string().trim().max(160).nullable().default(null),
});

export const agreementFieldSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_-]{1,79}$/),
    label: z.string().trim().min(1).max(160),
    type: z.enum(agreementFieldTypes),
    required: z.boolean().default(false),
    bindingKey: z.string().trim().max(160).nullable().default(null),
    signerRoleId: z.string().trim().max(80).nullable().default(null),
    page: z.number().int().min(1).max(500).nullable().default(null),
    x: z.number().min(0).max(1).nullable().default(null),
    y: z.number().min(0).max(1).nullable().default(null),
    width: z.number().gt(0).max(1).nullable().default(null),
    height: z.number().gt(0).max(1).nullable().default(null),
    placeholder: z.string().max(240).nullable().default(null),
  })
  .superRefine((field, context) => {
    const coordinates = [field.page, field.x, field.y, field.width, field.height];
    const present = coordinates.filter((value) => value !== null).length;
    if (present !== 0 && present !== coordinates.length)
      context.addIssue({
        code: "custom",
        message: "A positioned field needs a page, x, y, width, and height.",
      });
    if (
      field.x !== null &&
      field.width !== null &&
      field.x + field.width > 1.000001
    )
      context.addIssue({
        code: "custom",
        message: "The field extends beyond the right edge of the page.",
      });
    if (
      field.y !== null &&
      field.height !== null &&
      field.y + field.height > 1.000001
    )
      context.addIssue({
        code: "custom",
        message: "The field extends beyond the bottom edge of the page.",
      });
  });

export const agreementDocumentBlockSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum(["heading", "paragraph", "divider", "page_break"]),
  text: z.string().max(20_000).default(""),
});

export const agreementDocumentContentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  blocks: z.array(agreementDocumentBlockSchema).max(500).default([]),
});

const uniqueIds = <T extends { id: string }>(items: T[]) =>
  new Set(items.map((item) => item.id)).size === items.length;

export const agreementTemplateDefinitionSchema = z
  .object({
    content: agreementDocumentContentSchema.nullable(),
    fields: z.array(agreementFieldSchema).max(500).default([]),
    signerRoles: z.array(agreementSignerRoleSchema).min(1).max(50),
  })
  .superRefine((definition, context) => {
    if (!uniqueIds(definition.fields))
      context.addIssue({
        code: "custom",
        path: ["fields"],
        message: "Field IDs must be unique.",
      });
    if (!uniqueIds(definition.signerRoles))
      context.addIssue({
        code: "custom",
        path: ["signerRoles"],
        message: "Signer role IDs must be unique.",
      });
    const roleIds = new Set(definition.signerRoles.map((role) => role.id));
    definition.fields.forEach((field, index) => {
      if (field.signerRoleId && !roleIds.has(field.signerRoleId))
        context.addIssue({
          code: "custom",
          path: ["fields", index, "signerRoleId"],
          message: "The selected signer role does not exist.",
        });
      if (
        ["signature", "initials"].includes(field.type) &&
        !field.signerRoleId
      )
        context.addIssue({
          code: "custom",
          path: ["fields", index, "signerRoleId"],
          message: "Signature and initials fields need a signer role.",
        });
    });
    const orders = definition.signerRoles.map((role) => role.order);
    if (new Set(orders).size !== orders.length)
      context.addIssue({
        code: "custom",
        path: ["signerRoles"],
        message: "Each signer role needs a unique signing order.",
      });
  });

export type AgreementField = z.infer<typeof agreementFieldSchema>;
export type AgreementSignerRole = z.infer<typeof agreementSignerRoleSchema>;
export type AgreementDocumentContent = z.infer<
  typeof agreementDocumentContentSchema
>;
export type AgreementTemplateDefinition = z.infer<
  typeof agreementTemplateDefinitionSchema
>;

export const defaultAgreementSignerRoles: AgreementSignerRole[] = [
  {
    id: "customer",
    label: "Customer",
    partyType: "customer",
    order: 1,
    required: true,
    nameBinding: "contact.name",
    emailBinding: "contact.email",
  },
];
