import {
  quoteFlowConditionsMatch,
  quoteFlowBlockContract,
  type QuoteFlowBlock,
  type QuoteFlowCondition,
  type QuoteFlowDefinition,
  type QuoteFlowAudience,
  type QuoteFlowStage,
} from "./quote-flow-schema";

export type QuoteFlowProgressStatus =
  "complete" | "current" | "blocked" | "pending";

export type QuoteFlowCompletionContext = {
  values?: Record<string, unknown>;
  bindings?: Record<string, boolean>;
  resolveCondition?: (condition: QuoteFlowCondition) => unknown;
  audience?: QuoteFlowAudience;
};

export type QuoteFlowStageProgress = {
  stageId: string;
  required: number;
  completed: number;
  missing: QuoteFlowBlock[];
  complete: boolean;
};

const valueRequiredTypes = new Set<QuoteFlowBlock["type"]>([
  "custom_text",
  "custom_number",
  "custom_currency",
  "custom_date",
  "custom_checkbox",
  "custom_select",
  "custom_multiselect",
  "custom_file",
  "signature",
  "initials",
  "deposit_collection",
  "internal_approval",
]);

export function quoteFlowValueIsComplete(
  block: QuoteFlowBlock,
  value: unknown,
) {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (block.type === "custom_checkbox") return value === true;
  if (["signature", "initials"].includes(block.type))
    return (
      typeof value === "object" &&
      value !== null &&
      ("signedAt" in value ||
        (value as Record<string, unknown>).method === "agreement_packet")
    );
  if (block.type === "deposit_collection")
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Record<string, unknown>).status === "paid"
    );
  if (block.type === "internal_approval")
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Record<string, unknown>).approved === true
    );
  return true;
}

export function quoteFlowBlockIsComplete(
  block: QuoteFlowBlock,
  context: QuoteFlowCompletionContext,
) {
  if (!block.required) return true;
  if (block.bindingKey && block.bindingKey in (context.bindings || {}))
    return Boolean(context.bindings?.[block.bindingKey]);
  if (block.id in (context.values || {}))
    return quoteFlowValueIsComplete(block, context.values?.[block.id]);
  return (
    quoteFlowBlockContract(block).completionRule === "automatic" &&
    !valueRequiredTypes.has(block.type)
  );
}

export function visibleQuoteFlowBlocks(
  stage: QuoteFlowStage,
  context: QuoteFlowCompletionContext,
) {
  const resolve = context.resolveCondition || (() => undefined);
  if (!stage.enabled || !quoteFlowConditionsMatch(stage.conditions, resolve))
    return [];
  return stage.blocks.filter(
    (block) =>
      block.enabled &&
      (!context.audience ||
        context.audience === "both" ||
        block.audience === "both" ||
        block.audience === context.audience) &&
      quoteFlowConditionsMatch(block.conditions, resolve),
  );
}

export function quoteFlowStageProgress(
  stage: QuoteFlowStage,
  context: QuoteFlowCompletionContext,
): QuoteFlowStageProgress {
  const required = visibleQuoteFlowBlocks(stage, context).filter(
    (block) => block.required,
  );
  const missing = required.filter(
    (block) => !quoteFlowBlockIsComplete(block, context),
  );
  return {
    stageId: stage.id,
    required: required.length,
    completed: required.length - missing.length,
    missing,
    complete: required.length === 0 || missing.length === 0,
  };
}

export function quoteFlowDefinitionProgress(
  definition: QuoteFlowDefinition,
  context: QuoteFlowCompletionContext,
) {
  const resolve = context.resolveCondition || (() => undefined);
  return definition.stages
    .filter(
      (stage) =>
        stage.enabled && quoteFlowConditionsMatch(stage.conditions, resolve),
    )
    .map((stage) => quoteFlowStageProgress(stage, context));
}

export function missingRequiredQuoteFlowBlocks(
  stage: QuoteFlowStage | undefined,
  context: QuoteFlowCompletionContext,
) {
  return stage ? quoteFlowStageProgress(stage, context).missing : [];
}
