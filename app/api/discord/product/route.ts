import {
  getRecommendationBatch,
  decideRecommendation,
  recordProductQuestion,
  recordProductSignal,
} from "@/lib/product-lab/store";
import {
  isProductReviewer,
  parseQuestionModalCustomId,
  parseRecommendationCustomId,
  productDiscordEnvironmentStatus,
  updateRecommendationBatch,
  verifyDiscordRequest,
} from "@/lib/product-lab/discord";

export const runtime = "nodejs";
export const maxDuration = 15;

type DiscordInteraction = {
  id: string;
  type: number;
  channel_id?: string;
  member?: { permissions?: string; user?: { id: string } };
  user?: { id: string };
  data?: {
    name?: string;
    custom_id?: string;
    options?: { name: string; value: unknown }[];
    components?: { components?: { custom_id?: string; value?: string }[] }[];
  };
};

const ephemeral = 1 << 6;

function message(content: string, status = 200) {
  return Response.json(
    {
      type: 4,
      data: { content, flags: ephemeral, allowed_mentions: { parse: [] } },
    },
    { status },
  );
}

function discordUserId(interaction: DiscordInteraction) {
  return interaction.member?.user?.id || interaction.user?.id || "";
}

async function handleCommand(interaction: DiscordInteraction) {
  if (interaction.data?.name !== "idea")
    return message("That product command is not registered here.");
  const body = interaction.data.options?.find(
    (option) => option.name === "description",
  )?.value;
  if (typeof body !== "string" || !body.trim())
    return message("Describe the product idea before submitting it.");
  await recordProductSignal({
    body,
    discordUserId: discordUserId(interaction),
    sourceReference: interaction.channel_id
      ? `discord-channel:${interaction.channel_id}`
      : undefined,
  });
  return message(
    "Idea saved as product evidence. It will be deduplicated and considered for a future four-recommendation batch; it does not bypass review.",
  );
}

function questionModal(recommendationId: string) {
  return Response.json({
    type: 9,
    data: {
      custom_id: `product:question:${recommendationId}`,
      title: "Ask about this recommendation",
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "question",
              label: "What should the specification clarify?",
              style: 2,
              min_length: 1,
              max_length: 1000,
              required: true,
            },
          ],
        },
      ],
    },
  });
}

async function handleComponent(interaction: DiscordInteraction) {
  const parsed = parseRecommendationCustomId(interaction.data?.custom_id || "");
  if (!parsed) return message("This product action is no longer recognized.");
  if (parsed.action === "ask") return questionModal(parsed.recommendationId);

  const userId = discordUserId(interaction);
  if (
    !isProductReviewer({
      userId,
      permissions: interaction.member?.permissions,
    })
  )
    return message(
      "A configured product reviewer or Discord server manager must make this decision.",
    );

  const decision = await decideRecommendation({
    recommendationId: parsed.recommendationId,
    interactionId: interaction.id,
    discordUserId: userId,
    action: parsed.action,
  });
  const batch = await getRecommendationBatch(decision.batchId);
  if (batch) await updateRecommendationBatch(batch);
  if (!decision.changed)
    return message("This recommendation already has a recorded decision.");
  return message(
    parsed.action === "approve"
      ? "Specification locked and approved to build. This authorizes a branch and pull request, not merge or production deployment."
      : `Recommendation ${parsed.action === "park" ? "parked" : "rejected"}. The audited decision has been recorded.`,
  );
}

async function handleModal(interaction: DiscordInteraction) {
  const recommendationId = parseQuestionModalCustomId(
    interaction.data?.custom_id || "",
  );
  const body = interaction.data?.components
    ?.flatMap((row) => row.components || [])
    .find((field) => field.custom_id === "question")?.value;
  if (!recommendationId || !body?.trim())
    return message(
      "The question was empty or no longer matches a recommendation.",
    );
  await recordProductQuestion({
    recommendationId,
    interactionId: interaction.id,
    discordUserId: discordUserId(interaction),
    body,
  });
  return message(
    "Question saved with this recommendation. It remains visible in the product record until answered or closed.",
  );
}

export async function GET() {
  const configured = productDiscordEnvironmentStatus();
  return Response.json(
    {
      service: "servicebuddy-product-council",
      configured: Object.values(configured).every(Boolean),
      environment: configured,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const publicKey = process.env.DISCORD_PRODUCT_PUBLIC_KEY?.trim();
  if (!publicKey)
    return Response.json(
      { error: "Discord product integration is not configured." },
      { status: 503 },
    );
  const body = await request.text();
  const verified = verifyDiscordRequest({
    body,
    signature: request.headers.get("x-signature-ed25519"),
    timestamp: request.headers.get("x-signature-timestamp"),
    publicKey,
  });
  if (!verified)
    return Response.json(
      { error: "Invalid Discord signature." },
      { status: 401 },
    );

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(body) as DiscordInteraction;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  try {
    if (interaction.type === 1) return Response.json({ type: 1 });
    if (interaction.type === 2) return handleCommand(interaction);
    if (interaction.type === 3) return handleComponent(interaction);
    if (interaction.type === 5) return handleModal(interaction);
    return message("This Discord interaction type is not supported.");
  } catch (error) {
    console.error("Discord product interaction failed", {
      interactionId: interaction.id,
      type: interaction.type,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return message(
      "The product action could not be completed. Nothing was approved or changed.",
    );
  }
}
