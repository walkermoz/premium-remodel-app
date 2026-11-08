import { createHash } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { parseRecommendationDrafts } from "./discord-recommendation-inbox-core.mjs";

config({ path: process.env.DOTENV_CONFIG_PATH || ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase admin environment is unavailable.");

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const action = process.argv[2];

async function claim() {
  const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: stale, error: staleError } = await db
    .from("servicebuddy_product_generation_runs")
    .update({
      status: "failed",
      failure_message: "The Codex chat claim expired before completion.",
      finished_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .lt("created_at", staleBefore)
    .select("id");
  if (staleError) throw staleError;

  const { data: active, error: activeError } = await db
    .from("servicebuddy_product_generation_runs")
    .select("id")
    .eq("status", "running")
    .limit(1)
    .maybeSingle();
  if (activeError) throw activeError;
  if (active) return { generation: null, active: true };

  const { data: signals, error: signalError } = await db
    .from("servicebuddy_product_signals")
    .select("id,body,source,created_at")
    .eq("status", "new")
    .order("created_at", { ascending: true })
    .limit(50);
  if (signalError) throw signalError;
  if (!signals?.length) return { generation: null };

  const { data: previous, error: previousError } = await db
    .from("servicebuddy_product_recommendations")
    .select("title")
    .order("created_at", { ascending: false })
    .limit(40);
  if (previousError) throw previousError;

  const { data: generation, error: generationError } = await db
    .from("servicebuddy_product_generation_runs")
    .insert({
      signal_ids: signals.map((signal) => signal.id),
      status: "running",
      codex_agent_id: "existing-codex-chat",
      codex_model: "Codex chat",
    })
    .select("id")
    .single();
  if (generationError) {
    if (generationError.code === "23505")
      return { generation: null, active: true };
    throw generationError;
  }
  return {
    generation: {
      id: generation.id,
      signals: signals.map(({ body, source, created_at: createdAt }) => ({
        body,
        source,
        createdAt,
      })),
      previousTitles: (previous || []).map((item) => item.title),
    },
    recovered: stale?.length || 0,
  };
}

async function retireActiveBatches() {
  const { data, error } = await db
    .from("servicebuddy_product_recommendation_batches")
    .select("id")
    .in("status", ["draft", "posted"]);
  if (error) throw error;
  const ids = (data || []).map((row) => row.id);
  if (!ids.length) return;
  const now = new Date().toISOString();
  const { error: recommendationError } = await db
    .from("servicebuddy_product_recommendations")
    .update({ status: "parked", decided_at: now })
    .in("batch_id", ids)
    .eq("status", "pending");
  if (recommendationError) throw recommendationError;
  const { error: batchError } = await db
    .from("servicebuddy_product_recommendation_batches")
    .update({ status: "resolved", resolved_at: now })
    .in("id", ids)
    .in("status", ["draft", "posted"]);
  if (batchError) throw batchError;
}

async function complete() {
  const generationId = process.argv[3];
  if (!generationId)
    throw new Error("Usage: completed <generation-id> with JSON on stdin.");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const drafts = parseRecommendationDrafts(input);
  await retireActiveBatches();

  const { data: batch, error: batchError } = await db
    .from("servicebuddy_product_recommendation_batches")
    .insert({ cadence_key: `product-council-${generationId}`, status: "draft" })
    .select("id")
    .single();
  if (batchError) throw batchError;

  for (const [index, draft] of drafts.entries()) {
    const checksum = createHash("sha256")
      .update(JSON.stringify(draft.spec))
      .digest("hex");
    const { data: spec, error: specError } = await db
      .from("servicebuddy_product_spec_versions")
      .insert({
        title: draft.title,
        version_number: 1,
        status: "draft",
        spec: { ...draft.spec, checksum },
      })
      .select("id")
      .single();
    if (specError) throw specError;
    const { title, spec: _spec, ...summary } = draft;
    void _spec;
    const { error: recommendationError } = await db
      .from("servicebuddy_product_recommendations")
      .insert({
        batch_id: batch.id,
        spec_version_id: spec.id,
        rank: index + 1,
        title,
        summary,
        status: "pending",
      });
    if (recommendationError) throw recommendationError;
  }

  const { data: generation, error: generationError } = await db
    .from("servicebuddy_product_generation_runs")
    .select("signal_ids")
    .eq("id", generationId)
    .eq("status", "running")
    .single();
  if (generationError) throw generationError;
  const { error: signalError } = await db
    .from("servicebuddy_product_signals")
    .update({ status: "considered" })
    .in("id", generation.signal_ids || [])
    .eq("status", "new");
  if (signalError) throw signalError;
  const { error: finishError } = await db
    .from("servicebuddy_product_generation_runs")
    .update({
      status: "completed",
      result_summary: `Generated recommendation batch ${batch.id} in the existing Codex chat.`,
      finished_at: new Date().toISOString(),
    })
    .eq("id", generationId)
    .eq("status", "running");
  if (finishError) throw finishError;
  return { generationId, batchId: batch.id, recommendations: drafts.length };
}

async function finish(status) {
  const id = process.argv[3];
  const summary = process.argv.slice(4).join(" ").trim();
  if (!id || !summary) throw new Error(`Usage: ${action} <id> <summary>`);
  const { data, error } = await db
    .from("servicebuddy_product_generation_runs")
    .update({
      status,
      failure_message: summary.slice(0, 2000),
      finished_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "running")
    .select("id,status")
    .single();
  if (error) throw error;
  return data;
}

let result;
if (action === "claim") result = await claim();
else if (action === "completed") result = await complete();
else if (["failed", "blocked"].includes(action)) result = await finish(action);
else
  throw new Error(
    "Use claim, completed <generation-id> with JSON on stdin, failed <id> <summary>, or blocked <id> <summary>.",
  );

process.stdout.write(`${JSON.stringify(result)}\n`);
