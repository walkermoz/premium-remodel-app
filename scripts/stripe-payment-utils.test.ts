import assert from "node:assert/strict";
import { test } from "node:test";
import { dollarsToCents, stripePaymentId } from "../lib/stripe-payment-utils";

test("accepts exact payment cents within Stripe limits", () => {
  assert.equal(dollarsToCents("0.50"), 50);
  assert.equal(dollarsToCents("1290.05"), 129005);
  assert.equal(dollarsToCents("999999.99"), 99999999);
  for (const value of ["0.49", "12.345", "-2", "1e5", "9999999", 12])
    assert.equal(dollarsToCents(value), null);
});

test("Stripe session replay maps to one stable payment record", () => {
  const first = stripePaymentId("cs_test_first");
  assert.match(
    first,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(first, stripePaymentId("cs_test_first"));
  assert.notEqual(first, stripePaymentId("cs_test_other"));
});
