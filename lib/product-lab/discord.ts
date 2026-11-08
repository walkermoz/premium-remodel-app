import { createPublicKey, timingSafeEqual, verify } from "node:crypto";
import type { RecommendationAction, StoredRecommendationBatch } from "./types";

const discordApi = "https://discord.com/api/v10";
const ed25519SpkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
const maxSignatureAgeSeconds = 300;
const approvalReadinessMarker = "ServiceBuddy approval gate is online";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function productDiscordConfig() {
  return {
    applicationId: required("DISCORD_PRODUCT_APPLICATION_ID"),
    botToken: required("DISCORD_PRODUCT_BOT_TOKEN"),
    publicKey: required("DISCORD_PRODUCT_PUBLIC_KEY"),
    guildId: required("DISCORD_PRODUCT_GUILD_ID"),
    ideasChannelId: required("DISCORD_PRODUCT_IDEAS_CHANNEL_ID"),
    approvalChannelId: required("DISCORD_PRODUCT_APPROVAL_CHANNEL_ID"),
    cicdChannelId: required("DISCORD_PRODUCT_CICD_CHANNEL_ID"),
    operatorUserId: required("DISCORD_PRODUCT_OPERATOR_USER_ID"),
  };
}

export type DiscordOperatorMessage = {
  id: string;
  channel_id: string;
  content?: string;
  timestamp?: string;
  author?: { id?: string; bot?: boolean };
};

export function isDiscordOperatorCommand(
  message: DiscordOperatorMessage,
  input: {
    channelId: string;
    operatorUserId: string;
    enabledAt: string;
  },
) {
  const content = message.content?.trim();
  const timestamp = Date.parse(message.timestamp || "");
  return Boolean(
    message.id &&
    message.channel_id === input.channelId &&
    message.author?.id === input.operatorUserId &&
    !message.author.bot &&
    content &&
    Number.isFinite(timestamp) &&
    timestamp >= Date.parse(input.enabledAt),
  );
}

export function verifyDiscordRequest(input: {
  body: string;
  signature: string | null;
  timestamp: string | null;
  publicKey: string;
  nowSeconds?: number;
}) {
  const { body, signature, timestamp, publicKey } = input;
  if (
    !signature ||
    !timestamp ||
    !/^[a-f\d]{128}$/i.test(signature) ||
    !/^[a-f\d]{64}$/i.test(publicKey) ||
    !/^\d+$/.test(timestamp)
  )
    return false;

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > maxSignatureAgeSeconds)
    return false;

  try {
    const key = createPublicKey({
      key: Buffer.concat([ed25519SpkiPrefix, Buffer.from(publicKey, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.from(`${timestamp}${body}`),
      key,
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

export function recommendationCustomId(
  recommendationId: string,
  action: RecommendationAction,
) {
  return `product:recommendation:${recommendationId}:${action}`;
}

export function parseRecommendationCustomId(value: string) {
  const match = value.match(
    /^product:recommendation:([0-9a-f-]{36}):(approve|ask|park|reject)$/i,
  );
  if (!match) return null;
  return {
    recommendationId: match[1].toLowerCase(),
    action: match[2].toLowerCase() as RecommendationAction,
  };
}

export function questionModalCustomId(recommendationId: string) {
  return `product:question:${recommendationId}`;
}

export function parseQuestionModalCustomId(value: string) {
  return (
    value.match(/^product:question:([0-9a-f-]{36})$/i)?.[1].toLowerCase() ??
    null
  );
}

function truncate(value: string, length: number) {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

function statusLabel(status: string) {
  if (status === "approved") return "Approved to build";
  if (status === "parked") return "Parked";
  if (status === "rejected") return "Rejected";
  return "Awaiting decision";
}

export function recommendationBatchMessage(batch: StoredRecommendationBatch) {
  if (batch.recommendations.length !== 4)
    throw new Error(
      "A Discord recommendation batch must contain exactly four recommendations.",
    );
  const recommendations = [...batch.recommendations].sort(
    (left, right) => left.rank - right.rank,
  );
  return {
    content:
      "**ServiceBuddy product council · 4 recommendations**\nApprove a specification here to authorize an implementation branch and pull request. Merge requires a separate approval in **#approval**.",
    embeds: recommendations.map((item) => ({
      title: `${item.rank}. ${truncate(item.title, 240)}`,
      description: truncate(item.problem, 1000),
      color:
        item.status === "approved"
          ? 0x57f287
          : item.status === "rejected"
            ? 0xed4245
            : item.status === "parked"
              ? 0xfee75c
              : 0x8ab4f8,
      fields: [
        { name: "Outcome", value: truncate(item.outcome, 700) },
        { name: "Evidence", value: truncate(item.evidence, 700) },
        { name: "Competitive gap", value: truncate(item.competitorGap, 500) },
        { name: "Integration", value: truncate(item.integration, 700) },
        {
          name: "Assessment",
          value: `Value **${item.value}** · Effort **${item.effort}** · Risk **${item.risk}** · Confidence **${item.confidence}**`,
        },
        { name: "Status", value: `**${statusLabel(item.status)}**` },
      ],
      footer: { text: `Recommendation ${item.id}` },
    })),
    components: recommendations.map((item) => ({
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: item.status === "approved" ? "Approved" : "Approve to build",
          custom_id: recommendationCustomId(item.id, "approve"),
          disabled: item.status !== "pending",
        },
        {
          type: 2,
          style: 1,
          label: "Ask a question",
          custom_id: recommendationCustomId(item.id, "ask"),
        },
        {
          type: 2,
          style: 2,
          label: item.status === "parked" ? "Parked" : "Park",
          custom_id: recommendationCustomId(item.id, "park"),
          disabled: item.status !== "pending",
        },
        {
          type: 2,
          style: 4,
          label: item.status === "rejected" ? "Rejected" : "Reject",
          custom_id: recommendationCustomId(item.id, "reject"),
          disabled: item.status !== "pending",
        },
      ],
    })),
    allowed_mentions: { parse: [] as string[] },
  };
}

async function discordRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${discordApi}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${productDiscordConfig().botToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = truncate(await response.text(), 500);
    throw new Error(`Discord API ${response.status}: ${detail}`);
  }
  return response.status === 204 ? null : response.json();
}

export async function fetchDiscordOperatorCommands(enabledAt: string) {
  const config = productDiscordConfig();
  const messages = (await discordRequest(
    `/channels/${config.ideasChannelId}/messages?limit=100`,
  )) as DiscordOperatorMessage[];
  return messages
    .filter((message) =>
      isDiscordOperatorCommand(message, {
        channelId: config.ideasChannelId,
        operatorUserId: config.operatorUserId,
        enabledAt,
      }),
    )
    .map((message) => ({
      discordMessageId: message.id,
      discordChannelId: message.channel_id,
      discordUserId: message.author!.id!,
      body: message.content!.trim(),
      discordCreatedAt: message.timestamp!,
    }))
    .sort((left, right) =>
      left.discordCreatedAt.localeCompare(right.discordCreatedAt),
    );
}

export async function acknowledgeDiscordOperatorCommand(input: {
  channelId: string;
  messageId: string;
}) {
  await discordRequest(
    `/channels/${input.channelId}/messages/${input.messageId}/reactions/%F0%9F%91%80/@me`,
    { method: "PUT" },
  );
}

export async function postDiscordOperatorCommandResult(input: {
  channelId: string;
  messageId: string;
  status: "completed" | "failed" | "blocked";
  summary: string;
}) {
  const label =
    input.status === "completed"
      ? "Completed"
      : input.status === "blocked"
        ? "Needs input in Codex"
        : "Could not complete";
  const result = (await discordRequest(
    `/channels/${input.channelId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        content: `**${label}**\n${truncate(input.summary.trim(), 1700)}`,
        message_reference: {
          message_id: input.messageId,
          channel_id: input.channelId,
          fail_if_not_exists: false,
        },
        allowed_mentions: { parse: [] },
      }),
    },
  )) as { id: string };
  return result.id;
}

type DiscordInstallationSnapshot = {
  bot: { id: string };
  application: { id: string; interactions_endpoint_url?: string | null };
  commands: { name: string }[];
  channels: { id: string }[];
  approvalMessages?: { content?: string }[];
  recommendationMessage?: {
    id: string;
    embeds?: unknown[];
    components?: { components?: unknown[] }[];
  };
};

export function validateProductDiscordInstallation(
  snapshot: DiscordInstallationSnapshot,
  expected: {
    applicationId: string;
    endpointUrl: string;
    channelIds: string[];
    recommendationMessageId?: string;
  },
) {
  const failures: string[] = [];
  if (
    snapshot.bot.id !== expected.applicationId ||
    snapshot.application.id !== expected.applicationId
  )
    failures.push("Bot and application identities do not match configuration.");
  if (snapshot.application.interactions_endpoint_url !== expected.endpointUrl)
    failures.push(
      "Discord's signed interaction endpoint is not configured correctly.",
    );
  const commandNames = new Set(
    snapshot.commands.map((command) => command.name),
  );
  if (!commandNames.has("idea"))
    failures.push("The /idea guild command is missing.");
  if (!commandNames.has("Create opportunity"))
    failures.push("The Create opportunity message action is missing.");
  const accessibleChannels = new Set(
    snapshot.channels.map((channel) => channel.id),
  );
  for (const channelId of expected.channelIds)
    if (!accessibleChannels.has(channelId))
      failures.push(
        `Discord channel ${channelId} is not accessible to the bot.`,
      );
  if (
    !snapshot.approvalMessages?.some((item) =>
      item.content?.includes(approvalReadinessMarker),
    )
  )
    failures.push("The Approval channel readiness marker is missing.");

  if (expected.recommendationMessageId) {
    const packet = snapshot.recommendationMessage;
    if (!packet || packet.id !== expected.recommendationMessageId)
      failures.push("The active Ideas recommendation packet is missing.");
    else {
      if (packet.embeds?.length !== 4)
        failures.push(
          "The active Ideas packet does not contain four recommendations.",
        );
      if (
        packet.components?.length !== 4 ||
        packet.components.some((row) => row.components?.length !== 4)
      )
        failures.push(
          "The active Ideas packet does not contain four complete action rows.",
        );
    }
  }
  return failures;
}

export async function verifyProductDiscordInstallation(
  batch?: StoredRecommendationBatch | null,
) {
  const config = productDiscordConfig();
  const endpointUrl = `${(process.env.APP_URL || "https://servicebuddy-ui.vercel.app").replace(/\/$/, "")}/api/discord/product`;
  const messagePromise =
    batch?.discordChannelId && batch.discordMessageId
      ? discordRequest(
          `/channels/${batch.discordChannelId}/messages/${batch.discordMessageId}`,
        )
      : Promise.resolve(undefined);
  const [
    bot,
    application,
    commands,
    ideas,
    approval,
    cicd,
    approvalMessages,
    recommendationMessage,
  ] = await Promise.all([
    discordRequest("/users/@me"),
    discordRequest("/oauth2/applications/@me"),
    discordRequest(
      `/applications/${config.applicationId}/guilds/${config.guildId}/commands`,
    ),
    discordRequest(`/channels/${config.ideasChannelId}`),
    discordRequest(`/channels/${config.approvalChannelId}`),
    discordRequest(`/channels/${config.cicdChannelId}`),
    discordRequest(`/channels/${config.approvalChannelId}/messages?limit=20`),
    messagePromise,
  ]);
  const snapshot = {
    bot,
    application,
    commands,
    channels: [ideas, approval, cicd],
    approvalMessages,
    recommendationMessage,
  } as DiscordInstallationSnapshot;
  const failures = validateProductDiscordInstallation(snapshot, {
    applicationId: config.applicationId,
    endpointUrl,
    channelIds: [
      config.ideasChannelId,
      config.approvalChannelId,
      config.cicdChannelId,
    ],
    recommendationMessageId: batch?.discordMessageId || undefined,
  });
  if (failures.length) throw new Error(failures.join(" "));
  return {
    botId: snapshot.bot.id,
    endpointUrl,
    command: "/idea",
    channels: snapshot.channels.map((channel) => channel.id),
    activePacket: batch?.discordMessageId || null,
  };
}

export async function ensureApprovalChannelReady() {
  const config = productDiscordConfig();
  const messages = (await discordRequest(
    `/channels/${config.approvalChannelId}/messages?limit=20`,
  )) as { id: string; content?: string }[];
  const existing = messages.find((item) =>
    item.content?.includes(approvalReadinessMarker),
  );
  if (existing) return existing.id;
  const created = (await discordRequest(
    `/channels/${config.approvalChannelId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        content:
          `**${approvalReadinessMarker}**\n` +
          "Tested pull-request packets will appear here after an Ideas approval creates an implementation. Merge approval is bound to the exact reviewed commit and is invalidated by later changes.",
        allowed_mentions: { parse: [] },
      }),
    },
  )) as { id: string };
  return created.id;
}

export async function postRecommendationBatch(
  batch: StoredRecommendationBatch,
) {
  const { ideasChannelId } = productDiscordConfig();
  return discordRequest(`/channels/${ideasChannelId}/messages`, {
    method: "POST",
    body: JSON.stringify(recommendationBatchMessage(batch)),
  }) as Promise<{ id: string }>;
}

export async function updateRecommendationBatch(
  batch: StoredRecommendationBatch,
) {
  if (!batch.discordChannelId || !batch.discordMessageId) return;
  await discordRequest(
    `/channels/${batch.discordChannelId}/messages/${batch.discordMessageId}`,
    {
      method: "PATCH",
      body: JSON.stringify(recommendationBatchMessage(batch)),
    },
  );
}

export async function verifyDiscordBotConnection() {
  const user = (await discordRequest("/users/@me")) as { id: string };
  const expected = productDiscordConfig().applicationId;
  const actualBuffer = Buffer.from(user.id);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  )
    throw new Error(
      "The Discord bot token belongs to a different application.",
    );
  return user.id;
}

export function isProductReviewer(input: {
  userId: string;
  permissions?: string;
}) {
  const configured = (process.env.DISCORD_PRODUCT_REVIEWER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.includes(input.userId)) return true;
  try {
    const permissions = BigInt(input.permissions || "0");
    return (permissions & 0x8n) === 0x8n || (permissions & 0x20n) === 0x20n;
  } catch {
    return false;
  }
}

export function productDiscordEnvironmentStatus() {
  const names = [
    "DISCORD_PRODUCT_APPLICATION_ID",
    "DISCORD_PRODUCT_BOT_TOKEN",
    "DISCORD_PRODUCT_PUBLIC_KEY",
    "DISCORD_PRODUCT_GUILD_ID",
    "DISCORD_PRODUCT_IDEAS_CHANNEL_ID",
    "DISCORD_PRODUCT_APPROVAL_CHANNEL_ID",
    "DISCORD_PRODUCT_CICD_CHANNEL_ID",
    "DISCORD_PRODUCT_OPERATOR_USER_ID",
  ];
  return Object.fromEntries(
    names.map((name) => [name, Boolean(process.env[name]?.trim())]),
  );
}
