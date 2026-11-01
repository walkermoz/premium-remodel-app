import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  organizationPaymentProviderIds,
} from "../lib/business-config-schema";

test("payment providers have one extension point for checkout and financing", async () => {
  expect(organizationPaymentProviderIds).toEqual(["manual", "stripe"]);
  const source = await readFile("lib/payment-providers.ts", "utf8");
  expect(source).toContain("export type PaymentProviderAdapter");
  expect(source).toContain("onlineCheckout: boolean");
  expect(source).toContain("savedPaymentMethods: boolean");
  expect(source).toContain("financing: boolean");
  expect(source).toContain("createCheckout?");
  expect(source).toContain("const adapters: Record<");
});

test("project checkout uses the selected provider adapter", async () => {
  const route = await readFile("app/api/stripe/checkout/route.ts", "utf8");
  expect(route).toContain('paymentProviderAdapter("stripe")');
  expect(route).toContain("provider.createCheckout");
  expect(route).not.toContain("checkout.sessions.create");
});
