import type { WorkflowSettings } from "./schema";

export type WorkflowFailureAction = "continue" | "stop" | "needs_attention";

export function workflowFailureAction(
  settings: WorkflowSettings,
  errorCode: string,
): WorkflowFailureAction {
  if (settings.failureBehavior === "continue") return "continue";
  if (
    settings.failureBehavior === "stop" &&
    errorCode !== "CONFIGURATION_REQUIRED"
  )
    return "stop";
  return "needs_attention";
}
