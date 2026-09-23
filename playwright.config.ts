import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
process.env.SUPABASE_TEST_ORGANIZATION_ID ||= randomUUID();
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://localhost:3100",
    actionTimeout: 20000,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      SUPABASE_ORGANIZATION_ID: process.env.SUPABASE_TEST_ORGANIZATION_ID,
      APP_URL: "http://localhost:3100",
      VERCEL: "",
      // Tests must never use the company's real phone account.
      TWILIO_ACCOUNT_SID: "",
      TWILIO_AUTH_TOKEN: "",
      // Tests must never notify the company's real Discord channel.
      DISCORD_LEAD_WEBHOOK_URL: "",
      GOOGLE_CALENDAR_CLIENT_ID: "",
      GOOGLE_CALENDAR_CLIENT_SECRET: "",
      GOOGLE_TOKEN_ENCRYPTION_KEY: "",
      CLIENT_PORTAL_SECRET:
        "playwright-only-client-portal-secret-change-before-production",
    },
  },
});
