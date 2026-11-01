import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
process.env.SUPABASE_TEST_ORGANIZATION_ID ||= randomUUID();
const testPort = Number(process.env.PLAYWRIGHT_PORT || 3100);
const testOrigin = `http://localhost:${testPort}`;
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  expect: { timeout: 15000 },
  use: {
    baseURL: testOrigin,
    actionTimeout: 20000,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run start -- --port ${testPort}`,
    url: `${testOrigin}/login`,
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      // Keep the web server on the same disposable Supabase project as the
      // test worker. `next start` also loads .env.local, so these explicit
      // values prevent an integration run from silently crossing projects.
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      SUPABASE_ORGANIZATION_ID: process.env.SUPABASE_TEST_ORGANIZATION_ID,
      APP_URL: testOrigin,
      VERCEL: "",
      CRON_SECRET: process.env.CRON_SECRET || "playwright-workflow-secret",
      WORKFLOW_ENGINE_MODE: process.env.WORKFLOW_ENGINE_MODE || "shadow",
      WORKFLOW_CURRENT_FLOWS_MODE:
        process.env.WORKFLOW_CURRENT_FLOWS_MODE || "shadow",
      // Tests must never use the company's real phone account.
      TWILIO_ACCOUNT_SID: "",
      TWILIO_AUTH_TOKEN: "",
      // Tests must never notify the company's real Discord channel.
      DISCORD_LEAD_WEBHOOK_URL: "",
      GOOGLE_CALENDAR_CLIENT_ID: "",
      GOOGLE_CALENDAR_CLIENT_SECRET: "",
      GOOGLE_GMAIL_CLIENT_ID: "",
      GOOGLE_GMAIL_CLIENT_SECRET: "",
      GOOGLE_TOKEN_ENCRYPTION_KEY: "",
      CLIENT_PORTAL_SECRET:
        "playwright-only-client-portal-secret-change-before-production",
    },
  },
});
