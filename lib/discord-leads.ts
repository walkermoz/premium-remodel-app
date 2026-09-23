export interface DiscordLeadInput {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  zip: string;
  address: string;
  project: string;
  project_description: string;
}

export interface DiscordNotificationResult {
  status: "sent" | "failed" | "not_configured";
  attemptedAt: string;
  detail?: string;
}

function safeDiscordText(value: string) {
  return value.replace(/@/g, "@\u200b").replace(/\r/g, "");
}

export function buildDiscordLeadMessage(
  lead: DiscordLeadInput,
  timestamp = new Date(),
) {
  const name = safeDiscordText(`${lead.first_name} ${lead.last_name}`.trim());
  const phone = safeDiscordText(lead.phone);

  return {
    username: "Premium Remodel Bot",
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title: "🔔 New Lead - Premium Living Home Improvement",
        description: "🔥 New inbound lead ready for follow-up",
        color: 3066993,
        fields: [
          { name: "👤 Name", value: name, inline: true },
          {
            name: "📧 Email",
            value: safeDiscordText(lead.email),
            inline: true,
          },
          {
            name: "📞 Phone",
            value: `[📞 Call ${phone}](tel:${phone})`,
            inline: true,
          },
          {
            name: "📍 Address",
            value: safeDiscordText(`${lead.address}, ${lead.zip}`),
            inline: false,
          },
          {
            name: "🛠 Project",
            value: safeDiscordText(lead.project),
            inline: false,
          },
          {
            name: "📍 Project Description",
            value: safeDiscordText(lead.project_description),
            inline: false,
          },
        ],
        footer: { text: "Premium Remodel Lead Intake" },
        timestamp: timestamp.toISOString(),
      },
    ],
  };
}

function configuredWebhook() {
  const value = process.env.DISCORD_LEAD_WEBHOOK_URL;
  if (!value) return null;
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "discord.com" ||
    !url.pathname.startsWith("/api/webhooks/")
  ) {
    throw new Error("Discord webhook configuration is invalid.");
  }
  return url.toString();
}

export async function sendDiscordLeadNotification(
  lead: DiscordLeadInput,
): Promise<DiscordNotificationResult> {
  const attemptedAt = new Date().toISOString();
  let webhook: string | null;
  try {
    webhook = configuredWebhook();
  } catch {
    return { status: "failed", attemptedAt, detail: "Invalid configuration" };
  }
  if (!webhook) return { status: "not_configured", attemptedAt };

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDiscordLeadMessage(lead)),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return {
        status: "failed",
        attemptedAt,
        detail: `Discord returned HTTP ${response.status}`,
      };
    }
    return { status: "sent", attemptedAt };
  } catch {
    return { status: "failed", attemptedAt, detail: "Delivery failed" };
  }
}
