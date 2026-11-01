import {
  evaluateWorkflowCondition,
  resolveWorkflowOperand,
} from "./conditions";
import { workflowNodeDefinition } from "./registry";
import type {
  WorkflowContext,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowEvent,
  WorkflowNode,
} from "./schema";
import { workflowCanPublish } from "./validate";

export type WorkflowRuntimeWork = {
  nodeId: string;
  branch?: string;
};

export type WorkflowRuntimeState = {
  queue: WorkflowRuntimeWork[];
  context: WorkflowContext;
  visits: Record<string, number>;
  executedSteps: number;
  startedAt: string;
  retries: Record<string, number>;
};

export type WorkflowRuntimeStep = {
  nodeId: string;
  nodeType: string;
  name: string;
  attempt: number;
  status: "matched" | "completed" | "skipped" | "waiting";
  summary: string;
  branch?: string;
  output?: Record<string, unknown>;
};

export type WorkflowRuntimeWait = {
  nodeId: string;
  mode: string;
  wakeAt?: string;
  awaitedEventType?: string;
  condition?: unknown;
  timeoutAt?: string;
  timeoutBehavior?: "continue" | "exit";
  continuation: WorkflowRuntimeState;
};

export type WorkflowRuntimeExecutor = (input: {
  node: WorkflowNode;
  definition: WorkflowDefinition;
  event: WorkflowEvent;
  context: WorkflowContext;
  idempotencyKey: string;
}) => Promise<{
  status?: "completed" | "skipped";
  summary?: string;
  output?: Record<string, unknown>;
}>;

export class WorkflowNodeExecutionError extends Error {
  readonly node: WorkflowNode;
  readonly state: WorkflowRuntimeState;
  readonly steps: WorkflowRuntimeStep[];
  readonly idempotencyKey: string;

  constructor(input: {
    node: WorkflowNode;
    state: WorkflowRuntimeState;
    steps: WorkflowRuntimeStep[];
    idempotencyKey: string;
    cause: unknown;
  }) {
    super(
      input.cause instanceof Error
        ? input.cause.message
        : `The ${input.node.name} step failed.`,
      { cause: input.cause },
    );
    this.name = "WorkflowNodeExecutionError";
    this.node = input.node;
    this.state = structuredClone(input.state);
    this.steps = structuredClone(input.steps);
    this.idempotencyKey = input.idempotencyKey;
  }
}

function sorted(edges: WorkflowEdge[]) {
  return [...edges].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
}

function durationMilliseconds(amount: number, unit: string) {
  const multiplier =
    unit === "seconds"
      ? 1_000
      : unit === "minutes"
        ? 60_000
        : unit === "hours"
          ? 3_600_000
          : 86_400_000;
  return amount * multiplier;
}

function communicationWindowAllows(
  date: Date,
  timezone: string,
  days: number[],
  start: string,
  end: string,
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    value.weekday,
  );
  const minute = Number(value.hour) * 60 + Number(value.minute);
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return (
    days.includes(day) &&
    minute >= startHour * 60 + startMinute &&
    minute < endHour * 60 + endMinute
  );
}

function nextCommunicationWindow(definition: WorkflowDefinition, now: Date) {
  const window = definition.settings.communicationWindow;
  if (!window.enabled) return null;
  if (
    communicationWindowAllows(
      now,
      definition.settings.timezone,
      window.days,
      window.start,
      window.end,
    )
  )
    return null;
  for (let minute = 1; minute <= 8 * 24 * 60; minute += 1) {
    const candidate = new Date(now.getTime() + minute * 60_000);
    if (
      communicationWindowAllows(
        candidate,
        definition.settings.timezone,
        window.days,
        window.start,
        window.end,
      )
    )
      return candidate.toISOString();
  }
  throw new Error(
    "No permitted communication window occurs in the next eight days.",
  );
}

function waitFromNode(
  node: WorkflowNode,
  state: WorkflowRuntimeState,
  context: WorkflowContext,
  now: Date,
): WorkflowRuntimeWait {
  const mode = String(node.config.mode || "duration");
  let wakeAt: string | undefined;
  let timeoutAt: string | undefined;
  let awaitedEventType: string | undefined;
  let condition: unknown;
  if (mode === "duration")
    wakeAt = new Date(
      now.getTime() +
        durationMilliseconds(
          Number(node.config.amount || 1),
          String(node.config.unit || "seconds"),
        ),
    ).toISOString();
  if (mode === "timestamp") {
    const value = resolveWorkflowOperand(
      context,
      node.config.timestamp as Parameters<typeof resolveWorkflowOperand>[1],
    );
    if (typeof value === "string" && Number.isFinite(Date.parse(value)))
      wakeAt = value;
  }
  if (mode === "relative") {
    const value = resolveWorkflowOperand(
      context,
      node.config.date as Parameters<typeof resolveWorkflowOperand>[1],
    );
    if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
      const offset = durationMilliseconds(
        Number(node.config.amount || 1),
        String(node.config.unit || "minutes"),
      );
      wakeAt = new Date(
        Date.parse(value) +
          (node.config.direction === "before" ? -offset : offset),
      ).toISOString();
    }
  }
  if (mode === "event") {
    awaitedEventType = String(node.config.eventType || "");
    if (node.config.condition)
      condition = { ast: node.config.condition, eventType: awaitedEventType };
  }
  if (mode === "condition") {
    const pollSeconds = Number(node.config.pollSeconds || 900);
    wakeAt = new Date(now.getTime() + pollSeconds * 1_000).toISOString();
    condition = { ast: node.config.condition, pollSeconds };
  }
  const timeoutSeconds = Number(node.config.timeoutSeconds || 0);
  if (timeoutSeconds > 0)
    timeoutAt = new Date(now.getTime() + timeoutSeconds * 1_000).toISOString();
  return {
    nodeId: node.id,
    mode,
    ...(wakeAt ? { wakeAt } : {}),
    ...(awaitedEventType ? { awaitedEventType } : {}),
    ...(condition ? { condition } : {}),
    ...(timeoutAt ? { timeoutAt } : {}),
    ...(timeoutAt
      ? {
          timeoutBehavior:
            node.config.timeoutBehavior === "exit" ? "exit" : "continue",
        }
      : {}),
    continuation: structuredClone(state),
  };
}

export function initialWorkflowRuntimeState(
  definition: WorkflowDefinition,
  event: WorkflowEvent,
  context: WorkflowContext = {},
): WorkflowRuntimeState {
  return {
    queue: definition.graph.entryNodeIds.map((nodeId) => ({ nodeId })),
    context: {
      ...context,
      event: {
        ...event,
        ...context.event,
        payload: event.payload,
        ...(event.payload.changes ? { changes: event.payload.changes } : {}),
      },
      actor: event.actor as Record<string, unknown>,
      trigger: { eventType: event.type },
      outputs: { ...(context.outputs || {}) },
    },
    visits: {},
    executedSteps: 0,
    startedAt: new Date().toISOString(),
    retries: {},
  };
}

export async function runWorkflowRuntime(input: {
  definition: WorkflowDefinition;
  event: WorkflowEvent;
  execute: WorkflowRuntimeExecutor;
  state?: WorkflowRuntimeState;
  now?: Date;
}) {
  const validation = workflowCanPublish(input.definition);
  if (!validation.valid || !validation.definition)
    throw new Error("Cannot execute an invalid workflow definition.");
  const definition = validation.definition;
  const state = structuredClone(
    input.state || initialWorkflowRuntimeState(definition, input.event),
  );
  const nodes = new Map(definition.graph.nodes.map((node) => [node.id, node]));
  const steps: WorkflowRuntimeStep[] = [];
  const now = input.now || new Date();

  while (state.queue.length) {
    if (
      now.getTime() - Date.parse(state.startedAt) >
      definition.settings.maximumRuntimeSeconds * 1_000
    )
      throw new Error("Maximum workflow lifetime reached.");
    const work = state.queue.shift()!;
    const node = nodes.get(work.nodeId);
    if (!node) throw new Error(`Workflow node ${work.nodeId} is missing.`);
    state.executedSteps += 1;
    state.visits[node.id] = (state.visits[node.id] || 0) + 1;
    if (state.executedSteps > definition.settings.maximumSteps)
      throw new Error("Maximum workflow steps reached.");
    if (state.visits[node.id] > definition.settings.maximumVisitsPerNode)
      throw new Error(`Maximum visits reached for ${node.name}.`);

    if (node.kind === "trigger") {
      const eventType = node.config.eventType;
      const filter = node.config.filters as
        Parameters<typeof evaluateWorkflowCondition>[0] | undefined;
      const matched =
        eventType === input.event.type &&
        (!filter || evaluateWorkflowCondition(filter, state.context).result);
      steps.push({
        nodeId: node.id,
        nodeType: node.type,
        name: node.name,
        attempt: state.executedSteps,
        status: matched ? "matched" : "skipped",
        summary: matched
          ? `Matched ${input.event.type}.`
          : "Trigger did not match.",
      });
      if (matched) {
        const next = sorted(node.outgoing)[0];
        if (next) state.queue.unshift({ nodeId: next.to, branch: next.label });
      }
      continue;
    }

    if (node.type === "logic.ifElse") {
      let selected: WorkflowEdge | undefined;
      const branchResults: Array<Record<string, unknown>> = [];
      for (const edge of sorted(node.outgoing)) {
        if (edge.kind === "fallback") {
          selected ||= edge;
          branchResults.push({
            edgeId: edge.id,
            label: edge.label,
            kind: edge.kind,
            selected: false,
            reason: "Fallback runs only when no earlier branch matches.",
          });
          continue;
        }
        const evaluation = edge.condition
          ? evaluateWorkflowCondition(edge.condition, state.context)
          : { result: false, reason: "No condition is configured." };
        branchResults.push({
          edgeId: edge.id,
          label: edge.label,
          kind: edge.kind,
          selected: false,
          reason: evaluation.reason,
        });
        if (evaluation.result) {
          selected = edge;
          break;
        }
      }
      for (const branch of branchResults)
        branch.selected = branch.edgeId === selected?.id;
      steps.push({
        nodeId: node.id,
        nodeType: node.type,
        name: node.name,
        attempt: state.executedSteps,
        status: "completed",
        summary: selected
          ? `Selected ${selected.label}.`
          : "No branch matched.",
        branch: selected?.label,
        output: { branches: branchResults },
      });
      if (selected)
        state.queue.unshift({ nodeId: selected.to, branch: selected.label });
      continue;
    }

    if (node.type === "logic.router") {
      const selected: WorkflowEdge[] = [];
      let fallback: WorkflowEdge | undefined;
      const branchResults: Array<Record<string, unknown>> = [];
      for (const edge of sorted(node.outgoing)) {
        if (edge.kind === "fallback") {
          fallback = edge;
          branchResults.push({
            edgeId: edge.id,
            label: edge.label,
            kind: edge.kind,
            selected: false,
            reason: "Fallback runs only when no other branch matches.",
          });
          continue;
        }
        const evaluation =
          edge.kind === "always"
            ? { result: true, reason: "Always run branch." }
            : edge.condition
              ? evaluateWorkflowCondition(edge.condition, state.context)
              : { result: false, reason: "No condition is configured." };
        branchResults.push({
          edgeId: edge.id,
          label: edge.label,
          kind: edge.kind,
          selected: evaluation.result,
          reason: evaluation.reason,
        });
        if (evaluation.result) selected.push(edge);
      }
      if (!selected.length && fallback) selected.push(fallback);
      for (const branch of branchResults)
        branch.selected = selected.some((edge) => edge.id === branch.edgeId);
      steps.push({
        nodeId: node.id,
        nodeType: node.type,
        name: node.name,
        attempt: state.executedSteps,
        status: "completed",
        summary: selected.length
          ? `Selected ${selected.map((edge) => edge.label).join(", ")}.`
          : "No branch matched.",
        output: { branches: branchResults },
      });
      state.queue.unshift(
        ...selected.map((edge) => ({ nodeId: edge.to, branch: edge.label })),
      );
      continue;
    }

    if (node.kind === "wait") {
      if (node.config.mode === "timestamp") {
        const timestamp = resolveWorkflowOperand(
          state.context,
          node.config.timestamp as Parameters<typeof resolveWorkflowOperand>[1],
        );
        const isPast =
          typeof timestamp === "string" &&
          Number.isFinite(Date.parse(timestamp)) &&
          Date.parse(timestamp) <= now.getTime();
        if (isPast) {
          const pastBehavior = String(node.config.pastBehavior || "continue");
          if (pastBehavior === "skip_communications")
            state.context.event = {
              ...(state.context.event || {}),
              skipCommunications: true,
            };
          if (pastBehavior !== "exit") {
            const next = sorted(node.outgoing)[0];
            if (next)
              state.queue.unshift({ nodeId: next.to, branch: next.label });
          }
          steps.push({
            nodeId: node.id,
            nodeType: node.type,
            name: node.name,
            attempt: state.executedSteps,
            status: "completed",
            summary:
              pastBehavior === "exit"
                ? "Timestamp already passed; this path ended."
                : pastBehavior === "skip_communications"
                  ? "Timestamp already passed; later communications will be skipped."
                  : "Timestamp already passed; continued immediately.",
            branch: work.branch,
          });
          continue;
        }
      }
      const next = sorted(node.outgoing)[0];
      if (next) state.queue.unshift({ nodeId: next.to, branch: next.label });
      const wait = waitFromNode(node, state, state.context, now);
      steps.push({
        nodeId: node.id,
        nodeType: node.type,
        name: node.name,
        attempt: state.executedSteps,
        status: "waiting",
        summary: `Waiting by ${wait.mode}.`,
        branch: work.branch,
      });
      return { status: "waiting" as const, state, steps, wait };
    }

    if (node.kind === "terminal") {
      steps.push({
        nodeId: node.id,
        nodeType: node.type,
        name: node.name,
        attempt: state.executedSteps,
        status: "completed",
        summary: String(node.config.reason || "Path completed."),
        branch: work.branch,
      });
      continue;
    }

    if (
      [
        "action.sendEmail",
        "action.sendSms",
        "action.internalNotification",
      ].includes(node.type)
    ) {
      if (state.context.event?.skipCommunications === true) {
        steps.push({
          nodeId: node.id,
          nodeType: node.type,
          name: node.name,
          attempt: state.executedSteps,
          status: "skipped",
          summary: "Skipped because the workflow timestamp has already passed.",
          branch: work.branch,
        });
        const next = sorted(node.outgoing)[0];
        if (next) state.queue.unshift({ nodeId: next.to, branch: next.label });
        continue;
      }
      const wakeAt = nextCommunicationWindow(definition, now);
      if (wakeAt) {
        state.queue.unshift(work);
        state.visits[node.id] -= 1;
        const wait: WorkflowRuntimeWait = {
          nodeId: node.id,
          mode: "timestamp",
          wakeAt,
          continuation: structuredClone(state),
        };
        steps.push({
          nodeId: node.id,
          nodeType: node.type,
          name: node.name,
          attempt: state.executedSteps,
          status: "waiting",
          summary: `Waiting for the permitted communication window at ${wakeAt}.`,
          branch: work.branch,
        });
        return { status: "waiting" as const, state, steps, wait };
      }
    }

    const registered = workflowNodeDefinition(node.type);
    if (!registered)
      throw new Error(`Node type ${node.type} is not registered.`);
    const idempotencyKey = `${input.event.id}:${node.id}:${state.visits[node.id]}`;
    let result: Awaited<ReturnType<WorkflowRuntimeExecutor>>;
    try {
      result = await input.execute({
        node,
        definition,
        event: input.event,
        context: state.context,
        idempotencyKey,
      });
    } catch (cause) {
      state.queue.unshift(work);
      state.visits[node.id] -= 1;
      throw new WorkflowNodeExecutionError({
        node,
        state,
        steps,
        idempotencyKey,
        cause,
      });
    }
    if (node.outputAlias && result.output)
      state.context.outputs = {
        ...(state.context.outputs || {}),
        [node.outputAlias]: result.output,
      };
    steps.push({
      nodeId: node.id,
      nodeType: node.type,
      name: node.name,
      attempt: state.executedSteps,
      status: result.status || "completed",
      summary: result.summary || `Ran ${registered.name}.`,
      branch: work.branch,
      output: result.output,
    });
    const next = sorted(node.outgoing)[0];
    if (next) state.queue.unshift({ nodeId: next.to, branch: next.label });
  }
  return { status: "completed" as const, state, steps };
}
