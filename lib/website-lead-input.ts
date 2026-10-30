import { z } from "zod";
import { leadAttributionSchema } from "./lead-attribution";

function optionalField<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) =>
      value == null || (typeof value === "string" && !value.trim())
        ? undefined
        : value,
    schema.optional(),
  );
}

const leadInput = z
  .object({
    submission_id: optionalField(z.uuid()),
    first_name: optionalField(z.string().trim().min(1).max(100)),
    last_name: optionalField(z.string().trim().min(1).max(100)),
    email: optionalField(z.email().max(250)),
    phone: optionalField(
      z
        .string()
        .trim()
        .regex(/^\+?[1-9]\d{9,14}$/, "Enter a valid phone number."),
    ),
    zip: optionalField(
      z
        .string()
        .trim()
        .regex(/^\d{5}(?:-\d{4})?$/, "Enter a valid ZIP code."),
    ),
    address: optionalField(z.string().trim().min(1).max(250)),
    project: optionalField(z.string().trim().min(1).max(100)),
    // A free-form description is optional; a long one must not discard the lead.
    project_description: z.preprocess(
      (value) =>
        typeof value === "string"
          ? value.trim().slice(0, 15_000) || undefined
          : value == null
            ? undefined
            : value,
      z.string().optional(),
    ),
    // Only literal JSON true is an opt-in. Missing, false, and malformed values
    // all fail closed without rejecting an otherwise usable lead.
    sms_appointment_opt_in: z
      .unknown()
      .optional()
      .transform((value) => value === true),
    sms_marketing_opt_in: z
      .unknown()
      .optional()
      .transform((value) => value === true),
    lead_attribution: z.unknown().optional(),
  })
  .refine(
    (data) =>
      Boolean(
        data.first_name ||
        data.last_name ||
        data.email ||
        data.phone ||
        data.address,
      ),
    { message: "Include at least one contact detail." },
  );

const knownFields = new Set(Object.keys(leadInput.shape));

export function parseWebsiteLead(input: unknown) {
  const data = leadInput.parse(input);
  // Ignore malformed attribution without discarding a usable customer inquiry.
  const attribution = leadAttributionSchema.safeParse(data.lead_attribution);
  const otherSubmittedFields: Record<string, string> = {};
  if (input && typeof input === "object" && !Array.isArray(input)) {
    let savedFields = 0;
    for (const [key, value] of Object.entries(input)) {
      if (savedFields >= 30) break;
      if (
        knownFields.has(key) ||
        !/^[a-zA-Z][a-zA-Z0-9_ -]{0,79}$/.test(key) ||
        key === "constructor" ||
        key === "prototype" ||
        /password|secret|token|authorization|captcha|ssn|social_security|card_number|cvv|cvc|routing_number|bank_account/i.test(
          key,
        ) ||
        value == null
      )
        continue;
      const formatted =
        typeof value === "string" ? value : JSON.stringify(value);
      if (formatted) {
        otherSubmittedFields[key] = formatted.slice(0, 1000);
        savedFields++;
      }
    }
  }
  return {
    data,
    otherSubmittedFields,
    leadAttribution: attribution.success ? attribution.data : undefined,
  };
}
