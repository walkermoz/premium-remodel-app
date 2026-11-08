import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  implementationSelect,
  implementationTask,
  parsePullRequestUrl,
} from "./discord-approval-inbox-core.mjs";

config({ path: process.env.DOTENV_CONFIG_PATH || ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase admin environment is unavailable.");

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const action = process.argv[2];

async function loadCandidate() {
  const { data, error } = await db
    .from("servicebuddy_product_implementations")
    .select(implementationSelect)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function claim() {
  const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { error: recoveryError } = await db
    .from("servicebuddy_product_implementations")
    .update({ status: "queued", claimed_at: null, started_at: null })
    .eq("status", "running")
    .lt("claimed_at", staleBefore)
    .is("pr_url", null);
  if (recoveryError) throw recoveryError;

  let candidate = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    candidate ||= await loadCandidate();
    if (!candidate) return { approval: null };
    const now = new Date().toISOString();
    const { data, error } = await db
      .from("servicebuddy_product_implementations")
      .update({
        status: "running",
        claimed_at: now,
        started_at: now,
        codex_model: "Codex chat",
        updated_at: now,
      })
      .eq("id", candidate.id)
      .eq("status", "queued")
      .select(implementationSelect)
      .maybeSingle();
    if (error) throw error;
    if (data) return { approval: implementationTask(data) };
    candidate = null;
  }
  throw new Error("Could not atomically claim the next approved build.");
}

async function complete() {
  const id = process.argv[3];
  const prUrl = process.argv[4];
  const branchName = process.argv[5];
  const summary = process.argv.slice(6).join(" ").trim();
  if (!id || !prUrl || !branchName)
    throw new Error(
      "Usage: completed <id> <pr-url> <branch-name> [summary]",
    );
  const prNumber = parsePullRequestUrl(prUrl);
  const { data, error } = await db
    .from("servicebuddy_product_implementations")
    .update({
      status: "pr_open",
      pr_url: prUrl,
      pr_number: prNumber,
      branch_name: branchName,
      pr_opened_at: new Date().toISOString(),
      failure_message: summary.slice(0, 2000) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "running")
    .select("id,status,pr_url,pr_number,branch_name")
    .single();
  if (error) throw error;
  return data;
}

async function finish(status) {
  const id = process.argv[3];
  const summary = process.argv.slice(4).join(" ").trim();
  if (!id || !summary) throw new Error(`Usage: ${action} <id> <summary>`);
  const { data, error } = await db
    .from("servicebuddy_product_implementations")
    .update({
      status,
      failure_message: summary.slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "running")
    .select("id,status")
    .single();
  if (error) throw error;
  return data;
}

let result;
if (action === "claim") result = await claim();
else if (action === "completed") result = await complete();
else if (["failed", "blocked"].includes(action)) result = await finish(action);
else
  throw new Error(
    "Use claim, completed <id> <pr-url> <branch-name> [summary], failed <id> <summary>, or blocked <id> <summary>.",
  );

process.stdout.write(`${JSON.stringify(result)}\n`);
