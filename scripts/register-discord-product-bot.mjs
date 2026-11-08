const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const applicationId = required("DISCORD_PRODUCT_APPLICATION_ID");
const guildId = required("DISCORD_PRODUCT_GUILD_ID");
const token = required("DISCORD_PRODUCT_BOT_TOKEN");
const endpoint = `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`;
const commands = [
  {
    name: "idea",
    description:
      "Submit product evidence for a future ServiceBuddy recommendation batch",
    default_member_permissions: null,
    dm_permission: false,
    options: [
      {
        type: 3,
        name: "description",
        description: "The problem, workflow, or feature idea to consider",
        required: true,
        min_length: 3,
        max_length: 1000,
      },
    ],
  },
];

const response = await fetch(endpoint, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(commands),
});
if (!response.ok)
  throw new Error(
    `Discord command registration failed (${response.status}): ${await response.text()}`,
  );
const registered = await response.json();
console.log(
  `Registered ${registered.length} product command(s) for guild ${guildId}.`,
);
