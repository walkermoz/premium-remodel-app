import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  ProductImplementationEvidence,
  ProductImplementationStatus,
} from "./types";

const repositoryUrl =
  process.env.PRODUCT_COUNCIL_REPOSITORY_URL ||
  "https://github.com/walkermoz/premium-remodel-app";

type ImplementationRow = {
  id: string;
  recommendation_id: string;
  status: ProductImplementationStatus;
  pr_url: string | null;
  pr_number: number | null;
  branch_name: string | null;
  head_sha: string | null;
  preview_url: string | null;
  codex_model: string | null;
  checks: Record<string, unknown> | null;
  servicebuddy_product_recommendations:
    | {
        title: string;
        summary: Record<string, unknown>;
        servicebuddy_product_spec_versions:
          | { spec: Record<string, unknown> }
          | { spec: Record<string, unknown> }[]
          | null;
      }
    | {
        title: string;
        summary: Record<string, unknown>;
        servicebuddy_product_spec_versions:
          | { spec: Record<string, unknown> }
          | { spec: Record<string, unknown> }[]
          | null;
      }[]
    | null;
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function recommendation(row: ImplementationRow) {
  const recommendationRow = one(row.servicebuddy_product_recommendations);
  if (!recommendationRow)
    throw new Error("The approved recommendation is missing.");
  const spec = one(recommendationRow.servicebuddy_product_spec_versions)?.spec;
  if (!spec) throw new Error("The locked recommendation specification is missing.");
  return { ...recommendationRow, spec };
}

const implementationSelect =
  "id,recommendation_id,status,pr_url,pr_number,branch_name,head_sha,preview_url,codex_model,checks,servicebuddy_product_recommendations(title,summary,servicebuddy_product_spec_versions(spec))";

async function recoverStaleClaims() {
  const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin()
    .from("servicebuddy_product_implementations")
    .update({ status: "queued", claimed_at: null })
    .eq("status", "running")
    .lt("claimed_at", staleBefore)
    .is("pr_url", null);
}

export async function claimProductCouncilTask(input?: {
  includeCodexTasks?: boolean;
}) {
  const db = supabaseAdmin();
  await recoverStaleClaims();

  const { data: mergeCandidate, error: mergeLoadError } = await db
    .from("servicebuddy_product_implementations")
    .select(implementationSelect)
    .eq("status", "merge_approved")
    .order("approved_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (mergeLoadError) throw mergeLoadError;
  if (mergeCandidate) {
    const { data, error } = await db
      .from("servicebuddy_product_implementations")
      .update({ status: "merging", claimed_at: new Date().toISOString() })
      .eq("id", mergeCandidate.id)
      .eq("status", "merge_approved")
      .select(implementationSelect)
      .maybeSingle();
    if (error) throw error;
    if (data)
      return {
        type: "merge" as const,
        id: data.id as string,
        prUrl: data.pr_url as string,
        prNumber: data.pr_number as number,
        headSha: data.head_sha as string,
        title: recommendation(data as unknown as ImplementationRow).title,
      };
  }

  if (input?.includeCodexTasks === false) return null;

  const { data: implementationCandidate, error: implementationLoadError } =
    await db
      .from("servicebuddy_product_implementations")
      .select(implementationSelect)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
  if (implementationLoadError) throw implementationLoadError;
  if (implementationCandidate) {
    const { data, error } = await db
      .from("servicebuddy_product_implementations")
      .update({ status: "running", claimed_at: new Date().toISOString() })
      .eq("id", implementationCandidate.id)
      .eq("status", "queued")
      .select(implementationSelect)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const details = recommendation(data as unknown as ImplementationRow);
      return {
        type: "implementation" as const,
        id: data.id as string,
        title: details.title,
        summary: details.summary,
        spec: details.spec,
        repositoryUrl,
        startingRef: "main",
      };
    }
  }

  const { data: activeGeneration, error: activeGenerationError } = await db
    .from("servicebuddy_product_generation_runs")
    .select("id")
    .eq("status", "running")
    .limit(1)
    .maybeSingle();
  if (activeGenerationError) throw activeGenerationError;
  if (activeGeneration) return null;

  const { data: signals, error: signalError } = await db
    .from("servicebuddy_product_signals")
    .select("id,body,source,created_at")
    .eq("status", "new")
    .order("created_at", { ascending: true })
    .limit(50);
  if (signalError) throw signalError;
  if (!signals?.length) return null;

  const { data: generation, error: generationError } = await db
    .from("servicebuddy_product_generation_runs")
    .insert({ signal_ids: signals.map((signal) => signal.id), status: "running" })
    .select("id")
    .single();
  if (generationError) {
    if (generationError.code === "23505") return null;
    throw generationError;
  }
  return {
    type: "recommendations" as const,
    id: generation.id as string,
    repositoryUrl,
    startingRef: "main",
    signals: signals.map((signal) => ({
      body: signal.body as string,
      source: signal.source as string,
      createdAt: signal.created_at as string,
    })),
  };
}

export async function recordProductAgentStarted(input: {
  taskType: "implementation" | "recommendations";
  taskId: string;
  agentId: string;
  runId: string;
  modelId: string;
}) {
  const table =
    input.taskType === "implementation"
      ? "servicebuddy_product_implementations"
      : "servicebuddy_product_generation_runs";
  const { error } = await supabaseAdmin()
    .from(table)
    .update({
      codex_agent_id: input.agentId,
      codex_run_id: input.runId,
      codex_model: input.modelId,
      ...(input.taskType === "implementation"
        ? { started_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", input.taskId);
  if (error) throw error;
}

export async function recordImplementationPr(input: {
  implementationId: string;
  prUrl: string;
  branchName: string;
  resultSummary?: string;
}) {
  const parsed = new URL(input.prUrl);
  if (
    parsed.origin !== "https://github.com" ||
    !parsed.pathname.startsWith("/walkermoz/premium-remodel-app/pull/")
  )
    throw new Error("Codex returned a pull request outside the configured repository.");
  const prNumber = Number(parsed.pathname.split("/").filter(Boolean).at(-1));
  if (!Number.isInteger(prNumber) || prNumber < 1)
    throw new Error("Codex returned an invalid pull request URL.");
  const { error } = await supabaseAdmin()
    .from("servicebuddy_product_implementations")
    .update({
      status: "pr_open",
      pr_url: input.prUrl,
      pr_number: prNumber,
      branch_name: input.branchName,
      pr_opened_at: new Date().toISOString(),
      failure_message: input.resultSummary?.slice(0, 2000) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.implementationId)
    .eq("status", "running");
  if (error) throw error;
}

export async function failProductCouncilTask(input: {
  taskType: "implementation" | "recommendations" | "merge";
  taskId: string;
  status: "failed" | "blocked";
  message: string;
}) {
  const table =
    input.taskType === "recommendations"
      ? "servicebuddy_product_generation_runs"
      : "servicebuddy_product_implementations";
  const { error } = await supabaseAdmin()
    .from(table)
    .update({
      status: input.status,
      failure_message: input.message.slice(0, 2000),
      ...(input.taskType === "recommendations"
        ? { finished_at: new Date().toISOString() }
        : { updated_at: new Date().toISOString() }),
    })
    .eq("id", input.taskId);
  if (error) throw error;
}

export async function recordImplementationEvidence(input: {
  prUrl: string;
  headSha: string;
  previewUrl: string;
  branchName: string;
  checks: Record<string, unknown>;
}) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("servicebuddy_product_implementations")
    .update({
      status: "awaiting_approval",
      head_sha: input.headSha,
      preview_url: input.previewUrl,
      branch_name: input.branchName,
      checks: input.checks,
      approved_by_discord_user_id: null,
      approval_interaction_id: null,
      approved_at: null,
      evidence_posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("pr_url", input.prUrl)
    .in("status", ["pr_open", "awaiting_approval"])
    .select(implementationSelect)
    .maybeSingle();
  if (error) throw error;
  return data
    ? implementationEvidence(data as unknown as ImplementationRow)
    : null;
}

export function implementationEvidence(
  row: ImplementationRow,
): ProductImplementationEvidence {
  const details = recommendation(row);
  if (
    !row.pr_url ||
    !row.pr_number ||
    !row.branch_name ||
    !row.head_sha ||
    !row.preview_url
  )
    throw new Error("Implementation evidence is incomplete.");
  return {
    id: row.id,
    recommendationId: row.recommendation_id,
    title: details.title,
    status: row.status,
    prUrl: row.pr_url,
    prNumber: row.pr_number,
    branchName: row.branch_name,
    headSha: row.head_sha,
    previewUrl: row.preview_url,
    modelId: row.codex_model || "auto",
    checks: row.checks || {},
  };
}

export async function markImplementationEvidencePosted(input: {
  implementationId: string;
  channelId: string;
  messageId: string;
}) {
  const { error } = await supabaseAdmin()
    .from("servicebuddy_product_implementations")
    .update({
      approval_discord_channel_id: input.channelId,
      approval_discord_message_id: input.messageId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.implementationId);
  if (error) throw error;
}

export async function decideImplementation(input: {
  implementationId: string;
  interactionId: string;
  discordUserId: string;
  action: "approve" | "reject";
}) {
  const db = supabaseAdmin();
  const { data: existing, error: loadError } = await db
    .from("servicebuddy_product_implementations")
    .select("id,status,head_sha,checks,pr_url")
    .eq("id", input.implementationId)
    .single();
  if (loadError) throw loadError;
  if (existing.status !== "awaiting_approval") return { changed: false };
  if (
    input.action === "approve" &&
    (existing.checks as Record<string, unknown> | null)?.quality !== "success"
  )
    throw new Error("The exact reviewed commit does not have passing checks.");
  const { data, error } = await db
    .from("servicebuddy_product_implementations")
    .update({
      status: input.action === "approve" ? "merge_approved" : "rejected",
      approved_by_discord_user_id: input.discordUserId,
      approval_interaction_id: input.interactionId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.implementationId)
    .eq("status", "awaiting_approval")
    .select("id,status,pr_url,head_sha")
    .maybeSingle();
  if (error) throw error;
  return { changed: Boolean(data), implementation: data };
}

export async function recordMergeResult(input: {
  implementationId: string;
  mergeSha: string;
}) {
  const { error } = await supabaseAdmin()
    .from("servicebuddy_product_implementations")
    .update({
      merge_sha: input.mergeSha,
      merged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.implementationId)
    .eq("status", "merging");
  if (error) throw error;
}

export async function recordProductionDeployment(input: {
  mergeSha: string;
  success: boolean;
  productionUrl?: string;
  summary: string;
}) {
  const { data, error } = await supabaseAdmin()
    .from("servicebuddy_product_implementations")
    .update({
      status: input.success ? "deployed" : "failed",
      production_url: input.productionUrl || null,
      deployed_at: input.success ? new Date().toISOString() : null,
      failure_message: input.success ? null : input.summary.slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq("merge_sha", input.mergeSha)
    .eq("status", "merging")
    .select("id,pr_url")
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; pr_url: string } | null;
}

export async function generationSignalIds(generationId: string) {
  const { data, error } = await supabaseAdmin()
    .from("servicebuddy_product_generation_runs")
    .select("signal_ids")
    .eq("id", generationId)
    .eq("status", "running")
    .single();
  if (error) throw error;
  return (data.signal_ids || []) as string[];
}

export async function completeGenerationRun(input: {
  generationId: string;
  summary: string;
}) {
  const db = supabaseAdmin();
  const ids = await generationSignalIds(input.generationId);
  const { error: signalError } = await db
    .from("servicebuddy_product_signals")
    .update({ status: "considered" })
    .in("id", ids)
    .eq("status", "new");
  if (signalError) throw signalError;
  const { error } = await db
    .from("servicebuddy_product_generation_runs")
    .update({
      status: "completed",
      result_summary: input.summary.slice(0, 2000),
      finished_at: new Date().toISOString(),
    })
    .eq("id", input.generationId)
    .eq("status", "running");
  if (error) throw error;
}
