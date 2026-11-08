import assert from "node:assert/strict";
import test from "node:test";
import {
  implementationTask,
  parsePullRequestUrl,
} from "./discord-approval-inbox-core.mjs";

test("normalizes an approved recommendation for the current chat", () => {
  assert.deepEqual(
    implementationTask({
      id: "implementation-1",
      servicebuddy_product_recommendations: {
        title: "Route approvals into Codex chat",
        summary: { outcome: "One continuous conversation" },
      },
      servicebuddy_product_spec_versions: [
        { spec: { acceptanceCriteria: ["Open a PR"] } },
      ],
    }),
    {
      id: "implementation-1",
      title: "Route approvals into Codex chat",
      summary: { outcome: "One continuous conversation" },
      spec: { acceptanceCriteria: ["Open a PR"] },
      repositoryUrl: "https://github.com/walkermoz/premium-remodel-app",
      startingRef: "main",
    },
  );
});

test("accepts pull requests from only the configured repository", () => {
  assert.equal(
    parsePullRequestUrl(
      "https://github.com/walkermoz/premium-remodel-app/pull/52",
    ),
    52,
  );
  assert.throws(
    () => parsePullRequestUrl("https://github.com/other/repo/pull/52"),
    /outside the configured repository/,
  );
});
