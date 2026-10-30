import { z } from "zod";

export const websiteLeadStages = ["New", "Follow-up"] as const;
export const websiteLeadDispositions = ["Active", "Future", "Test"] as const;

export const websiteLeadAutomationSchema = z.object({
  id: z.literal("website-lead-intake").default("website-lead-intake"),
  revision: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(120).default("Website lead intake"),
  sourceLabel: z.string().trim().min(1).max(120).default("Website form"),
  initialStage: z.enum(websiteLeadStages).default("New"),
  initialDisposition: z.enum(websiteLeadDispositions).default("Active"),
  matchExistingContacts: z.boolean().default(true),
  sendAcknowledgement: z.boolean().default(true),
  sendTeamNotification: z.boolean().default(true),
});

export type WebsiteLeadAutomation = z.infer<typeof websiteLeadAutomationSchema>;

export function defaultWebsiteLeadAutomation(): WebsiteLeadAutomation {
  return websiteLeadAutomationSchema.parse({});
}
