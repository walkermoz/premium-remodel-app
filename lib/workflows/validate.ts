import { workflowNodeDefinition } from "./registry";
import {
  workflowDefinitionSchema,
  type WorkflowDefinition,
  type WorkflowEdge,
  type WorkflowNode,
} from "./schema";

export type WorkflowValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

function sorted(edges: WorkflowEdge[]) {
  return [...edges].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
}

export function validateWorkflowDefinition(input: unknown): {
  definition?: WorkflowDefinition;
  issues: WorkflowValidationIssue[];
} {
  const parsed = workflowDefinitionSchema.safeParse(input);
  if (!parsed.success)
    return {
      issues: parsed.error.issues.map((issue) => ({
        severity: "error" as const,
        code: "schema",
        message: `${issue.path.join(".") || "workflow"}: ${issue.message}`,
      })),
    };

  const definition = parsed.data;
  const issues: WorkflowValidationIssue[] = [];
  const nodes = new Map<string, WorkflowNode>();
  const aliases = new Set<string>();

  for (const node of definition.graph.nodes) {
    if (nodes.has(node.id))
      issues.push({
        severity: "error",
        code: "duplicate_node",
        message: `Node ID ${node.id} is used more than once.`,
        nodeId: node.id,
      });
    nodes.set(node.id, node);
    if (node.outputAlias) {
      if (aliases.has(node.outputAlias))
        issues.push({
          severity: "error",
          code: "duplicate_alias",
          message: `Output alias ${node.outputAlias} is used more than once.`,
          nodeId: node.id,
        });
      aliases.add(node.outputAlias);
    }

    const registered = workflowNodeDefinition(node.type);
    if (!registered) {
      issues.push({
        severity: "error",
        code: "unknown_node_type",
        message: `Node type ${node.type} is not registered.`,
        nodeId: node.id,
      });
      continue;
    }
    if (registered.kind !== node.kind)
      issues.push({
        severity: "error",
        code: "node_kind",
        message: `${node.name} must be a ${registered.kind} node.`,
        nodeId: node.id,
      });
    const config = registered.validate(node.config);
    if (!config.valid)
      for (const error of config.issues)
        issues.push({
          severity: "error",
          code: "node_config",
          message: `${node.name}: ${error.path || "configuration"} ${error.message}`,
          nodeId: node.id,
        });
  }

  const incoming = new Map<string, WorkflowNode[]>();
  for (const node of definition.graph.nodes)
    for (const edge of node.outgoing)
      incoming.set(edge.to, [...(incoming.get(edge.to) || []), node]);
  for (const node of definition.graph.nodes.filter(
    (candidate) => candidate.type === "action.sendSms",
  )) {
    const parents = incoming.get(node.id) || [];
    if (
      !parents.length ||
      parents.some((parent) => parent.type !== "system.smsPolicyGate")
    )
      issues.push({
        severity: "error",
        code: "sms_policy_gate",
        message: `${node.name} must be immediately preceded by the required SMS consent and DND policy gate.`,
        nodeId: node.id,
      });
  }

  for (const entryId of definition.graph.entryNodeIds) {
    const entry = nodes.get(entryId);
    if (!entry)
      issues.push({
        severity: "error",
        code: "missing_entry",
        message: `Entry node ${entryId} does not exist.`,
      });
    else if (entry.kind !== "trigger")
      issues.push({
        severity: "error",
        code: "entry_not_trigger",
        message: `${entry.name} is an entry node but is not a trigger.`,
        nodeId: entry.id,
      });
  }

  const edgeIds = new Set<string>();
  for (const node of definition.graph.nodes) {
    for (const edge of node.outgoing) {
      if (edgeIds.has(edge.id))
        issues.push({
          severity: "error",
          code: "duplicate_edge",
          message: `Edge ID ${edge.id} is used more than once.`,
          nodeId: node.id,
          edgeId: edge.id,
        });
      edgeIds.add(edge.id);
      if (!nodes.has(edge.to))
        issues.push({
          severity: "error",
          code: "missing_target",
          message: `${node.name} points to missing node ${edge.to}.`,
          nodeId: node.id,
          edgeId: edge.id,
        });
    }

    if (node.kind === "terminal" && node.outgoing.length)
      issues.push({
        severity: "error",
        code: "terminal_outgoing",
        message: `${node.name} cannot have an outgoing step.`,
        nodeId: node.id,
      });
    if (!["decision"].includes(node.kind) && node.outgoing.length > 1)
      issues.push({
        severity: "error",
        code: "implicit_fanout",
        message: `${node.name} has multiple paths. Use an explicit Router.`,
        nodeId: node.id,
      });

    if (node.type === "logic.ifElse") {
      const fallback = node.outgoing.filter((edge) => edge.kind === "fallback");
      if (fallback.length !== 1)
        issues.push({
          severity: "error",
          code: "ifelse_fallback",
          message: `${node.name} requires exactly one fallback branch.`,
          nodeId: node.id,
        });
      for (const edge of node.outgoing.filter(
        (edge) => edge.kind !== "fallback",
      ))
        if (!edge.condition)
          issues.push({
            severity: "error",
            code: "ifelse_condition",
            message: `${edge.label} needs a condition.`,
            nodeId: node.id,
            edgeId: edge.id,
          });
      if (sorted(node.outgoing).at(-1)?.kind !== "fallback")
        issues.push({
          severity: "error",
          code: "fallback_order",
          message: `${node.name}'s fallback must be the final branch.`,
          nodeId: node.id,
        });
    }
    if (node.type === "logic.router") {
      const fallback = node.outgoing.filter((edge) => edge.kind === "fallback");
      if (fallback.length > 1)
        issues.push({
          severity: "error",
          code: "router_fallback",
          message: `${node.name} can have at most one fallback branch.`,
          nodeId: node.id,
        });
      for (const edge of node.outgoing) {
        if (edge.kind === "branch" && !edge.condition)
          issues.push({
            severity: "error",
            code: "router_condition",
            message: `${edge.label} needs a condition.`,
            nodeId: node.id,
            edgeId: edge.id,
          });
        if (["always", "fallback"].includes(edge.kind) && edge.condition)
          issues.push({
            severity: "error",
            code: "router_unexpected_condition",
            message: `${edge.label} cannot have a condition.`,
            nodeId: node.id,
            edgeId: edge.id,
          });
      }
      if (fallback.length && sorted(node.outgoing).at(-1)?.kind !== "fallback")
        issues.push({
          severity: "error",
          code: "fallback_order",
          message: `${node.name}'s fallback must be the final branch.`,
          nodeId: node.id,
        });
    }
  }

  const reachable = new Set<string>();
  const visit = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const edge of nodes.get(id)?.outgoing || [])
      if (nodes.has(edge.to)) visit(edge.to);
  };
  for (const entry of definition.graph.entryNodeIds) visit(entry);
  for (const node of definition.graph.nodes)
    if (!reachable.has(node.id))
      issues.push({
        severity: "error",
        code: "unreachable",
        message: `${node.name} cannot be reached from a trigger.`,
        nodeId: node.id,
      });

  const active = new Set<string>();
  const complete = new Set<string>();
  const detectCycle = (node: WorkflowNode) => {
    if (complete.has(node.id)) return;
    active.add(node.id);
    for (const edge of node.outgoing) {
      const target = nodes.get(edge.to);
      if (!target) continue;
      if (active.has(target.id) && node.type !== "control.goto")
        issues.push({
          severity: "error",
          code: "implicit_cycle",
          message: `The loop from ${node.name} must pass through an explicit Go To node.`,
          nodeId: node.id,
          edgeId: edge.id,
        });
      else if (!active.has(target.id)) detectCycle(target);
    }
    active.delete(node.id);
    complete.add(node.id);
  };
  for (const entry of definition.graph.entryNodeIds) {
    const node = nodes.get(entry);
    if (node) detectCycle(node);
  }

  if (!definition.graph.nodes.some((node) => node.kind === "terminal"))
    issues.push({
      severity: "error",
      code: "missing_terminal",
      message: "The workflow needs at least one End workflow node.",
    });

  return { definition, issues };
}

export function workflowCanPublish(input: unknown) {
  const result = validateWorkflowDefinition(input);
  return {
    ...result,
    valid: !result.issues.some((issue) => issue.severity === "error"),
  };
}
