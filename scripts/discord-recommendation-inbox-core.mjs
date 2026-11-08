import { z } from "zod";

const recommendationSchema = z.object({
  title: z.string().trim().min(4).max(240),
  problem: z.string().trim().min(20).max(1500),
  outcome: z.string().trim().min(20).max(1200),
  evidence: z.string().trim().min(20).max(1200),
  competitorGap: z.string().trim().min(10).max(1000),
  integration: z.string().trim().min(20).max(1200),
  value: z.enum(["Medium", "High"]),
  effort: z.enum(["Small", "Medium", "Large"]),
  risk: z.enum(["Low", "Medium", "High"]),
  confidence: z.enum(["Medium", "High"]),
  spec: z.object({
    objects: z.array(z.string().trim().min(1)).min(1),
    surfaces: z.array(z.string().trim().min(1)).min(1),
    permissions: z.string().trim().min(10),
    tenancy: z.string().trim().min(10),
    rollout: z.string().trim().min(10),
    observability: z.string().trim().min(10),
    acceptanceCriteria: z.array(z.string().trim().min(5)).min(1),
    nonGoals: z.array(z.string().trim().min(1)),
  }),
});

export function parseRecommendationDrafts(value) {
  return z.array(recommendationSchema).length(4).parse(JSON.parse(value));
}
