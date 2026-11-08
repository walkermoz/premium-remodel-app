import { generateKeyPairSync, sign } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  isDiscordOperatorCommand,
  isProductReviewer,
  parseQuestionModalCustomId,
  parseRecommendationCustomId,
  recommendationBatchMessage,
  recommendationCustomId,
  validateProductDiscordInstallation,
  verifyDiscordRequest,
} from "../lib/product-lab/discord";

test("only the configured operator can create chat commands after activation", () => {
  const base = {
    id: "message-1",
    channel_id: "ideas",
    content: "Please fix the quote flow",
    timestamp: "2026-11-08T02:00:00.000Z",
    author: { id: "walker", bot: false },
  };
  const expected = {
    channelId: "ideas",
    operatorUserId: "walker",
    enabledAt: "2026-11-08T01:59:00.000Z",
  };
  expect(isDiscordOperatorCommand(base, expected)).toBe(true);
  expect(
    isDiscordOperatorCommand(
      { ...base, author: { id: "someone-else", bot: false } },
      expected,
    ),
  ).toBe(false);
  expect(
    isDiscordOperatorCommand(
      { ...base, timestamp: "2026-11-08T01:58:00.000Z" },
      expected,
    ),
  ).toBe(false);
  expect(
    isDiscordOperatorCommand(
      { ...base, author: { id: "walker", bot: true } },
      expected,
    ),
  ).toBe(false);
});
import { initialProductRecommendations } from "../lib/product-lab/recommendations";
import type { StoredRecommendationBatch } from "../lib/product-lab/types";

test("Discord interaction verification accepts a current valid Ed25519 signature", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const now = 1_794_073_600;
  const timestamp = String(now);
  const body = JSON.stringify({ type: 1 });
  const signature = sign(
    null,
    Buffer.from(`${timestamp}${body}`),
    privateKey,
  ).toString("hex");
  const publicKeyHex = (
    publicKey.export({ format: "der", type: "spki" }) as Buffer
  )
    .subarray(-32)
    .toString("hex");

  expect(
    verifyDiscordRequest({
      body,
      signature,
      timestamp,
      publicKey: publicKeyHex,
      nowSeconds: now,
    }),
  ).toBe(true);
  expect(
    verifyDiscordRequest({
      body: `${body} `,
      signature,
      timestamp,
      publicKey: publicKeyHex,
      nowSeconds: now,
    }),
  ).toBe(false);
  expect(
    verifyDiscordRequest({
      body,
      signature,
      timestamp,
      publicKey: publicKeyHex,
      nowSeconds: now + 301,
    }),
  ).toBe(false);
});

test("product component identifiers round-trip without ambiguous actions", () => {
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  expect(
    parseRecommendationCustomId(recommendationCustomId(id, "approve")),
  ).toEqual({
    recommendationId: id,
    action: "approve",
  });
  expect(
    parseRecommendationCustomId(`product:recommendation:${id}:merge`),
  ).toBeNull();
  expect(parseQuestionModalCustomId(`product:question:${id}`)).toBe(id);
});

test("only configured reviewers or Discord server managers can decide recommendations", () => {
  expect(isProductReviewer({ userId: "ordinary", permissions: "0" })).toBe(
    false,
  );
  expect(isProductReviewer({ userId: "manager", permissions: "32" })).toBe(
    true,
  );
  expect(isProductReviewer({ userId: "administrator", permissions: "8" })).toBe(
    true,
  );
});

test("the Ideas packet always renders exactly four recommendations and four action rows", () => {
  const recommendations = initialProductRecommendations().map(
    (draft, index) => ({
      ...draft,
      id: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
      batchId: "aaaaaaaa-1111-4111-8111-111111111111",
      specVersionId: `${String(index + 1).padStart(8, "0")}-2222-4222-8222-222222222222`,
      rank: index + 1,
      status: "pending" as const,
    }),
  );
  const batch: StoredRecommendationBatch = {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    status: "draft",
    discordChannelId: null,
    discordMessageId: null,
    recommendations,
  };
  const payload = recommendationBatchMessage(batch);
  expect(payload.embeds).toHaveLength(4);
  expect(payload.components).toHaveLength(4);
  expect(payload.components.every((row) => row.components.length === 4)).toBe(
    true,
  );
  expect(() =>
    recommendationBatchMessage({
      ...batch,
      recommendations: recommendations.slice(0, 3),
    }),
  ).toThrow(/exactly four/i);
});

test("the five-minute health check covers endpoint, command, channels, and the active packet", () => {
  const applicationId = "1551985992276250816";
  const endpointUrl = "https://servicebuddy-ui.vercel.app/api/discord/product";
  const channelIds = ["ideas", "approval", "cicd"];
  const recommendationMessageId = "packet";
  const healthy = {
    bot: { id: applicationId },
    application: { id: applicationId, interactions_endpoint_url: endpointUrl },
    commands: [{ name: "idea" }, { name: "Create opportunity" }],
    channels: channelIds.map((id) => ({ id })),
    approvalMessages: [{ content: "ServiceBuddy approval gate is online" }],
    recommendationMessage: {
      id: recommendationMessageId,
      embeds: [{}, {}, {}, {}],
      components: Array.from({ length: 4 }, () => ({
        components: [{}, {}, {}, {}],
      })),
    },
  };
  const expected = {
    applicationId,
    endpointUrl,
    channelIds,
    recommendationMessageId,
  };
  expect(validateProductDiscordInstallation(healthy, expected)).toEqual([]);
  expect(
    validateProductDiscordInstallation(
      {
        ...healthy,
        commands: [],
        channels: healthy.channels.slice(0, 2),
        recommendationMessage: {
          ...healthy.recommendationMessage,
          components: healthy.recommendationMessage.components.slice(0, 3),
        },
      },
      expected,
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/idea/),
      expect.stringMatching(/not accessible/),
      expect.stringMatching(/action rows/),
    ]),
  );
});
