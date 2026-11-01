import { expect, test } from "@playwright/test";
import { classifySmsComplianceEvent } from "../lib/sms-compliance-keywords";
import {
  premiumRemodelSmsPolicy,
  websiteSmsConsentEvidence,
} from "../lib/sms-consent";
import { websiteLeadSmsBody } from "../lib/lead-sms-copy";

test("SMS compliance keywords are exact and case-insensitive", () => {
  expect(classifySmsComplianceEvent("help")).toBe("help");
  expect(classifySmsComplianceEvent(" INFO ")).toBe("help");
  expect(classifySmsComplianceEvent("Stop")).toBe("stop");
  expect(classifySmsComplianceEvent("UNSUBSCRIBE")).toBe("stop");
  expect(classifySmsComplianceEvent("start")).toBe("start");
  expect(classifySmsComplianceEvent("UnStop")).toBe("start");
  expect(classifySmsComplianceEvent("please stop")).toBeNull();
  expect(classifySmsComplianceEvent("hello")).toBeNull();
});

test("Twilio OptOutType takes precedence over message copy", () => {
  expect(classifySmsComplianceEvent("anything", "STOP")).toBe("stop");
  expect(classifySmsComplianceEvent("anything", "START")).toBe("start");
  expect(classifySmsComplianceEvent("anything", "HELP")).toBe("help");
});

test("website SMS consent evidence preserves separate optional choices", () => {
  const evidence = websiteSmsConsentEvidence({
    capturedAt: "2026-10-30T12:00:00.000Z",
    origin: "https://www.premiumremodel.com",
    appointment: true,
    marketing: false,
  });
  expect(evidence).toEqual({
    ...premiumRemodelSmsPolicy,
    source: "premiumremodel.com consultation form",
    policyVersion: "2026-10-21",
    capturedAt: "2026-10-30T12:00:00.000Z",
    origin: "https://www.premiumremodel.com",
    appointment: true,
    marketing: false,
  });
});

test("SMS evidence snapshots another organization's policy without Premium defaults", () => {
  const evidence = websiteSmsConsentEvidence(
    {
      capturedAt: "2026-11-01T12:00:00.000Z",
      origin: "https://portal.servicebuddy.example",
      appointment: true,
      marketing: false,
    },
    {
      source: "northstar.example consultation form",
      policyVersion: "2026-11-01",
      privacyUrl: "https://northstar.example/privacy",
      termsUrl: "https://northstar.example/terms",
    },
  );
  expect(evidence.source).toBe("northstar.example consultation form");
  expect(evidence.privacyUrl).toBe("https://northstar.example/privacy");
  expect(evidence.termsUrl).toBe("https://northstar.example/terms");
});

test("website lead confirmation is concise and includes compliance keywords", () => {
  expect(websiteLeadSmsBody("Premium Remodel", "Kitchen Remodel")).toBe(
    "Premium Remodel: We received your Kitchen Remodel request. A member of our team will be in touch soon to schedule a visit. STOP to opt out; HELP for help.",
  );
  const message = websiteLeadSmsBody(
    "Premium Remodel and Construction Company",
    "Whole-home kitchen and bathroom renovation",
  );
  expect(message.length).toBeLessThanOrEqual(160);
  expect(message).toContain(
    "A member of our team will be in touch soon to schedule a visit.",
  );
  expect(message).toContain("STOP");
  expect(message).toContain("HELP");
});
