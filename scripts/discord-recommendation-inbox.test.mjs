import assert from "node:assert/strict";
import test from "node:test";
import { parseRecommendationDrafts } from "./discord-recommendation-inbox-core.mjs";

const recommendation = {
  title: "Change order approvals",
  problem: "Project changes need an auditable path before work continues.",
  outcome: "Customers and staff can approve scope and price changes clearly.",
  evidence: "Quotes, signatures, projects, and notifications already exist.",
  competitorGap: "Leading field-service tools make change orders standard.",
  integration: "Extend existing project, signing, and notification modules.",
  value: "High",
  effort: "Medium",
  risk: "Medium",
  confidence: "High",
  spec: {
    objects: ["change_order"],
    surfaces: ["workspace", "client_portal"],
    permissions: "Organization roles control drafting and approval.",
    tenancy: "Every record remains scoped to one organization.",
    rollout: "Ship behind an organization-aware preview flag.",
    observability: "Track approval completion and delivery failures.",
    acceptanceCriteria: ["A customer can approve a locked change order."],
    nonGoals: ["Accounting ledger"],
  },
};

test("accepts exactly four complete recommendation drafts", () => {
  const drafts = Array.from({ length: 4 }, (_, index) => ({
    ...recommendation,
    title: `${recommendation.title} ${index + 1}`,
  }));
  assert.equal(parseRecommendationDrafts(JSON.stringify(drafts)).length, 4);
});

test("rejects incomplete or incorrectly sized recommendation batches", () => {
  assert.throws(
    () => parseRecommendationDrafts(JSON.stringify([recommendation])),
    /Too small/,
  );
  assert.throws(
    () =>
      parseRecommendationDrafts(
        JSON.stringify(
          Array.from({ length: 4 }, () => ({
            ...recommendation,
            spec: { ...recommendation.spec, acceptanceCriteria: [] },
          })),
        ),
      ),
    /Too small/,
  );
});
