import {
  evaluateWorkflowCondition,
  interpolateWorkflowText,
  resolveWorkflowOperand,
  type ConditionTrace,
} from "./conditions";
import { workflowNodeDefinition } from "./registry";
import {
  type WorkflowContext,
  type WorkflowDefinition,
  type WorkflowEdge,
  type WorkflowEvent,
  type WorkflowNode,
} from "./schema";
import { workflowCanPublish } from "./validate";

export type WorkflowSimulationStep = {
  sequence: number;
  nodeId: string;
  nodeType: string;
  name: string;
  status:
    "matched" | "planned" | "skipped" | "waiting" | "completed" | "blocked";
  summary: string;
  branch?: string;
  conditions?: ConditionTrace[];
  preview?: Record<string, unknown>;
};

export type WorkflowSimulation = {
  valid: boolean;
  issues: ReturnType<typeof workflowCanPublish>["issues"];
  matchedTriggers: string[];
  steps: WorkflowSimulationStep[];
  wouldMutate: { nodeId: string; action: string; objectType?: string }[];
  stoppedReason?: string;
};

function sorted(edges: WorkflowEdge[]) {
  return [...edges].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
}

function previewAction(node: WorkflowNode, context: WorkflowContext) {
  const config = node.config;
  if (node.type === "action.sendEmail" || node.type === "action.sendSms") {
    const missing =
      config.missingValueBehavior === "fallback" ||
      config.missingValueBehavior === "skip" ||
      config.missingValueBehavior === "error"
        ? config.missingValueBehavior
        : "blank";
    const body = interpolateWorkflowText(String(config.body || ""), context, {
      missing,
      fallback:
        typeof config.fallbackValue === "string"
          ? config.fallbackValue
          : undefined,
    });
    const recipient = resolveWorkflowOperand(
      context,
      config.recipient as Parameters<typeof resolveWorkflowOperand>[1],
    );
    return {
      recipient,
      body: body.value,
      skipped: config.enabled === false || body.skipped,
      systemPolicy:
        node.type === "action.sendSms"
          ? "SMS consent and DND enforced"
          : undefined,
    };
  }
  if (node.type === "action.internalNotification")
    return {
      title: interpolateWorkflowText(String(config.title || ""), context).value,
      body: interpolateWorkflowText(String(config.body || ""), context).value,
      skipped: config.enabled === false,
    };
  if (node.type.startsWith("action.create"))
    return {
      operation: "create",
      fields: Object.keys((config.fields as object) || {}),
    };
  if (node.type.startsWith("action.update"))
    return {
      operation: "update",
      fields: Object.keys((config.fields as object) || {}),
    };
  if (node.type === "system.smsPolicyGate")
    return {
      policy: "Consent, recipient ownership, DND, and organization number",
    };
  return {};
}

export function simulateWorkflow(
  definitionInput: unknown,
  event: WorkflowEvent,
  contextInput: WorkflowContext = {},
): WorkflowSimulation {
  const validation = workflowCanPublish(definitionInput);
  if (!validation.definition || !validation.valid)
    return {
      valid: false,
      issues: validation.issues,
      matchedTriggers: [],
      steps: [],
      wouldMutate: [],
      stoppedReason: "Workflow validation failed.",
    };

  const definition: WorkflowDefinition = validation.definition;
  const nodes = new Map(definition.graph.nodes.map((node) => [node.id, node]));
  const context: WorkflowContext = {
    ...contextInput,
    event: {
      ...event,
      ...contextInput.event,
      payload: event.payload,
      ...(event.payload.changes ? { changes: event.payload.changes } : {}),
    },
    trigger: { eventType: event.type },
    actor: event.actor as Record<string, unknown>,
    outputs: { ...(contextInput.outputs || {}) },
  };
  const steps: WorkflowSimulationStep[] = [];
  const matchedTriggers: string[] = [];
  const wouldMutate: WorkflowSimulation["wouldMutate"] = [];
  const visits = new Map<string, number>();
  let total = 0;
  let stoppedReason: string | undefined;

  const append = (step: Omit<WorkflowSimulationStep, "sequence">) =>
    steps.push({ sequence: steps.length + 1, ...step });

  const run = (nodeId: string, branch?: string) => {
    if (stoppedReason) return;
    const node = nodes.get(nodeId);
    if (!node) {
      stoppedReason = `Node ${nodeId} is missing.`;
      return;
    }
    total += 1;
    const count = (visits.get(node.id) || 0) + 1;
    visits.set(node.id, count);
    if (total > definition.settings.maximumSteps) {
      stoppedReason = "Maximum workflow steps reached.";
      return;
    }
    if (count > definition.settings.maximumVisitsPerNode) {
      stoppedReason = `Maximum visits reached for ${node.name}.`;
      return;
    }

    const registered = workflowNodeDefinition(node.type);
    if (!registered) {
      stoppedReason = `Node type ${node.type} is not registered.`;
      return;
    }

    if (node.kind === "trigger") {
      const eventType = node.config.eventType;
      const filter = node.config.filters as
        Parameters<typeof evaluateWorkflowCondition>[0] | undefined;
      const filterTrace = filter
        ? evaluateWorkflowCondition(filter, context)
        : undefined;
      if (eventType !== event.type || (filterTrace && !filterTrace.result)) {
        append({
          nodeId: node.id,
          nodeType: node.type,
          name: node.name,
          status: "skipped",
          summary:
            eventType !== event.type
              ? "Event type did not match."
              : "Trigger filters did not match.",
          conditions: filterTrace ? [filterTrace] : undefined,
        });
        return;
      }
      matchedTriggers.push(node.id);
      append({
        nodeId: node.id,
        nodeType: node.type,
        name: node.name,
        status: "matched",
        summary: `Matched ${event.type}.`,
        conditions: filterTrace ? [filterTrace] : undefined,
      });
      const next = sorted(node.outgoing)[0];
      if (next) run(next.to, next.label);
      return;
    }

    if (node.type === "logic.ifElse") {
      const traces: ConditionTrace[] = [];
      const branches: Array<Record<string, unknown>> = [];
      let selected: WorkflowEdge | undefined;
      for (const edge of sorted(node.outgoing)) {
        if (edge.kind === "fallback") {
          selected ||= edge;
          branches.push({
            label: edge.label,
            kind: edge.kind,
            selected: false,
            reason: "Fallback runs only when no earlier branch matches.",
          });
          continue;
        }
        const trace = edge.condition
          ? evaluateWorkflowCondition(edge.condition, context)
          : { result: false, reason: "No condition is configured." };
        if (edge.condition) traces.push(trace as ConditionTrace);
        branches.push({
          label: edge.label,
          kind: edge.kind,
          selected: false,
          reason: trace.reason,
        });
        if (trace.result && !selected) {
          selected = edge;
        }
      }
      for (const item of branches)
        item.selected = item.label === selected?.label;
      append({
        nodeId: node.id,
        nodeType: node.type,
        name: node.name,
        status: "planned",
        summary: selected
          ? `First matching branch: ${selected.label}.`
          : "No branch matched.",
        branch: selected?.label,
        conditions: traces,
        preview: { branches },
      });
      if (selected) run(selected.to, selected.label);
      return;
    }

    if (node.type === "logic.router") {
      const selected: { edge: WorkflowEdge; trace?: ConditionTrace }[] = [];
      const traces: ConditionTrace[] = [];
      const branches: Array<Record<string, unknown>> = [];
      let fallback: WorkflowEdge | undefined;
      for (const edge of sorted(node.outgoing)) {
        if (edge.kind === "fallback") {
          fallback = edge;
          branches.push({
            label: edge.label,
            kind: edge.kind,
            selected: false,
            reason: "Fallback runs only when no other branch matches.",
          });
          continue;
        }
        if (edge.kind === "always") {
          selected.push({ edge });
          branches.push({
            label: edge.label,
            kind: edge.kind,
            selected: true,
            reason: "Always run branch.",
          });
          continue;
        }
        const trace = edge.condition
          ? evaluateWorkflowCondition(edge.condition, context)
          : { result: false, reason: "No condition is configured." };
        if (edge.condition) traces.push(trace as ConditionTrace);
        branches.push({
          label: edge.label,
          kind: edge.kind,
          selected: trace.result,
          reason: trace.reason,
        });
        if (trace.result)
          selected.push({ edge, trace: trace as ConditionTrace });
      }
      if (!selected.length && fallback) selected.push({ edge: fallback });
      for (const item of branches)
        item.selected = selected.some(({ edge }) => edge.label === item.label);
      append({
        nodeId: node.id,
        nodeType: node.type,
        name: node.name,
        status: "planned",
        summary: selected.length
          ? `Run ${selected.map(({ edge }) => edge.label).join(", ")} in order.`
          : "No branch matched.",
        conditions: traces,
        preview: { branches },
      });
      for (const { edge } of selected) run(edge.to, edge.label);
      return;
    }

    if (node.kind === "wait") {
      append({
        nodeId: node.id,
        nodeType: node.type,
        name: node.name,
        status: "waiting",
        summary: `Would wait using ${String(node.config.mode)} mode.`,
        branch,
        preview: node.config,
      });
      return;
    }

    if (node.kind === "terminal") {
      append({
        nodeId: node.id,
        nodeType: node.type,
        name: node.name,
        status: "completed",
        summary: String(node.config.reason || "Path completed."),
        branch,
      });
      return;
    }

    const preview = previewAction(node, context);
    const skipped = preview.skipped === true;
    append({
      nodeId: node.id,
      nodeType: node.type,
      name: node.name,
      status: skipped ? "skipped" : "planned",
      summary: skipped
        ? `${node.name} is disabled or missing a required value.`
        : registered.systemControlled
          ? `${node.name} is enforced by the platform.`
          : `Would run ${node.name}.`,
      branch,
      preview,
    });
    if (registered.sideEffect && !skipped)
      wouldMutate.push({
        nodeId: node.id,
        action: registered.executor,
        objectType: node.type
          .match(/(Contact|Lead|Quote|Project|Item)/i)?.[1]
          ?.toLocaleLowerCase(),
      });

    const alias = node.outputAlias;
    if (alias)
      context.outputs = {
        ...(context.outputs || {}),
        [alias]: { simulated: true, nodeId: node.id },
      };
    const next = sorted(node.outgoing)[0];
    if (next) run(next.to, next.label);
  };

  for (const entryId of definition.graph.entryNodeIds) run(entryId);
  return {
    valid: true,
    issues: validation.issues,
    matchedTriggers,
    steps,
    wouldMutate,
    ...(stoppedReason ? { stoppedReason } : {}),
  };
}
