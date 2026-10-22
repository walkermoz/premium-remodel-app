const env = process.env;
const webhook = new URL(env.DISCORD_BUILD_WEBHOOK);

if (webhook.origin !== "https://discord.com" || !webhook.pathname.startsWith("/api/webhooks/")) {
  throw new Error("DISCORD_BUILD_WEBHOOK must be a Discord webhook URL.");
}

const isPreview = env.GITHUB_EVENT_NAME === "pull_request";
const deployResult = isPreview ? env.PREVIEW_RESULT : env.PRODUCTION_RESULT;
const deployUrl = isPreview ? env.PREVIEW_URL : env.PRODUCTION_URL;
const checksPassed = env.QUALITY_RESULT === "success";
const failed = !checksPassed || deployResult === "failure";
const deployment = isPreview ? "Preview" : "Production";
const status = failed ? "failed" : deployUrl ? "deployed" : "checks passed";
const icon = failed ? "❌" : deployUrl ? "✅" : "⚠️";
const runUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
const source = isPreview
  ? `Pull request #${env.PR_NUMBER || "?"} · ${env.BUILD_REF}`
  : env.BUILD_REF;

const payload = {
  username: "Premium Remodel Builds",
  allowed_mentions: { parse: [] },
  embeds: [{
    title: `${icon} ${deployment} ${status}`,
    url: runUrl,
    color: failed ? 0xd54444 : deployUrl ? 0x2b9348 : 0xe6a23c,
    fields: [
      { name: "Source", value: source.slice(0, 1024), inline: true },
      { name: "Commit", value: env.GITHUB_SHA.slice(0, 7), inline: true },
      { name: "Checks", value: checksPassed ? "Passed" : "Failed", inline: true },
      { name: "Deployment", value: deployUrl ? `[Open ${deployment.toLowerCase()}](${deployUrl})` : deployResult === "failure" ? "Failed" : "No deployment URL", inline: false },
    ],
    timestamp: new Date().toISOString(),
  }],
};

try {
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Discord returned HTTP ${response.status}`);
  console.log(`Discord notified: ${deployment.toLowerCase()} ${status}.`);
} catch (error) {
  console.error(`::warning::Discord build notification failed: ${error.message}`);
  process.exitCode = 1;
}
