import { generateKeyPairSync, sign } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  parseQuestionModalCustomId,
  parseRecommendationCustomId,
  recommendationBatchMessage,
  recommendationCustomId,
  verifyDiscordRequest,
} from "../lib/product-lab/discord";
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
