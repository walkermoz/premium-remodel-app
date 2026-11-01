import "server-only";

import { getBusinessConfigForOrganization } from "../business-config";
import { supabaseAdmin } from "../supabase/server";
import { simulateWorkflow } from "./simulator";
import { evaluateWorkflowCondition } from "./conditions";
import { executeWorkflowNode } from "./executors";
import { workflowNodeDefinition } from "./registry";
import { redactWorkflowValue } from "./redaction";
import {
  initialWorkflowRuntimeState,
  runWorkflowRuntime,
  WorkflowNodeExecutionError,
  type WorkflowRuntimeState,
  type WorkflowRuntimeStep,
  type WorkflowRuntimeWait,
} from "./runtime";
import {
  workflowDefinitionSchema,
  workflowEventSchema,
  type WorkflowContext,
  type WorkflowEvent,
  type WorkflowSettings,
} from "./schema";
import { ensureSeededWorkflows } from "./store";

type WorkflowEngineMode = "shadow" | "execute";

type EventRow = {
  id: string;
  organization_id: string;
  schema_version: number;
  event_type: string;
  actor: unknown;
  object_type: string;
  object_id: string;
  contact_id: string | null;
  occurred_at: string;
  correlation_id: string;
  causation_id: string | null;
  idempotency_key: string;
  payload: unknown;
};

type ClaimedWaitRow = {
  id: string;
  run_id: string;
  node_id: string;
  mode: string;
  wake_at: string | null;
  timeout_at: string | null;
  timeout_behavior?: string | null;
  condition?: unknown;
  continuation: unknown;
};

function eventFromRow(row: EventRow): WorkflowEvent {
  return workflowEventSchema.parse({
    id: row.id,
    schemaVersion: row.schema_version,
    type: row.event_type,
    organizationId: row.organization_id,
    actor: row.actor,
    objectType: row.object_type,
    objectId: row.object_id,
    ...(row.contact_id ? { contactId: row.contact_id } : {}),
    occurredAt: row.occurred_at,
    correlationId: row.correlation_id,
    ...(row.causation_id ? { causationId: row.causation_id } : {}),
    idempotencyKey: row.idempotency_key,
    payload: row.payload,
  });
}

function scopeKey(event: WorkflowEvent, settings: WorkflowSettings) {
  if (settings.concurrencyScope === "event") return `event:${event.id}`;
  if (settings.concurrencyScope === "contact")
    return `contact:${event.contactId || event.objectId}`;
  const payloadId = event.payload[`${settings.concurrencyScope}Id`];
  return `${settings.concurrencyScope}:${
    typeof payloadId === "string" && payloadId ? payloadId : event.objectId
  }`;
}

async function storedWorkflowObject(
  organizationId: string,
  kind: string,
  id: string,
) {
  const record = await supabaseAdmin()
    .from("remodel_records")
    .select("data")
    .eq("organization_id", organizationId)
    .eq("kind", kind)
    .eq("id", id)
    .maybeSingle();
  if (record.error) throw record.error;
  return record.data?.data as Record<string, unknown> | undefined;
}

function runStatus(simulation: ReturnType<typeof simulateWorkflow>) {
  if (!simulation.valid || simulation.stoppedReason)
    return "needs_attention" as const;
  if (simulation.steps.some((step) => step.status === "waiting"))
    return "waiting" as const;
  return "completed" as const;
}

async function persistShadowRun(input: {
  event: WorkflowEvent;
  workflowId: string;
  versionId: string;
  definition: ReturnType<typeof workflowDefinitionSchema.parse>;
  context: WorkflowContext;
}) {
  const admin = supabaseAdmin();
  const simulation = simulateWorkflow(
    input.definition,
    input.event,
    input.context,
  );
  if (!simulation.matchedTriggers.length) return null;

  const existing = await admin
    .from("remodel_workflow_runs")
    .select("id")
    .eq("event_id", input.event.id)
    .eq("version_id", input.versionId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.id;

  const now = new Date().toISOString();
  const status = runStatus(simulation);
  const enrollment = await admin
    .from("remodel_workflow_enrollments")
    .insert({
      organization_id: input.event.organizationId,
      workflow_id: input.workflowId,
      version_id: input.versionId,
      event_id: input.event.id,
      object_type: input.event.objectType,
      object_id: input.event.objectId,
      scope_key: scopeKey(input.event, input.definition.settings),
      reentry_key: input.event.idempotencyKey,
      status: status === "waiting" ? "active" : "completed",
      ...(status === "waiting" ? {} : { completed_at: now }),
    })
    .select("id")
    .single();
  if (enrollment.error) throw enrollment.error;

  const run = await admin
    .from("remodel_workflow_runs")
    .insert({
      organization_id: input.event.organizationId,
      workflow_id: input.workflowId,
      version_id: input.versionId,
      enrollment_id: enrollment.data.id,
      event_id: input.event.id,
      object_type: input.event.objectType,
      object_id: input.event.objectId,
      contact_id: input.event.contactId || null,
      correlation_id: input.event.correlationId,
      status,
      current_node_id: simulation.steps.at(-1)?.nodeId || null,
      context: redactWorkflowValue(input.context),
      summary: {
        mode: "shadow",
        matchedTriggers: simulation.matchedTriggers,
        plannedEffects: simulation.wouldMutate,
        stoppedReason: simulation.stoppedReason || null,
      },
      last_activity_at: now,
      ...(status === "completed" || status === "needs_attention"
        ? { completed_at: now }
        : {}),
    })
    .select("id")
    .single();
  if (run.error) {
    await admin
      .from("remodel_workflow_enrollments")
      .delete()
      .eq("id", enrollment.data.id);
    if (run.error.code === "23505") {
      const raced = await admin
        .from("remodel_workflow_runs")
        .select("id")
        .eq("event_id", input.event.id)
        .eq("version_id", input.versionId)
        .single();
      if (raced.error) throw raced.error;
      return raced.data.id;
    }
    throw run.error;
  }

  if (simulation.steps.length) {
    const steps = simulation.steps.map((step, index) => ({
      organization_id: input.event.organizationId,
      run_id: run.data.id,
      node_id: step.nodeId,
      node_type: step.nodeType,
      attempt: 1,
      status: step.status,
      input_snapshot: {
        sequence: step.sequence,
        branch: step.branch || null,
        conditions: redactWorkflowValue(step.conditions || []),
      },
      output_snapshot: redactWorkflowValue({
        summary: step.summary,
        preview: step.preview || {},
        shadow: true,
      }),
      idempotency_key: `shadow:${input.event.id}:${input.versionId}:${index}:${step.nodeId}`,
      completed_at: now,
    }));
    const savedSteps = await admin
      .from("remodel_workflow_step_runs")
      .insert(steps);
    if (savedSteps.error) throw savedSteps.error;
  }
  return run.data.id;
}

async function persistRuntimeSteps(input: {
  organizationId: string;
  runId: string;
  eventId: string;
  versionId: string;
  steps: WorkflowRuntimeStep[];
}) {
  if (!input.steps.length) return new Map<string, string>();
  const now = new Date().toISOString();
  const rows = input.steps.map((step) => ({
    organization_id: input.organizationId,
    run_id: input.runId,
    node_id: step.nodeId,
    node_type: step.nodeType,
    attempt: step.attempt,
    status: step.status,
    input_snapshot: redactWorkflowValue({ branch: step.branch || null }),
    output_snapshot: redactWorkflowValue({
      summary: step.summary,
      output: step.output || {},
    }),
    idempotency_key: `run:${input.runId}:${step.nodeId}:${step.attempt}`,
    completed_at: now,
  }));
  const saved = await supabaseAdmin()
    .from("remodel_workflow_step_runs")
    .upsert(rows, {
      onConflict: "organization_id,idempotency_key",
      ignoreDuplicates: true,
    })
    .select("id,node_id,attempt");
  if (saved.error) throw saved.error;
  const ids = new Map<string, string>();
  for (const row of saved.data || [])
    ids.set(`${row.node_id}:${row.attempt}`, row.id);
  if (ids.size < rows.length) {
    const existing = await supabaseAdmin()
      .from("remodel_workflow_step_runs")
      .select("id,node_id,attempt")
      .eq("run_id", input.runId);
    if (existing.error) throw existing.error;
    for (const row of existing.data || [])
      ids.set(`${row.node_id}:${row.attempt}`, row.id);
  }
  return ids;
}

async function cancelActiveScope(input: {
  organizationId: string;
  workflowId: string;
  scopeKey: string;
}) {
  const admin = supabaseAdmin();
  const active = await admin
    .from("remodel_workflow_enrollments")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("workflow_id", input.workflowId)
    .eq("scope_key", input.scopeKey)
    .eq("status", "active");
  if (active.error) throw active.error;
  const ids = (active.data || []).map((row) => row.id);
  if (!ids.length) return;
  const now = new Date().toISOString();
  const runs = await admin
    .from("remodel_workflow_runs")
    .update({ status: "cancelled", cancelled_at: now, completed_at: now })
    .in("enrollment_id", ids)
    .in("status", ["queued", "running", "waiting"])
    .select("id");
  if (runs.error) throw runs.error;
  const runIds = (runs.data || []).map((row) => row.id);
  if (runIds.length) {
    const waits = await admin
      .from("remodel_workflow_waits")
      .update({ status: "cancelled" })
      .in("run_id", runIds)
      .in("status", ["waiting", "claimed"]);
    if (waits.error) throw waits.error;
  }
  const enrollments = await admin
    .from("remodel_workflow_enrollments")
    .update({ status: "cancelled", cancelled_at: now })
    .in("id", ids)
    .eq("status", "active");
  if (enrollments.error) throw enrollments.error;
}

async function enrollmentAllowed(input: {
  event: WorkflowEvent;
  workflowId: string;
  settings: WorkflowSettings;
}) {
  const key = scopeKey(input.event, input.settings);
  const result = await supabaseAdmin()
    .from("remodel_workflow_enrollments")
    .select("id,status,started_at")
    .eq("organization_id", input.event.organizationId)
    .eq("workflow_id", input.workflowId)
    .eq("scope_key", key)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  const prior = result.data;
  if (!prior) return { allowed: true as const, scopeKey: key };
  if (prior.status === "active") {
    if (input.settings.duplicateEventPolicy === "restart") {
      await cancelActiveScope({
        organizationId: input.event.organizationId,
        workflowId: input.workflowId,
        scopeKey: key,
      });
      return { allowed: true as const, scopeKey: key };
    }
    if (input.settings.duplicateEventPolicy !== "parallel")
      return {
        allowed: false as const,
        scopeKey: key,
        reason: "active-enrollment",
      };
  }
  if (!input.settings.allowReentry && prior.status !== "active")
    return {
      allowed: false as const,
      scopeKey: key,
      reason: "reentry-disabled",
    };
  const cooldown = input.settings.reentryCooldownSeconds * 1_000;
  if (cooldown > 0 && Date.now() - Date.parse(prior.started_at) < cooldown)
    return {
      allowed: false as const,
      scopeKey: key,
      reason: "reentry-cooldown",
    };
  return { allowed: true as const, scopeKey: key };
}

async function executeRunSegment(input: {
  event: WorkflowEvent;
  workflowId: string;
  versionId: string;
  enrollmentId: string;
  runId: string;
  definition: ReturnType<typeof workflowDefinitionSchema.parse>;
  state?: WorkflowRuntimeState;
}) {
  const admin = supabaseAdmin();
  try {
    const result = await runWorkflowRuntime({
      definition: input.definition,
      event: input.event,
      ...(input.state ? { state: input.state } : {}),
      execute: ({ node, event, context, idempotencyKey }) =>
        executeWorkflowNode({
          organizationId: input.event.organizationId,
          runId: input.runId,
          node,
          event,
          context,
          idempotencyKey,
          settings: input.definition.settings,
        }),
    });
    const stepIds = await persistRuntimeSteps({
      organizationId: input.event.organizationId,
      runId: input.runId,
      eventId: input.event.id,
      versionId: input.versionId,
      steps: result.steps,
    });
    const now = new Date().toISOString();
    if (result.status === "waiting") {
      const waitStep = result.steps.at(-1)!;
      const stepRunId = stepIds.get(`${waitStep.nodeId}:${waitStep.attempt}`);
      if (!stepRunId)
        throw new Error("The workflow wait step could not be persisted.");
      const wait = result.wait as WorkflowRuntimeWait;
      const savedWait = await admin.from("remodel_workflow_waits").insert({
        organization_id: input.event.organizationId,
        run_id: input.runId,
        step_run_id: stepRunId,
        node_id: wait.nodeId,
        mode: wait.mode,
        wake_at: wait.wakeAt || null,
        awaited_event_type: wait.awaitedEventType || null,
        condition: wait.condition || null,
        timeout_at: wait.timeoutAt || null,
        timeout_behavior: wait.timeoutBehavior || "continue",
        continuation: wait.continuation,
      });
      if (savedWait.error) throw savedWait.error;
      const updated = await admin
        .from("remodel_workflow_runs")
        .update({
          status: "waiting",
          current_node_id: wait.nodeId,
          context: redactWorkflowValue(result.state.context),
          last_activity_at: now,
          summary: { mode: "execute", state: "waiting", waitMode: wait.mode },
        })
        .eq("id", input.runId)
        .eq("status", "running");
      if (updated.error) throw updated.error;
      return "waiting" as const;
    }
    const finishedRun = await admin
      .from("remodel_workflow_runs")
      .update({
        status: "completed",
        current_node_id: result.steps.at(-1)?.nodeId || null,
        context: redactWorkflowValue(result.state.context),
        summary: {
          mode: "execute",
          state: "completed",
          steps: result.state.executedSteps,
        },
        last_activity_at: now,
        completed_at: now,
      })
      .eq("id", input.runId);
    if (finishedRun.error) throw finishedRun.error;
    const finishedEnrollment = await admin
      .from("remodel_workflow_enrollments")
      .update({ status: "completed", completed_at: now })
      .eq("id", input.enrollmentId)
      .eq("status", "active");
    if (finishedEnrollment.error) throw finishedEnrollment.error;
    return "completed" as const;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 2_000)
        : "Unknown workflow error";
    const now = new Date().toISOString();
    if (error instanceof WorkflowNodeExecutionError) {
      await persistRuntimeSteps({
        organizationId: input.event.organizationId,
        runId: input.runId,
        eventId: input.event.id,
        versionId: input.versionId,
        steps: error.steps,
      });
      const retryKey = error.idempotencyKey;
      error.state.retries ||= {};
      const failureNumber = (error.state.retries[retryKey] || 0) + 1;
      error.state.retries[retryKey] = failureNumber;
      const delaySeconds = Math.min(
        input.definition.settings.retry.maxDelaySeconds,
        Math.round(
          input.definition.settings.retry.initialDelaySeconds *
            input.definition.settings.retry.multiplier **
              Math.max(0, failureNumber - 1),
        ),
      );
      const nextAttemptAt = new Date(
        Date.now() + delaySeconds * 1_000,
      ).toISOString();
      const failedStep = await admin
        .from("remodel_workflow_step_runs")
        .upsert(
          {
            organization_id: input.event.organizationId,
            run_id: input.runId,
            node_id: error.node.id,
            node_type: error.node.type,
            attempt: error.state.executedSteps,
            status: "failed",
            input_snapshot: { retry: failureNumber, idempotencyKey: retryKey },
            output_snapshot: {},
            error_code: "ACTION_FAILED",
            error_detail: message,
            idempotency_key: `run:${input.runId}:${error.node.id}:${error.state.executedSteps}`,
            completed_at: now,
            next_attempt_at:
              failureNumber < input.definition.settings.retry.maxAttempts
                ? nextAttemptAt
                : null,
          },
          { onConflict: "organization_id,idempotency_key" },
        )
        .select("id")
        .single();
      if (failedStep.error) throw failedStep.error;
      if (failureNumber < input.definition.settings.retry.maxAttempts) {
        const retryWait = await admin.from("remodel_workflow_waits").insert({
          organization_id: input.event.organizationId,
          run_id: input.runId,
          step_run_id: failedStep.data.id,
          node_id: error.node.id,
          mode: "retry",
          wake_at: nextAttemptAt,
          timeout_behavior: "retry",
          continuation: error.state,
        });
        if (retryWait.error) throw retryWait.error;
        const waitingRun = await admin
          .from("remodel_workflow_runs")
          .update({
            status: "waiting",
            current_node_id: error.node.id,
            context: redactWorkflowValue(error.state.context),
            summary: {
              mode: "execute",
              state: "retry_scheduled",
              attempt: failureNumber,
              nextAttemptAt,
              error: message,
            },
            last_activity_at: now,
          })
          .eq("id", input.runId);
        if (waitingRun.error) throw waitingRun.error;
        return "waiting" as const;
      }
      if (input.definition.settings.failureBehavior === "continue") {
        if (error.state.queue[0]?.nodeId === error.node.id)
          error.state.queue.shift();
        const next = [...error.node.outgoing].sort(
          (left, right) =>
            left.order - right.order || left.id.localeCompare(right.id),
        )[0];
        if (next)
          error.state.queue.unshift({ nodeId: next.to, branch: next.label });
        return executeRunSegment({ ...input, state: error.state });
      }
      if (input.definition.settings.failureBehavior === "stop") {
        const stoppedRun = await admin
          .from("remodel_workflow_runs")
          .update({
            status: "completed",
            current_node_id: error.node.id,
            context: redactWorkflowValue(error.state.context),
            summary: {
              mode: "execute",
              state: "stopped_on_failure",
              error: message,
            },
            last_activity_at: now,
            completed_at: now,
          })
          .eq("id", input.runId);
        if (stoppedRun.error) throw stoppedRun.error;
        const stoppedEnrollment = await admin
          .from("remodel_workflow_enrollments")
          .update({ status: "completed", completed_at: now })
          .eq("id", input.enrollmentId)
          .eq("status", "active");
        if (stoppedEnrollment.error) throw stoppedEnrollment.error;
        return "completed" as const;
      }
      const attentionWait = await admin.from("remodel_workflow_waits").insert({
        organization_id: input.event.organizationId,
        run_id: input.runId,
        step_run_id: failedStep.data.id,
        node_id: error.node.id,
        mode: "retry",
        timeout_behavior: "manual_retry",
        continuation: error.state,
        status: "needs_attention",
      });
      if (attentionWait.error) throw attentionWait.error;
      const attentionRun = await admin
        .from("remodel_workflow_runs")
        .update({
          status: "needs_attention",
          current_node_id: error.node.id,
          context: redactWorkflowValue(error.state.context),
          summary: {
            mode: "execute",
            state: "failed",
            error: message,
            retrySafe:
              workflowNodeDefinition(error.node.type)?.retry !== "none",
          },
          last_activity_at: now,
          completed_at: now,
        })
        .eq("id", input.runId);
      if (attentionRun.error) throw attentionRun.error;
      return "needs_attention" as const;
    }
    await admin
      .from("remodel_workflow_runs")
      .update({
        status: "needs_attention",
        summary: { mode: "execute", state: "failed", error: message },
        last_activity_at: now,
        completed_at: now,
      })
      .eq("id", input.runId);
    await admin
      .from("remodel_workflow_enrollments")
      .update({ status: "completed", completed_at: now })
      .eq("id", input.enrollmentId)
      .eq("status", "active");
    throw error;
  }
}

export async function retryWorkflowRun(input: {
  organizationId: string;
  workflowId: string;
  runId: string;
}) {
  const admin = supabaseAdmin();
  const runResult = await admin
    .from("remodel_workflow_runs")
    .select(
      "id,enrollment_id,event_id,workflow_id,version_id,status,current_node_id",
    )
    .eq("organization_id", input.organizationId)
    .eq("workflow_id", input.workflowId)
    .eq("id", input.runId)
    .maybeSingle();
  if (runResult.error) throw runResult.error;
  if (!runResult.data) throw new Error("Workflow run not found.");
  if (runResult.data.status !== "needs_attention")
    throw new Error("Only runs that need attention can be retried.");
  if (!runResult.data.enrollment_id || !runResult.data.event_id)
    throw new Error("This run does not have a resumable enrollment.");

  const waitResult = await admin
    .from("remodel_workflow_waits")
    .select("id,continuation,node_id")
    .eq("organization_id", input.organizationId)
    .eq("run_id", input.runId)
    .eq("status", "needs_attention")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (waitResult.error) throw waitResult.error;
  if (!waitResult.data)
    throw new Error("This failed action does not have a saved retry point.");

  const versionResult = await admin
    .from("remodel_workflow_versions")
    .select("graph,settings,layout")
    .eq("organization_id", input.organizationId)
    .eq("id", runResult.data.version_id)
    .single();
  if (versionResult.error) throw versionResult.error;
  const definition = workflowDefinitionSchema.parse(versionResult.data);
  const node = definition.graph.nodes.find(
    (item) => item.id === waitResult.data?.node_id,
  );
  if (!node || workflowNodeDefinition(node.type)?.retry === "none")
    throw new Error("This action is not marked safe to retry.");

  const eventResult = await admin
    .from("remodel_workflow_events")
    .select(
      "id,organization_id,schema_version,event_type,actor,object_type,object_id,contact_id,occurred_at,correlation_id,causation_id,idempotency_key,payload",
    )
    .eq("organization_id", input.organizationId)
    .eq("id", runResult.data.event_id)
    .single();
  if (eventResult.error) throw eventResult.error;

  const claimed = await admin
    .from("remodel_workflow_waits")
    .update({ status: "claimed", claimed_at: new Date().toISOString() })
    .eq("organization_id", input.organizationId)
    .eq("id", waitResult.data.id)
    .eq("status", "needs_attention")
    .select("id")
    .maybeSingle();
  if (claimed.error) throw claimed.error;
  if (!claimed.data) throw new Error("This run is already being retried.");

  const now = new Date().toISOString();
  const running = await admin
    .from("remodel_workflow_runs")
    .update({
      status: "running",
      completed_at: null,
      last_activity_at: now,
      summary: { mode: "execute", state: "manual_retry" },
    })
    .eq("organization_id", input.organizationId)
    .eq("id", input.runId)
    .eq("status", "needs_attention");
  if (running.error) throw running.error;

  try {
    const result = await executeRunSegment({
      event: eventFromRow(eventResult.data as EventRow),
      workflowId: input.workflowId,
      versionId: runResult.data.version_id,
      enrollmentId: runResult.data.enrollment_id,
      runId: input.runId,
      definition,
      state: structuredClone(
        waitResult.data.continuation,
      ) as WorkflowRuntimeState,
    });
    const resumed = await admin
      .from("remodel_workflow_waits")
      .update({ status: "resumed", resumed_at: new Date().toISOString() })
      .eq("organization_id", input.organizationId)
      .eq("id", waitResult.data.id)
      .eq("status", "claimed");
    if (resumed.error) throw resumed.error;
    return result;
  } catch (error) {
    await admin
      .from("remodel_workflow_waits")
      .update({ status: "needs_attention", claimed_at: null })
      .eq("organization_id", input.organizationId)
      .eq("id", waitResult.data.id)
      .eq("status", "claimed");
    await admin
      .from("remodel_workflow_runs")
      .update({
        status: "needs_attention",
        completed_at: new Date().toISOString(),
      })
      .eq("organization_id", input.organizationId)
      .eq("id", input.runId)
      .eq("status", "running");
    throw error;
  }
}

async function persistExecuteRun(input: {
  event: WorkflowEvent;
  workflowId: string;
  versionId: string;
  definition: ReturnType<typeof workflowDefinitionSchema.parse>;
  context: WorkflowContext;
}) {
  const admin = supabaseAdmin();
  const existing = await admin
    .from("remodel_workflow_runs")
    .select("id")
    .eq("event_id", input.event.id)
    .eq("version_id", input.versionId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.id;
  const enrollmentCheck = await enrollmentAllowed({
    event: input.event,
    workflowId: input.workflowId,
    settings: input.definition.settings,
  });
  if (!enrollmentCheck.allowed) return null;
  const enrollment = await admin
    .from("remodel_workflow_enrollments")
    .insert({
      organization_id: input.event.organizationId,
      workflow_id: input.workflowId,
      version_id: input.versionId,
      event_id: input.event.id,
      object_type: input.event.objectType,
      object_id: input.event.objectId,
      scope_key: enrollmentCheck.scopeKey,
      reentry_key: input.event.idempotencyKey,
      status: "active",
    })
    .select("id")
    .single();
  if (enrollment.error) throw enrollment.error;
  const run = await admin
    .from("remodel_workflow_runs")
    .insert({
      organization_id: input.event.organizationId,
      workflow_id: input.workflowId,
      version_id: input.versionId,
      enrollment_id: enrollment.data.id,
      event_id: input.event.id,
      object_type: input.event.objectType,
      object_id: input.event.objectId,
      contact_id: input.event.contactId || null,
      correlation_id: input.event.correlationId,
      status: "running",
      context: redactWorkflowValue(input.context),
      summary: { mode: "execute", state: "running" },
    })
    .select("id")
    .single();
  if (run.error) {
    await admin
      .from("remodel_workflow_enrollments")
      .delete()
      .eq("id", enrollment.data.id);
    if (run.error.code === "23505") {
      const raced = await admin
        .from("remodel_workflow_runs")
        .select("id")
        .eq("event_id", input.event.id)
        .eq("version_id", input.versionId)
        .single();
      if (raced.error) throw raced.error;
      return raced.data.id;
    }
    throw run.error;
  }
  await executeRunSegment({
    event: input.event,
    workflowId: input.workflowId,
    versionId: input.versionId,
    enrollmentId: enrollment.data.id,
    runId: run.data.id,
    definition: input.definition,
    state: initialWorkflowRuntimeState(
      input.definition,
      input.event,
      input.context,
    ),
  });
  return run.data.id;
}

async function resumeClaimedWorkflowWait(
  wait: ClaimedWaitRow,
  resumeEvent?: WorkflowEvent,
) {
  const admin = supabaseAdmin();
  const runResult = await admin
    .from("remodel_workflow_runs")
    .select(
      "id,enrollment_id,event_id,workflow_id,version_id,status,object_type,object_id",
    )
    .eq("id", wait.run_id)
    .single();
  if (runResult.error) throw runResult.error;
  if (runResult.data.status === "cancelled") {
    const cancelled = await admin
      .from("remodel_workflow_waits")
      .update({ status: "cancelled" })
      .eq("id", wait.id)
      .eq("status", "claimed");
    if (cancelled.error) throw cancelled.error;
    return "cancelled" as const;
  }
  const originalEvent = await admin
    .from("remodel_workflow_events")
    .select(
      "id,organization_id,schema_version,event_type,actor,object_type,object_id,contact_id,occurred_at,correlation_id,causation_id,idempotency_key,payload",
    )
    .eq("id", runResult.data.event_id)
    .single();
  if (originalEvent.error) throw originalEvent.error;
  const version = await admin
    .from("remodel_workflow_versions")
    .select("graph,settings,layout")
    .eq("id", runResult.data.version_id)
    .single();
  if (version.error) throw version.error;
  const definition = workflowDefinitionSchema.parse(version.data);
  const event = resumeEvent || eventFromRow(originalEvent.data as EventRow);
  const state = structuredClone(wait.continuation) as WorkflowRuntimeState;
  state.retries ||= {};
  if (resumeEvent) {
    state.context.event = {
      ...resumeEvent,
      payload: resumeEvent.payload,
      ...(resumeEvent.payload.changes
        ? { changes: resumeEvent.payload.changes }
        : {}),
    };
    state.context.actor = resumeEvent.actor as Record<string, unknown>;
    state.context.trigger = { eventType: resumeEvent.type };
  }
  if (wait.mode === "condition") {
    const kind =
      runResult.data.object_type === "item"
        ? "task"
        : runResult.data.object_type;
    const current = await storedWorkflowObject(
      event.organizationId,
      kind,
      runResult.data.object_id,
    );
    if (current) {
      if (runResult.data.object_type === "contact")
        state.context.contact = current;
      if (runResult.data.object_type === "lead") state.context.lead = current;
      if (runResult.data.object_type === "quote") state.context.quote = current;
      if (runResult.data.object_type === "project")
        state.context.project = current;
      if (runResult.data.object_type === "item") state.context.item = current;
    }
  }
  const conditionConfig = wait.condition as
    { ast?: unknown; pollSeconds?: unknown } | undefined;
  const condition = conditionConfig?.ast || wait.condition;
  if (
    condition &&
    !evaluateWorkflowCondition(
      condition as Parameters<typeof evaluateWorkflowCondition>[0],
      state.context,
    ).result
  ) {
    const pollSeconds = Number(conditionConfig?.pollSeconds || 900);
    const released = await admin
      .from("remodel_workflow_waits")
      .update({
        status: "waiting",
        claimed_at: null,
        claimed_by: null,
        ...(wait.mode === "condition"
          ? {
              wake_at: new Date(Date.now() + pollSeconds * 1_000).toISOString(),
            }
          : {}),
      })
      .eq("id", wait.id)
      .eq("status", "claimed");
    if (released.error) throw released.error;
    return "waiting" as const;
  }
  const timedOut =
    !resumeEvent &&
    Boolean(wait.timeout_at) &&
    Date.parse(wait.timeout_at!) <= Date.now() &&
    (!wait.wake_at || Date.parse(wait.timeout_at!) <= Date.parse(wait.wake_at));
  if (timedOut && wait.timeout_behavior === "exit") {
    const now = new Date().toISOString();
    const timedOutWait = await admin
      .from("remodel_workflow_waits")
      .update({ status: "timed_out", resumed_at: now })
      .eq("id", wait.id)
      .eq("status", "claimed");
    if (timedOutWait.error) throw timedOutWait.error;
    const finishedRun = await admin
      .from("remodel_workflow_runs")
      .update({
        status: "completed",
        current_node_id: wait.node_id,
        summary: { mode: "execute", state: "timeout_exit" },
        last_activity_at: now,
        completed_at: now,
      })
      .eq("id", runResult.data.id)
      .eq("status", "waiting");
    if (finishedRun.error) throw finishedRun.error;
    const finishedEnrollment = await admin
      .from("remodel_workflow_enrollments")
      .update({ status: "completed", completed_at: now })
      .eq("id", runResult.data.enrollment_id)
      .eq("status", "active");
    if (finishedEnrollment.error) throw finishedEnrollment.error;
    return "completed" as const;
  }
  const resumed = await admin
    .from("remodel_workflow_waits")
    .update({
      status: timedOut ? "timed_out" : "resumed",
      resumed_at: new Date().toISOString(),
    })
    .eq("id", wait.id)
    .eq("status", "claimed");
  if (resumed.error) throw resumed.error;
  const running = await admin
    .from("remodel_workflow_runs")
    .update({ status: "running", last_activity_at: new Date().toISOString() })
    .eq("id", runResult.data.id)
    .eq("status", "waiting");
  if (running.error) throw running.error;
  return executeRunSegment({
    event,
    workflowId: runResult.data.workflow_id,
    versionId: runResult.data.version_id,
    enrollmentId: runResult.data.enrollment_id,
    runId: runResult.data.id,
    definition,
    state,
  });
}

async function resumeMatchingEventWaits(event: WorkflowEvent) {
  const admin = supabaseAdmin();
  const claimed = await admin.rpc("remodel_claim_event_workflow_waits", {
    p_worker: `workflow-event-${process.pid}`,
    p_organization_id: event.organizationId,
    p_event_type: event.type,
    p_object_type: event.objectType,
    p_object_id: event.objectId,
    p_contact_id: event.contactId || null,
    p_limit: 100,
  });
  if (claimed.error) throw claimed.error;
  for (const wait of (claimed.data || []) as ClaimedWaitRow[]) {
    try {
      await resumeClaimedWorkflowWait(wait, event);
    } catch {
      await admin
        .from("remodel_workflow_waits")
        .update({ status: "waiting", claimed_at: null, claimed_by: null })
        .eq("id", wait.id)
        .eq("status", "claimed");
    }
  }
}

async function stopRunsOnContactResponse(event: WorkflowEvent) {
  if (event.type !== "sms.inbound.received") return;
  const admin = supabaseAdmin();
  let contactId = event.contactId;
  if (!contactId && typeof event.payload.from === "string") {
    const contact = await admin
      .from("remodel_records")
      .select("id")
      .eq("organization_id", event.organizationId)
      .eq("kind", "contact")
      .eq("data->>phone", event.payload.from)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (contact.error) throw contact.error;
    contactId = contact.data?.id;
  }
  if (!contactId) return;
  const activeRuns = await admin
    .from("remodel_workflow_runs")
    .select("id,enrollment_id,version_id")
    .eq("organization_id", event.organizationId)
    .eq("contact_id", contactId)
    .in("status", ["queued", "running", "waiting"]);
  if (activeRuns.error) throw activeRuns.error;
  if (!activeRuns.data.length) return;
  const versionIds = [...new Set(activeRuns.data.map((run) => run.version_id))];
  const versions = await admin
    .from("remodel_workflow_versions")
    .select("id,settings")
    .in("id", versionIds);
  if (versions.error) throw versions.error;
  const stopVersions = new Set(
    versions.data
      .filter(
        (version) =>
          (version.settings as { stopOnContactResponse?: unknown })
            .stopOnContactResponse === true,
      )
      .map((version) => version.id),
  );
  const stopped = activeRuns.data.filter((run) =>
    stopVersions.has(run.version_id),
  );
  if (!stopped.length) return;
  const now = new Date().toISOString();
  const runIds = stopped.map((run) => run.id);
  const enrollmentIds = stopped
    .map((run) => run.enrollment_id)
    .filter((id): id is string => Boolean(id));
  const cancelledRuns = await admin
    .from("remodel_workflow_runs")
    .update({
      status: "cancelled",
      cancelled_at: now,
      completed_at: now,
      summary: { mode: "execute", state: "stopped_on_contact_response" },
    })
    .in("id", runIds);
  if (cancelledRuns.error) throw cancelledRuns.error;
  if (enrollmentIds.length) {
    const cancelledEnrollments = await admin
      .from("remodel_workflow_enrollments")
      .update({ status: "cancelled", cancelled_at: now })
      .in("id", enrollmentIds)
      .eq("status", "active");
    if (cancelledEnrollments.error) throw cancelledEnrollments.error;
  }
  const cancelledWaits = await admin
    .from("remodel_workflow_waits")
    .update({ status: "cancelled" })
    .in("run_id", runIds)
    .in("status", ["waiting", "claimed"]);
  if (cancelledWaits.error) throw cancelledWaits.error;
}

export async function processWorkflowEvent(
  eventId: string,
  options: { mode: WorkflowEngineMode } = { mode: "shadow" },
) {
  const admin = supabaseAdmin();
  const eventResult = await admin
    .from("remodel_workflow_events")
    .select(
      "id,organization_id,schema_version,event_type,actor,object_type,object_id,contact_id,occurred_at,correlation_id,causation_id,idempotency_key,payload",
    )
    .eq("id", eventId)
    .single();
  if (eventResult.error) throw eventResult.error;
  const event = eventFromRow(eventResult.data as EventRow);

  if (options.mode === "execute") {
    await stopRunsOnContactResponse(event);
    await resumeMatchingEventWaits(event);
  }

  await ensureSeededWorkflows(event.organizationId);
  const subscriptions = await admin
    .from("remodel_workflow_trigger_subscriptions")
    .select("workflow_id,version_id,node_id")
    .eq("organization_id", event.organizationId)
    .eq("event_type", event.type);
  if (subscriptions.error) throw subscriptions.error;

  const targetWorkflowId =
    typeof event.payload.targetWorkflowId === "string"
      ? event.payload.targetWorkflowId
      : null;
  const targetVersionId =
    event.type === "schedule.reached" &&
    typeof event.payload.versionId === "string"
      ? event.payload.versionId
      : null;
  const matchingSubscriptions = targetVersionId
    ? subscriptions.data.filter((row) => row.version_id === targetVersionId)
    : targetWorkflowId
      ? subscriptions.data.filter((row) => row.workflow_id === targetWorkflowId)
      : subscriptions.data;

  const versionIds = targetVersionId
    ? [targetVersionId]
    : [...new Set(matchingSubscriptions.map((row) => row.version_id))];
  const versions = versionIds.length
    ? await admin
        .from("remodel_workflow_versions")
        .select("id,workflow_id,graph,settings,layout")
        .eq("organization_id", event.organizationId)
        .in("id", versionIds)
    : { data: [], error: null };
  if (versions.error) throw versions.error;

  const business = await getBusinessConfigForOrganization(event.organizationId);
  const context: WorkflowContext = {
    event: {
      ...event,
      payload: event.payload,
      ...(event.payload.changes ? { changes: event.payload.changes } : {}),
    },
    actor: event.actor as Record<string, unknown>,
    organization: {
      id: event.organizationId,
      name: business.profile.name,
      email: business.profile.email,
      phone: business.profile.phone,
      website: business.profile.website,
    },
  };
  const primaryKind = event.objectType === "item" ? "task" : event.objectType;
  if (["contact", "lead", "quote", "project", "task"].includes(primaryKind)) {
    const primary = await storedWorkflowObject(
      event.organizationId,
      primaryKind,
      event.objectId,
    );
    if (primary) {
      const contextKey = event.objectType as
        "contact" | "lead" | "quote" | "project" | "item";
      context[contextKey] = primary;
      const relatedContactId =
        event.contactId ||
        (typeof primary.contactId === "string" ? primary.contactId : undefined);
      if (relatedContactId && event.objectType !== "contact")
        context.contact = await storedWorkflowObject(
          event.organizationId,
          "contact",
          relatedContactId,
        );
      for (const relatedType of ["lead", "quote", "project"] as const) {
        if (relatedType === event.objectType) continue;
        const relatedId = primary[`${relatedType}Id`];
        if (typeof relatedId === "string")
          context[relatedType] = await storedWorkflowObject(
            event.organizationId,
            relatedType,
            relatedId,
          );
      }
    }
  }
  const runIds: string[] = [];
  for (const row of versions.data || []) {
    const definition = workflowDefinitionSchema.parse({
      graph: row.graph,
      settings: row.settings,
      layout: row.layout,
    });
    const runId =
      options.mode === "execute"
        ? await persistExecuteRun({
            event,
            workflowId: row.workflow_id,
            versionId: row.id,
            definition,
            context,
          })
        : await persistShadowRun({
            event,
            workflowId: row.workflow_id,
            versionId: row.id,
            definition,
            context,
          });
    if (runId) runIds.push(runId);
  }

  const completed = await admin
    .from("remodel_automation_outbox")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("event_id", event.id);
  if (completed.error) throw completed.error;
  return { eventId: event.id, mode: options.mode, runIds };
}

export async function processWorkflowOutbox(input?: {
  worker?: string;
  limit?: number;
  scheduleLimit?: number;
}) {
  const admin = supabaseAdmin();
  const worker = input?.worker || `workflow-shadow-${process.pid}`;
  const scheduled = await admin.rpc("remodel_enqueue_due_workflow_schedules", {
    p_limit: input?.scheduleLimit || 50,
  });
  if (scheduled.error) throw scheduled.error;
  const claimed = await admin.rpc("remodel_claim_workflow_outbox", {
    p_worker: worker,
    p_limit: input?.limit || 20,
  });
  if (claimed.error) throw claimed.error;
  const results: { eventId: string; status: "completed" | "failed" }[] = [];
  const mode: WorkflowEngineMode =
    process.env.WORKFLOW_ENGINE_MODE === "execute" ||
    process.env.WORKFLOW_CURRENT_FLOWS_MODE === "execute"
      ? "execute"
      : "shadow";
  for (const job of claimed.data || []) {
    try {
      await processWorkflowEvent(job.event_id, { mode });
      results.push({ eventId: job.event_id, status: "completed" });
    } catch (error) {
      const attempt = Number(job.attempt_count || 1);
      const delaySeconds = Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
      await admin
        .from("remodel_automation_outbox")
        .update({
          status: attempt >= 8 ? "needs_attention" : "failed",
          available_at: new Date(
            Date.now() + delaySeconds * 1000,
          ).toISOString(),
          last_error:
            error instanceof Error
              ? error.message.slice(0, 2_000)
              : "Unknown workflow error",
        })
        .eq("id", job.id);
      results.push({ eventId: job.event_id, status: "failed" });
    }
  }
  return Object.assign(results, {
    scheduled: (scheduled.data || []).map(
      (item: { event_id: string }) => item.event_id,
    ),
  });
}

export async function resumeDueWorkflowWaits(input?: {
  worker?: string;
  limit?: number;
}) {
  const admin = supabaseAdmin();
  const worker = input?.worker || `workflow-waits-${process.pid}`;
  const claimed = await admin.rpc("remodel_claim_due_workflow_waits", {
    p_worker: worker,
    p_limit: input?.limit || 20,
  });
  if (claimed.error) throw claimed.error;
  const results: {
    waitId: string;
    status: "completed" | "waiting" | "needs_attention" | "failed";
  }[] = [];
  for (const wait of (claimed.data || []) as ClaimedWaitRow[]) {
    try {
      const status = await resumeClaimedWorkflowWait(wait);
      if (status === "cancelled") continue;
      results.push({ waitId: wait.id, status });
    } catch (error) {
      await admin
        .from("remodel_workflow_waits")
        .update({ status: "waiting", claimed_at: null, claimed_by: null })
        .eq("id", wait.id)
        .eq("status", "claimed");
      results.push({ waitId: wait.id, status: "failed" });
      void error;
    }
  }
  return results;
}
