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

test("website lead confirmation is concise and includes compliance keywords", () => {
  const message = websiteLeadSmsBody(
    "Premium Remodel and Construction Company",
    "Whole-home kitchen and bathroom renovation",
  );
  expect(message.length).toBeLessThanOrEqual(160);
  expect(message).toContain("estimate request");
  expect(message).toContain("STOP");
  expect(message).toContain("HELP");
});
