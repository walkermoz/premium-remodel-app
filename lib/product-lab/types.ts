export type RecommendationAction = "approve" | "ask" | "park" | "reject";

export type ProductRecommendationDraft = {
  title: string;
  problem: string;
  outcome: string;
  evidence: string;
  competitorGap: string;
  integration: string;
  value: "Medium" | "High";
  effort: "Small" | "Medium" | "Large";
  risk: "Low" | "Medium" | "High";
  confidence: "Medium" | "High";
  spec: Record<string, unknown>;
};

export type StoredProductRecommendation = ProductRecommendationDraft & {
  id: string;
  batchId: string;
  specVersionId: string;
  rank: number;
  status: "pending" | "approved" | "parked" | "rejected";
};

export type StoredRecommendationBatch = {
  id: string;
  status: "draft" | "posted" | "resolved" | "failed";
  discordChannelId: string | null;
  discordMessageId: string | null;
  recommendations: StoredProductRecommendation[];
};
