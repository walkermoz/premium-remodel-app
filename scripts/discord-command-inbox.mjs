import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: process.env.DOTENV_CONFIG_PATH || ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase admin environment is unavailable.");

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const action = process.argv[2];

async function claim() {
  const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { error: recoveryError } = await db
    .from("servicebuddy_discord_operator_commands")
    .update({ status: "new", claimed_at: null })
    .eq("status", "claimed")
    .lt("claimed_at", staleBefore);
  if (recoveryError) throw recoveryError;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: candidate, error: loadError } = await db
      .from("servicebuddy_discord_operator_commands")
      .select("id,discord_message_id,body,discord_created_at")
      .eq("status", "new")
      .order("discord_created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!candidate) return { command: null };
    const { data, error } = await db
      .from("servicebuddy_discord_operator_commands")
      .update({ status: "claimed", claimed_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .eq("status", "new")
      .select("id,discord_message_id,body,discord_created_at")
      .maybeSingle();
    if (error) throw error;
    if (data) return { command: data };
  }
  throw new Error("Could not atomically claim the next Discord command.");
}

async function finish(status) {
  const id = process.argv[3];
  const summary = process.argv.slice(4).join(" ").trim();
  if (!id || !summary) throw new Error(`Usage: ${action} <id> <summary>`);
  const { data, error } = await db
    .from("servicebuddy_discord_operator_commands")
    .update({
      status,
      result_summary: summary.slice(0, 2000),
      finished_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "claimed")
    .select("id,status")
    .single();
  if (error) throw error;
  return data;
}

let result;
if (action === "claim") result = await claim();
else if (["completed", "failed", "blocked"].includes(action))
  result = await finish(action);
else
  throw new Error(
    "Use claim, completed <id> <summary>, failed <id> <summary>, or blocked <id> <summary>.",
  );

process.stdout.write(`${JSON.stringify(result)}\n`);
