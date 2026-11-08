const webhook = process.env.DISCORD_BUILD_WEBHOOK?.trim();
if (!webhook) process.exit(0);

const runUrl = process.env.GITHUB_RUN_URL?.trim() || "GitHub Actions";
const response = await fetch(webhook, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    content:
      `🚨 **ServiceBuddy product council health check failed**\n` +
      `The bot could not verify its endpoint, /idea command, channels, or active recommendation packet. No product decision was changed.\n` +
      `Run: ${runUrl}`,
    allowed_mentions: { parse: [] },
  }),
});
if (!response.ok)
  throw new Error(`Discord health alert failed (${response.status}).`);
