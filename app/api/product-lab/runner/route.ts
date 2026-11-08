import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  postImplementationApproval,
  postProductDeliveryUpdate,
  updateRecommendationBatch,
} from "@/lib/product-lab/discord";
import {
  claimProductCouncilTask,
  completeGenerationRun,
  failProductCouncilTask,
  markImplementationEvidencePosted,
  recordImplementationEvidence,
  recordImplementationPr,
  recordMergeResult,
  recordProductAgentStarted,
  recordProductionDeployment,
} from "@/lib/product-lab/orchestrator";
import {
  createRecommendationBatch,
  retireActiveRecommendationBatches,
} from "@/lib/product-lab/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const sha = z.string().regex(/^[a-f0-9]{40}$/i);
const httpsUrl = z.string().url().refine((value) => value.startsWith("https://"));
const recommendationSchema = z.object({
  title: z.string().trim().min(4).max(240),
  problem: z.string().trim().min(20).max(1500),
  outcome: z.string().trim().min(20).max(1200),
  evidence: z.string().trim().min(20).max(1200),
  competitorGap: z.string().trim().min(10).max(1000),
  integration: z.string().trim().min(20).max(1200),
  value: z.enum(["Medium", "High"]),
  effort: z.enum(["Small", "Medium", "Large"]),
  risk: z.enum(["Low", "Medium", "High"]),
  confidence: z.enum(["Medium", "High"]),
  spec: z.record(z.string(), z.unknown()),
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("claim"),
    canRunCodex: z.boolean().optional().default(true),
  }),
  z.object({
    action: z.literal("started"),
    taskType: z.enum(["implementation", "recommendations"]),
    taskId: z.string().uuid(),
    agentId: z.string().min(2).max(300),
    runId: z.string().min(2).max(300),
    modelId: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal("implementation_finished"),
    implementationId: z.string().uuid(),
    prUrl: httpsUrl,
    branchName: z.string().min(1).max(250),
    resultSummary: z.string().max(4000).optional(),
  }),
  z.object({
    action: z.literal("generation_finished"),
    generationId: z.string().uuid(),
    recommendations: z.array(recommendationSchema).length(4),
    resultSummary: z.string().max(4000).optional(),
  }),
  z.object({
    action: z.literal("failed"),
    taskType: z.enum(["implementation", "recommendations", "merge"]),
    taskId: z.string().uuid(),
    status: z.enum(["failed", "blocked"]),
    message: z.string().min(1).max(4000),
  }),
  z.object({
    action: z.literal("ci_evidence"),
    prUrl: httpsUrl,
    headSha: sha,
    previewUrl: httpsUrl,
    branchName: z.string().min(1).max(250),
    checks: z.record(z.string(), z.unknown()),
  }),
  z.object({
    action: z.literal("merge_finished"),
    implementationId: z.string().uuid(),
    mergeSha: sha,
    prUrl: httpsUrl,
  }),
  z.object({
    action: z.literal("deployment_finished"),
    mergeSha: sha,
    success: z.boolean(),
    productionUrl: httpsUrl.optional(),
    summary: z.string().min(1).max(4000),
  }),
]);

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!authorized(request))
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Invalid product-council runner request." },
      { status: 400 },
    );

  const body = parsed.data;
  try {
    if (body.action === "claim")
      return Response.json({
        task: await claimProductCouncilTask({
          includeCodexTasks: body.canRunCodex,
        }),
      });

    if (body.action === "started") {
      await recordProductAgentStarted(body);
      return Response.json({ ok: true });
    }

    if (body.action === "implementation_finished") {
      await recordImplementationPr(body);
      return Response.json({ ok: true });
    }

    if (body.action === "generation_finished") {
      const retired = await retireActiveRecommendationBatches();
      await Promise.allSettled(retired.map(updateRecommendationBatch));
      const batch = await createRecommendationBatch(
        `product-council-${body.generationId}`,
        body.recommendations,
      );
      await completeGenerationRun({
        generationId: body.generationId,
        summary:
          body.resultSummary ||
          `Generated recommendation batch ${batch.id} from operator evidence.`,
      });
      return Response.json({ ok: true, batchId: batch.id });
    }

    if (body.action === "failed") {
      await failProductCouncilTask(body);
      await postProductDeliveryUpdate({
        channel: "approval",
        title: "Product council run needs attention",
        description: body.message,
        success: false,
      });
      return Response.json({ ok: true });
    }

    if (body.action === "ci_evidence") {
      const evidence = await recordImplementationEvidence(body);
      if (!evidence) return Response.json({ ok: true, matched: false });
      const posted = await postImplementationApproval(evidence);
      await markImplementationEvidencePosted({
        implementationId: evidence.id,
        channelId: posted.channelId,
        messageId: posted.id,
      });
      return Response.json({ ok: true, implementationId: evidence.id });
    }

    if (body.action === "merge_finished") {
      await recordMergeResult(body);
      await postProductDeliveryUpdate({
        channel: "approval",
        title: "Approved implementation merged",
        description:
          "The exact reviewed commit was merged. Production CI/CD is now running and will report in #cicd.",
        url: body.prUrl,
      });
      return Response.json({ ok: true });
    }

    const deployment = await recordProductionDeployment(body);
    if (deployment)
      await postProductDeliveryUpdate({
        channel: "cicd",
        title: body.success
          ? "Approved product implementation deployed"
          : "Approved product implementation failed to deploy",
        description: body.summary,
        url: body.productionUrl || deployment.pr_url,
        success: body.success,
      });
    return Response.json({ ok: true, matched: Boolean(deployment) });
  } catch (error) {
    console.error("Product council runner request failed", {
      action: body.action,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return Response.json(
      { error: "The product-council runner request failed." },
      { status: 500 },
    );
  }
}
