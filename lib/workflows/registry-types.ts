export {
  workflowConditionSchema,
  workflowEventTypeSchema,
  workflowEventSchema,
  workflowObjectTypeSchema,
  workflowOperandSchema,
} from "./schema";

export type WorkflowNodeKind =
  "trigger" | "action" | "decision" | "wait" | "control" | "terminal";
