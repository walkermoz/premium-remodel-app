import { expect, test } from "@playwright/test";
import {
  apiKeyScopeLabels,
  apiKeyScopes,
} from "../lib/api-key-types";

test("API key scopes are granular, unique, and have administrator-facing copy", () => {
  expect(new Set(apiKeyScopes).size).toBe(apiKeyScopes.length);
  expect(apiKeyScopes).toContain("leads.read");
  expect(apiKeyScopes).toContain("leads.write.notes");
  expect(apiKeyScopes).toContain("leads.write.approval");
  for (const scope of apiKeyScopes) {
    expect(apiKeyScopeLabels[scope].label.length).toBeGreaterThan(2);
    expect(apiKeyScopeLabels[scope].description.length).toBeGreaterThan(10);
  }
});
