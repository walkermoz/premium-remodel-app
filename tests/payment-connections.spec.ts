import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const read = (path: string) => readFileSync(path, "utf8");

test("payment connections are tenant scoped and Stripe Connect ready", () => {
  const migration = read(
    "supabase/migrations/202611010001_modular_business_foundation.sql",
  );
  expect(migration).toContain("remodel_payment_connections");
  expect(migration).toContain("unique (organization_id, provider)");
  expect(migration).toContain("unique (provider, external_account_id)");
  expect(migration).toContain(
    "revoke all on public.remodel_payment_connections from public, anon, authenticated",
  );

  const connect = read("lib/stripe-connect.ts");
  expect(connect).toContain("https://connect.stripe.com/oauth/authorize");
  expect(connect).toContain("https://connect.stripe.com/oauth/deauthorize");
  expect(connect).toContain("organizationIdForStripeAccount");
});

test("new payment metadata is platform neutral while old checkouts remain accepted", () => {
  const checkout = read("app/api/stripe/checkout/route.ts");
  const webhook = read("app/api/stripe/webhook/route.ts");
  expect(checkout).toContain('source: "servicebuddy_project_payment_v1"');
  expect(webhook).toContain('meta?.source !== "premium_remodel_project"');
  expect(webhook).toContain("organizationIdForStripeAccount(event.account)");
});
