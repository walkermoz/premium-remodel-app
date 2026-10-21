import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWebsiteLead } from "../lib/website-lead-input";

test("missing description and consent do not reject a contactable lead", () => {
  const { data, otherSubmittedFields } = parseWebsiteLead({
    phone: "+19195550123",
    first_name: "Jordan",
  });
  assert.equal(data.project_description, undefined);
  assert.equal(data.sms_appointment_opt_in, false);
  assert.equal(data.sms_marketing_opt_in, false);
  assert.deepEqual(otherSubmittedFields, {});
});

test("only literal true opts into each SMS category", () => {
  const { data } = parseWebsiteLead({
    email: "jordan@example.com",
    sms_appointment_opt_in: "true",
    sms_marketing_opt_in: true,
  });
  assert.equal(data.sms_appointment_opt_in, false);
  assert.equal(data.sms_marketing_opt_in, true);
});

test("new fields are retained separately without changing consent", () => {
  const { data, otherSubmittedFields } = parseWebsiteLead({
    phone: "+19195550123",
    preferred_contact_time: "Morning",
    service_options: ["Tile", "Paint"],
    sms_consent: true,
    captcha_token: "must-not-store",
  });
  assert.equal(data.sms_appointment_opt_in, false);
  assert.equal(data.sms_marketing_opt_in, false);
  assert.deepEqual(otherSubmittedFields, {
    preferred_contact_time: "Morning",
    service_options: '["Tile","Paint"]',
    sms_consent: "true",
  });
});

test("a long optional description is bounded rather than rejecting the lead", () => {
  const { data } = parseWebsiteLead({
    email: "jordan@example.com",
    project_description: "x".repeat(20_000),
  });
  assert.equal(data.project_description?.length, 15_000);
});
