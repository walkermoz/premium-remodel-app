import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  ProductRecommendationDraft,
  StoredProductRecommendation,
  StoredRecommendationBatch,
} from "./types";

type BatchRow = {
  id: string;
  status: StoredRecommendationBatch["status"];
  discord_channel_id: string | null;
  discord_message_id: string | null;
  discord_message_ids: unknown;
  discord_layout_version: number;
};

type RecommendationRow = {
  id: string;
  batch_id: string;
  spec_version_id: string;
  rank: number;
  title: string;
  summary: Omit<ProductRecommendationDraft, "title" | "spec">;
  status: StoredProductRecommendation["status"];
  servicebuddy_product_spec_versions:
    | { spec: Record<string, unknown> }
    | { spec: Record<string, unknown> }[]
    | null;
};

function unwrapSpec(row: RecommendationRow) {
  const relation = row.servicebuddy_product_spec_versions;
  if (Array.isArray(relation)) return relation[0]?.spec ?? {};
  return relation?.spec ?? {};
}

function mapRecommendation(
  row: RecommendationRow,
): StoredProductRecommendation {
  return {
    id: row.id,
    batchId: row.batch_id,
    specVersionId: row.spec_version_id,
    rank: row.rank,
    title: row.title,
    status: row.status,
    ...row.summary,
    spec: unwrapSpec(row),
  };
}

async function batchWithRecommendations(row: BatchRow) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("servicebuddy_product_recommendations")
    .select(
      "id,batch_id,spec_version_id,rank,title,summary,status,servicebuddy_product_spec_versions(spec)",
    )
    .eq("batch_id", row.id)
    .order("rank");
  if (error) throw error;
  return {
    id: row.id,
    status: row.status,
    discordChannelId: row.discord_channel_id,
    discordMessageId: row.discord_message_id,
    discordMessageIds: Array.isArray(row.discord_message_ids)
      ? row.discord_message_ids.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    discordLayoutVersion: row.discord_layout_version || 1,
    recommendations: (data as unknown as RecommendationRow[]).map(
      mapRecommendation,
    ),
  } satisfies StoredRecommendationBatch;
}

export async function getLatestRecommendationBatch() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("servicebuddy_product_recommendation_batches")
    .select(
      "id,status,discord_channel_id,discord_message_id,discord_message_ids,discord_layout_version",
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? batchWithRecommendations(data as BatchRow) : null;
}

export async function getRecommendationBatch(batchId: string) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("servicebuddy_product_recommendation_batches")
    .select(
      "id,status,discord_channel_id,discord_message_id,discord_message_ids,discord_layout_version",
    )
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw error;
  return data ? batchWithRecommendations(data as BatchRow) : null;
}

export async function createRecommendationBatch(
  cadenceKey: string,
  drafts: ProductRecommendationDraft[],
) {
  if (drafts.length !== 4)
    throw new Error(
      "Product recommendation batches require exactly four drafts.",
    );
  const db = supabaseAdmin();
  const { data: batch, error: batchError } = await db
    .from("servicebuddy_product_recommendation_batches")
    .insert({ cadence_key: cadenceKey, status: "draft" })
    .select(
      "id,status,discord_channel_id,discord_message_id,discord_message_ids,discord_layout_version",
    )
    .single();
  if (batchError) throw batchError;

  try {
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
      const { title } = draft;
      const summary = {
        problem: draft.problem,
        outcome: draft.outcome,
        evidence: draft.evidence,
        competitorGap: draft.competitorGap,
        integration: draft.integration,
        value: draft.value,
        effort: draft.effort,
        risk: draft.risk,
        confidence: draft.confidence,
      };
      const { error: recommendationError } = await db
        .from("servicebuddy_product_recommendations")
        .insert({
          batch_id: batch.id,
          spec_version_id: spec.id,
          rank: index + 1,
          title,
          summary,
        });
      if (recommendationError) throw recommendationError;
    }
  } catch (error) {
    await db
      .from("servicebuddy_product_recommendation_batches")
      .update({
        status: "failed",
        failure_message: String(error).slice(0, 500),
      })
      .eq("id", batch.id);
    throw error;
  }
  const created = await getRecommendationBatch(batch.id);
  if (!created)
    throw new Error("The recommendation batch could not be loaded.");
  return created;
}

export async function markRecommendationBatchPosted(input: {
  batchId: string;
  channelId: string;
  messageId: string;
  messageIds: string[];
}) {
  const db = supabaseAdmin();
  const { error } = await db
    .from("servicebuddy_product_recommendation_batches")
    .update({
      status: "posted",
      discord_channel_id: input.channelId,
      discord_message_id: input.messageId,
      discord_message_ids: input.messageIds,
      discord_layout_version: 2,
      posted_at: new Date().toISOString(),
      failure_message: null,
    })
    .eq("id", input.batchId);
  if (error) throw error;
}

export async function markRecommendationBatchFailed(
  batchId: string,
  error: unknown,
) {
  const db = supabaseAdmin();
  await db
    .from("servicebuddy_product_recommendation_batches")
    .update({ status: "failed", failure_message: String(error).slice(0, 500) })
    .eq("id", batchId);
}

export async function retireActiveRecommendationBatches() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("servicebuddy_product_recommendation_batches")
    .select("id")
    .in("status", ["draft", "posted"]);
  if (error) throw error;
  const ids = (data || []).map((row) => row.id as string);
  if (!ids.length) return [];

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

  const retired = await Promise.all(ids.map(getRecommendationBatch));
  return retired.filter(
    (batch): batch is StoredRecommendationBatch => Boolean(batch),
  );
}

export async function recordProductSignal(input: {
  body: string;
  discordUserId: string;
  sourceReference?: string;
}) {
  const db = supabaseAdmin();
  const { error } = await db.from("servicebuddy_product_signals").insert({
    source: "discord",
    source_reference: input.sourceReference || null,
    submitted_by: input.discordUserId,
    body: input.body.trim(),
  });
  if (error && error.code !== "23505") throw error;
}

type DiscordOperatorCommandStatus =
  "new" | "claimed" | "completed" | "failed" | "blocked";

export async function getDiscordOperatorCommandEnabledAt() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("servicebuddy_discord_command_settings")
    .select("enabled_at")
    .eq("id", true)
    .single();
  if (error) throw error;
  return data.enabled_at as string;
}

export async function recordDiscordOperatorCommands(
  commands: {
    discordMessageId: string;
    discordChannelId: string;
    discordUserId: string;
    body: string;
    discordCreatedAt: string;
  }[],
) {
  if (!commands.length) return [];
  const db = supabaseAdmin();
  const ids = commands.map((command) => command.discordMessageId);
  const { data: existing, error: existingError } = await db
    .from("servicebuddy_discord_operator_commands")
    .select("discord_message_id")
    .in("discord_message_id", ids);
  if (existingError) throw existingError;
  const existingIds = new Set(
    (existing || []).map((row) => row.discord_message_id as string),
  );
  const fresh = commands.filter(
    (command) => !existingIds.has(command.discordMessageId),
  );
  if (!fresh.length) return [];
  const { error } = await db
    .from("servicebuddy_discord_operator_commands")
    .insert(
      fresh.map((command) => ({
        discord_message_id: command.discordMessageId,
        discord_channel_id: command.discordChannelId,
        discord_user_id: command.discordUserId,
        body: command.body,
        discord_created_at: command.discordCreatedAt,
      })),
    );
  if (error?.code === "23505") return [];
  if (error) throw error;
  return fresh;
}

export async function listDiscordOperatorCommandResultsToNotify() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("servicebuddy_discord_operator_commands")
    .select("id,discord_message_id,discord_channel_id,status,result_summary")
    .in("status", ["completed", "failed", "blocked"])
    .is("notified_at", null)
    .order("finished_at", { ascending: true })
    .limit(20);
  if (error) throw error;
  return (data || []) as {
    id: string;
    discord_message_id: string;
    discord_channel_id: string;
    status: Extract<
      DiscordOperatorCommandStatus,
      "completed" | "failed" | "blocked"
    >;
    result_summary: string;
  }[];
}

export async function markDiscordOperatorCommandNotified(
  id: string,
  responseMessageId: string,
) {
  const db = supabaseAdmin();
  const { error } = await db
    .from("servicebuddy_discord_operator_commands")
    .update({
      notified_at: new Date().toISOString(),
      discord_response_message_id: responseMessageId,
    })
    .eq("id", id)
    .is("notified_at", null);
  if (error) throw error;
}

export async function recordProductQuestion(input: {
  recommendationId: string;
  interactionId: string;
  discordUserId: string;
  body: string;
}) {
  const db = supabaseAdmin();
  const { error } = await db.from("servicebuddy_product_questions").insert({
    recommendation_id: input.recommendationId,
    discord_interaction_id: input.interactionId,
    discord_user_id: input.discordUserId,
    body: input.body.trim(),
  });
  if (error && error.code !== "23505") throw error;
}

export async function decideRecommendation(input: {
  recommendationId: string;
  interactionId: string;
  discordUserId: string;
  action: "approve" | "park" | "reject";
}) {
  const db = supabaseAdmin();
  const { data: recommendation, error: loadError } = await db
    .from("servicebuddy_product_recommendations")
    .select("id,batch_id,spec_version_id,status")
    .eq("id", input.recommendationId)
    .single();
  if (loadError) throw loadError;
  if (recommendation.status !== "pending")
    return { changed: false, batchId: recommendation.batch_id };

  const { error: decisionError } = await db
    .from("servicebuddy_product_decisions")
    .insert({
      recommendation_id: input.recommendationId,
      discord_interaction_id: input.interactionId,
      discord_user_id: input.discordUserId,
      action: input.action,
    });
  if (decisionError?.code === "23505")
    return { changed: false, batchId: recommendation.batch_id };
  if (decisionError) throw decisionError;

  const status =
    input.action === "approve"
      ? "approved"
      : input.action === "park"
        ? "parked"
        : "rejected";
  const now = new Date().toISOString();
  const { error: updateError } = await db
    .from("servicebuddy_product_recommendations")
    .update({
      status,
      decided_by_discord_user_id: input.discordUserId,
      decided_at: now,
    })
    .eq("id", input.recommendationId)
    .eq("status", "pending");
  if (updateError) throw updateError;

  if (input.action === "approve") {
    const { error: lockError } = await db
      .from("servicebuddy_product_spec_versions")
      .update({ status: "locked", locked_at: now })
      .eq("id", recommendation.spec_version_id)
      .eq("status", "draft");
    if (lockError) throw lockError;

    const { error: implementationError } = await db
      .from("servicebuddy_product_implementations")
      .insert({
        recommendation_id: recommendation.id,
        spec_version_id: recommendation.spec_version_id,
        status: "queued",
      });
    if (implementationError && implementationError.code !== "23505")
      throw implementationError;
  }

  const { count, error: pendingError } = await db
    .from("servicebuddy_product_recommendations")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", recommendation.batch_id)
    .eq("status", "pending");
  if (pendingError) throw pendingError;
  if ((count ?? 0) === 0) {
    const { error: resolveError } = await db
      .from("servicebuddy_product_recommendation_batches")
      .update({ status: "resolved", resolved_at: now })
      .eq("id", recommendation.batch_id);
    if (resolveError) throw resolveError;

    const { error: refreshError } = await db
      .from("servicebuddy_product_signals")
      .insert({
        source: "system",
        source_reference: `recommendation-refresh:${recommendation.batch_id}`,
        submitted_by: input.discordUserId,
        body:
          "The current four recommendations have all been decided. Analyze the repository and the recorded decisions, avoid repeating prior recommendations, and prepare the next four concrete feature build-outs for Discord review.",
      });
    if (refreshError && refreshError.code !== "23505") throw refreshError;
  }
  return { changed: true, batchId: recommendation.batch_id };
}
