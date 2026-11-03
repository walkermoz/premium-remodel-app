import "server-only";

import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { isPublicWorkflowWebhookUrl } from "./webhook-safety";

const reservedNetworks = new BlockList();
[
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
].forEach(([network, prefix]) =>
  reservedNetworks.addSubnet(String(network), Number(prefix), "ipv4"),
);
[
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:10::", 28],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
].forEach(([network, prefix]) =>
  reservedNetworks.addSubnet(String(network), Number(prefix), "ipv6"),
);

function isPublicAddress(address: string, family: number) {
  return (
    isIP(address) === family &&
    !reservedNetworks.check(address, family === 6 ? "ipv6" : "ipv4")
  );
}

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
    if (
      !isPublicAddress(address.address, address.family) ||
      !isPublicWorkflowWebhookUrl(check)
    )
      throw new Error(
        "Webhook destination resolved to a private or reserved network.",
      );
  }
  return { url, addresses };
}

export async function requestPublicWorkflowWebhook(
  value: string,
  options: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeoutMs: number;
    captureResponse: boolean;
    maxResponseBytes?: number;
  },
) {
  const { url, addresses } = await assertPublicWorkflowWebhookUrl(value);
  const destination = addresses[0];
  const maxResponseBytes = Math.max(
    0,
    Math.min(50_000, options.maxResponseBytes ?? 50_000),
  );

  return new Promise<{ status: number; ok: boolean; text: string }>(
    (resolve, reject) => {
      const request = httpsRequest(
        {
          protocol: "https:",
          hostname: destination.address,
          port: 443,
          servername: url.hostname,
          path: `${url.pathname}${url.search}`,
          method: options.method,
          headers: { ...options.headers, Host: url.host },
          rejectUnauthorized: true,
        },
        (response) => {
          const chunks: Buffer[] = [];
          let captured = 0;
          response.on("data", (value: Buffer | string) => {
            if (!options.captureResponse || captured >= maxResponseBytes)
              return;
            const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
            const remaining = maxResponseBytes - captured;
            chunks.push(chunk.subarray(0, remaining));
            captured += Math.min(chunk.length, remaining);
          });
          response.on("end", () => {
            const status = response.statusCode || 502;
            resolve({
              status,
              ok: status >= 200 && status < 300,
              text: Buffer.concat(chunks).toString("utf8"),
            });
          });
          response.on("error", reject);
        },
      );
      request.setTimeout(options.timeoutMs, () => {
        request.destroy(new Error("Webhook request timed out."));
      });
      request.on("error", reject);
      request.end(options.body);
    },
  );
}
