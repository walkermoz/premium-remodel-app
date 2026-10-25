import { z } from "zod";

const touch = z.object({
  source: z.string().trim().min(1).max(200),
  medium: z.string().trim().max(200).optional(),
  campaign: z.string().trim().max(200).optional(),
  content: z.string().trim().max(200).optional(),
  term: z.string().trim().max(200).optional(),
  gclid: z.string().trim().max(200).optional(),
  gbraid: z.string().trim().max(200).optional(),
  wbraid: z.string().trim().max(200).optional(),
  gadSource: z.string().trim().max(200).optional(),
  referrer: z.string().trim().max(500).optional(),
  landingPath: z.string().trim().max(500),
  capturedAt: z.iso.datetime(),
});

export const leadAttributionSchema = z.object({
  firstTouch: touch,
  lastTouch: touch,
});

export type LeadAttribution = z.infer<typeof leadAttributionSchema>;
