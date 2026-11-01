import { test as base, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
export const password = "A-long-test-passphrase-927!";

const retryingLocalFetch: typeof fetch = async (input, init) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const originalSignal = init?.signal;
    const abort = () => controller.abort();
    originalSignal?.addEventListener("abort", abort, { once: true });
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      lastError = error;
      if (attempt < 2)
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
      originalSignal?.removeEventListener("abort", abort);
    }
  }
  throw lastError;
};

type Company = {
  email: string;
  memberEmail: string;
  organizationId: string;
  admin: SupabaseClient;
};
export const test = base.extend<{ company: Company }>({
  company: async ({}, runTest) => {
    const org = process.env.SUPABASE_TEST_ORGANIZATION_ID!;
    if (!org) throw new Error("Tests require an isolated organization.");
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        global: { fetch: retryingLocalFetch },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const suffix = randomUUID();
    const email = `v2-qa-owner-${suffix}@premiumremodel.test`;
    const memberEmail = `v2-qa-member-${suffix}@premiumremodel.test`;
    let ownerId = "";
    try {
      const createdOrg = await admin
        .from("organizations")
        .upsert(
          { id: org, name: "Temporary v2 integration test" },
          { onConflict: "id" },
        );
      if (createdOrg.error) throw createdOrg.error;
      const owner = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (owner.error) throw owner.error;
      ownerId = owner.data.user.id;
      const profile = await admin.from("profiles").upsert({
        organization_id: org,
        auth_user_id: ownerId,
        full_name: "Workspace Owner",
        email,
        role: "owner",
        active: true,
      }, { onConflict: "auth_user_id" });
      if (profile.error) throw profile.error;
      await runTest({ email, memberEmail, organizationId: org, admin });
    } finally {
      const records = await admin
        .from("remodel_records")
        .select("data")
        .eq("organization_id", org)
        .eq("kind", "attachment");
      const paths = records.data?.map((r) => r.data.path) || [];
      if (paths.length) await admin.storage.from("remodel-files").remove(paths);
      await admin.from("remodel_records").delete().eq("organization_id", org);
      const profiles = await admin
        .from("profiles")
        .select("auth_user_id")
        .eq("organization_id", org);
      await admin.from("profiles").delete().eq("organization_id", org);
      const authIds = new Set([
        ownerId,
        ...(profiles.data || []).map((p) => p.auth_user_id),
      ]);
      for (const id of authIds) if (id) await admin.auth.admin.deleteUser(id);
      const removed = await admin.from("organizations").delete().eq("id", org);
      if (removed.error) throw removed.error;
    }
  },
});
export { expect };
