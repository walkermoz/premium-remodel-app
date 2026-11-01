import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { executeWorkflowNode } from "@/lib/workflows/executors";
import { workflowNodeDefinition } from "@/lib/workflows/registry";
import { redactWorkflowValue } from "@/lib/workflows/redaction";
import {
  workflowEventSchema,
  type WorkflowContext,
} from "@/lib/workflows/schema";
import { getWorkflow } from "@/lib/workflows/store";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

const inputSchema = z.object({
  testId: z.uuid(),
  nodeId: z.string().trim().min(1).max(120),
  confirmation: z.literal("RUN EXTERNAL TEST"),
  event: workflowEventSchema,
  context: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let runId = "";
  let stepId = "";
  let organizationId = "";
  try {
    checkOrigin(request);
    const user = await requireUser();
    organizationId = user.organizationId;
    await requireWorkspaceTabs(user, "Automation");
    if (user.role !== "admin")
      throw new HttpError(
        403,
        "Only administrators can test an external action.",
      );
    const { id } = await context.params;
    const workflow = await getWorkflow(user.organizationId, z.uuid().parse(id));
    if (!workflow.draftVersionId)
      throw new HttpError(
        409,
        "Save the workflow draft before testing an action.",
      );
    const input = inputSchema.parse(await request.json());
    const node = workflow.draft.graph.nodes.find(
      (candidate) => candidate.id === input.nodeId,
    );
    if (!node) throw new HttpError(404, "Workflow action not found.");
    const capability = workflowNodeDefinition(node.type);
    if (!capability?.sideEffect || !capability.connection)
      throw new HttpError(
        400,
        "Only one email, SMS, notification, or webhook action can be tested here.",
      );

    const admin = supabaseAdmin();
    runId = input.testId;
    const prior = await admin
      .from("remodel_workflow_runs")
      .select("id,status,summary")
      .eq("organization_id", user.organizationId)
      .eq("id", runId)
      .maybeSingle();
    if (prior.error) throw prior.error;
    if (prior.data)
      return Response.json(
        {
          runId: prior.data.id,
          status: prior.data.status,
          summary: prior.data.summary,
          reused: true,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );

    const event = workflowEventSchema.parse({
      ...input.event,
      organizationId: user.organizationId,
    });
    const insertedRun = await admin.from("remodel_workflow_runs").insert({
      id: runId,
      organization_id: user.organizationId,
      workflow_id: workflow.id,
      version_id: workflow.draftVersionId,
      object_type: event.objectType,
      object_id: event.objectId,
      contact_id: event.contactId || null,
      correlation_id: event.correlationId,
      status: "running",
      current_node_id: node.id,
      context: redactWorkflowValue(input.context),
      summary: {
        mode: "single_action_test",
        action: capability.name,
        state: "running",
      },
    });
    if (insertedRun.error) throw insertedRun.error;

    stepId = randomUUID();
    const idempotencyKey = `external-action-test:${input.testId}:${node.id}`;
    const insertedStep = await admin.from("remodel_workflow_step_runs").insert({
      id: stepId,
      organization_id: user.organizationId,
      run_id: runId,
      node_id: node.id,
      node_type: node.type,
      attempt: 1,
      status: "running",
      input_snapshot: {
        mode: "single_action_test",
        eventType: event.type,
        objectType: event.objectType,
        objectId: event.objectId,
      },
      idempotency_key: idempotencyKey,
    });
    if (insertedStep.error) throw insertedStep.error;

    const executionContext: WorkflowContext = {
      ...input.context,
      event: {
        ...event,
        payload: event.payload,
        ...(event.payload.changes ? { changes: event.payload.changes } : {}),
      },
      trigger: { eventType: event.type },
      actor: event.actor,
      outputs: {
        ...((input.context.outputs as Record<
          string,
          Record<string, unknown>
        >) || {}),
      },
    };
    const result = await executeWorkflowNode({
      organizationId: user.organizationId,
      runId,
      node,
      event,
      context: executionContext,
      idempotencyKey,
      settings: workflow.draft.settings,
    });
    const completedAt = new Date().toISOString();
    const stepStatus = result.status === "skipped" ? "skipped" : "completed";
    const stepUpdate = await admin
      .from("remodel_workflow_step_runs")
      .update({
        status: stepStatus,
        output_snapshot: redactWorkflowValue({
          summary: result.summary,
          output: result.output || {},
        }),
        completed_at: completedAt,
      })
      .eq("organization_id", user.organizationId)
      .eq("id", stepId);
    if (stepUpdate.error) throw stepUpdate.error;
    const runUpdate = await admin
      .from("remodel_workflow_runs")
      .update({
        status: "completed",
        current_node_id: null,
        summary: {
          mode: "single_action_test",
          action: capability.name,
          state: stepStatus,
          detail: result.summary || "External action test completed.",
        },
        last_activity_at: completedAt,
        completed_at: completedAt,
      })
      .eq("organization_id", user.organizationId)
      .eq("id", runId);
    if (runUpdate.error) throw runUpdate.error;
    return Response.json(
      {
        runId,
        status: stepStatus,
        summary: result.summary || "External action test completed.",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (runId && organizationId) {
      const completedAt = new Date().toISOString();
      if (stepId)
        await supabaseAdmin()
          .from("remodel_workflow_step_runs")
          .update({
            status: "failed",
            error_code: "EXTERNAL_TEST_FAILED",
            error_detail:
              error instanceof Error
                ? error.message
                : "External action test failed.",
            completed_at: completedAt,
          })
          .eq("organization_id", organizationId)
          .eq("id", stepId);
      await supabaseAdmin()
        .from("remodel_workflow_runs")
        .update({
          status: "needs_attention",
          summary: {
            mode: "single_action_test",
            state: "failed",
            detail:
              error instanceof Error
                ? error.message
                : "External action test failed.",
          },
          last_activity_at: completedAt,
          completed_at: completedAt,
        })
        .eq("organization_id", organizationId)
        .eq("id", runId);
    }
    return apiError(error);
  }
}
