import { expect, test } from "@playwright/test";
import {
  sameWebPolicyUrl,
  webhookConsentEnvelopeSchema,
} from "@/lib/webhook-sms-consent";

const evidence = {
  source: "North Star Renovations website lead form",
  policyVersion: "2026-11-01",
  privacyUrl: "https://northstar.example/privacy",
  termsUrl: "https://northstar.example/terms",
  capturedAt: "2026-11-01T14:00:00.000Z",
  origin: "https://northstar.example",
  appointment: true,
  marketing: false,
};

test("webhook consent accepts a complete immutable policy snapshot", () => {
  expect(
    webhookConsentEnvelopeSchema.parse({
      smsAppointmentOptIn: true,
      smsMarketingOptIn: false,
      smsConsentEvidence: evidence,
    }).smsConsentEvidence,
  ).toEqual(evidence);
});
test("webhook consent rejects insecure policy and origin URLs", () => {
  expect(
    webhookConsentEnvelopeSchema.safeParse({
      smsAppointmentOptIn: true,
      smsConsentEvidence: {
        ...evidence,
        privacyUrl: "http://northstar.example/privacy",
      },
    }).success,
  ).toBe(false);
  expect(
    webhookConsentEnvelopeSchema.safeParse({
      smsAppointmentOptIn: true,
      smsConsentEvidence: {
        ...evidence,
        origin: "http://northstar.example",
      },
    }).success,
  ).toBe(false);
});

test("policy URL comparison ignores only an insignificant trailing slash", () => {
  expect(
    sameWebPolicyUrl(
      "https://northstar.example/privacy/",
      "https://northstar.example/privacy",
    ),
  ).toBe(true);
  expect(
    sameWebPolicyUrl(
      "https://northstar.example/privacy",
      "https://other.example/privacy",
    ),
  ).toBe(false);
});
