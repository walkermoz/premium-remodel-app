import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWorkflowRuns,
  workflowNeedsDispatch,
} from "./discord-command-sync.mjs";

test("dispatches when no workflow run exists", () => {
  assert.equal(
    workflowNeedsDispatch([], Date.parse("2026-11-08T15:00:00Z")),
    true,
  );
});

test("does not dispatch while a workflow run is active", () => {
  assert.equal(
    workflowNeedsDispatch(
      [{ createdAt: "2026-11-08T12:00:00Z", status: "in_progress" }],
      Date.parse("2026-11-08T15:00:00Z"),
    ),
    false,
  );
});

test("respects the minimum interval after a completed run", () => {
  const runs = [{ createdAt: "2026-11-08T14:57:00Z", status: "completed" }];
  assert.equal(
    workflowNeedsDispatch(runs, Date.parse("2026-11-08T15:00:00Z")),
    false,
  );
  assert.equal(
    workflowNeedsDispatch(runs, Date.parse("2026-11-08T15:03:00Z")),
    true,
  );
});

test("parses GitHub workflow output", () => {
  assert.deepEqual(
    parseWorkflowRuns(
      '[{"createdAt":"2026-11-08T15:00:00Z","status":"completed"}]',
    ),
    [{ createdAt: "2026-11-08T15:00:00Z", status: "completed" }],
  );
});
