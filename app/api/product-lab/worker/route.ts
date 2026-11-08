import { timingSafeEqual } from "node:crypto";
import {
  ensureApprovalChannelReady,
  postRecommendationBatch,
  productDiscordConfig,
  productDiscordEnvironmentStatus,
  verifyProductDiscordInstallation,
} from "@/lib/product-lab/discord";
import { initialProductRecommendations } from "@/lib/product-lab/recommendations";
import {
  createRecommendationBatch,
  getLatestRecommendationBatch,
  markRecommendationBatchFailed,
  markRecommendationBatchPosted,
} from "@/lib/product-lab/store";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

async function runWorker(request: Request) {
  if (!authorized(request))
    return Response.json({ error: "Unauthorized." }, { status: 401 });

  const environment = productDiscordEnvironmentStatus();
  if (!Object.values(environment).every(Boolean))
    return Response.json(
      { error: "Discord product integration is incomplete.", environment },
      { status: 503 },
    );

  await ensureApprovalChannelReady();

  let batch = await getLatestRecommendationBatch();
  if (batch?.status === "posted") {
    const health = await verifyProductDiscordInstallation(batch);
    return Response.json({
      ok: true,
      action: "health_checked",
      batchId: batch.id,
      health,
    });
  }
  if (batch?.status === "resolved") {
    const health = await verifyProductDiscordInstallation(batch);
    return Response.json({
      ok: true,
      action: "awaiting_new_evidence",
      batchId: batch.id,
      health,
    });
  }
  if (!batch)
    batch = await createRecommendationBatch(
      "product-council-initial-v1",
      initialProductRecommendations(),
    );

  try {
    const posted = await postRecommendationBatch(batch);
    const { ideasChannelId } = productDiscordConfig();
    await markRecommendationBatchPosted({
      batchId: batch.id,
      channelId: ideasChannelId,
      messageId: posted.id,
    });
    const postedBatch = await getLatestRecommendationBatch();
    const health = await verifyProductDiscordInstallation(postedBatch);
    return Response.json({
      ok: true,
      action: "posted",
      batchId: batch.id,
      health,
    });
  } catch (error) {
    await markRecommendationBatchFailed(batch.id, error);
    throw error;
  }
}

export async function GET(request: Request) {
  return runWorker(request);
}

export async function POST(request: Request) {
  return runWorker(request);
}
