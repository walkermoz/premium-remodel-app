import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPublicWorkflowWebhookUrl } from "./webhook-safety";

export async function assertPublicWorkflowWebhookUrl(value: string) {
  if (!isPublicWorkflowWebhookUrl(value))
    throw new Error(
      "Webhook destinations must be public HTTPS URLs without embedded credentials.",
    );
  const url = new URL(value);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length)
    throw new Error("Webhook destination did not resolve.");
  for (const address of addresses) {
    const check = `https://${address.family === 6 ? `[${address.address}]` : address.address}`;
    if (!isIP(address.address) || !isPublicWorkflowWebhookUrl(check))
      throw new Error(
        "Webhook destination resolved to a private or reserved network.",
      );
  }
  return url;
}
