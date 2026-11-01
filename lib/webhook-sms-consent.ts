import { z } from "zod";

const httpsUrl = z
  .url()
  .refine((value) => new URL(value).protocol === "https:", "Use an HTTPS URL.");

export const webhookSmsConsentEvidenceSchema = z.object({
  source: z.string().trim().min(3).max(200),
  policyVersion: z.string().trim().min(1).max(80),
  privacyUrl: httpsUrl,
  termsUrl: httpsUrl,
  capturedAt: z.iso.datetime(),
  origin: httpsUrl,
  appointment: z.boolean(),
  marketing: z.boolean(),
});

export const webhookConsentEnvelopeSchema = z
  .object({
    smsAppointmentOptIn: z.boolean().optional(),
    smsMarketingOptIn: z.boolean().optional(),
    smsConsentEvidence: webhookSmsConsentEvidenceSchema.optional(),
  })
  .passthrough();

export function sameWebPolicyUrl(left: string, right: string) {
  try {
    const normalized = (value: string) => {
      const url = new URL(value);
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    };
    return normalized(left) === normalized(right);
  } catch {
    return false;
  }
}
