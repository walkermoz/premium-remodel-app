import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const read = (path: string) => readFileSync(path, "utf8");

test("optional modules have explicit tenant-owned activation state", () => {
  const schema = read("lib/business-config-schema.ts");
  const defaults = read("lib/business-config.ts");
  const migration = read(
    "supabase/migrations/202611010001_modular_business_foundation.sql",
  );
  expect(schema).toContain("modules: z.object");
  expect(schema).toContain("automations: z.boolean().default(false)");
  expect(defaults).toContain("automations: premium");
  expect(migration).toContain("add column if not exists modules jsonb");
});
test("disabled modules are enforced beyond navigation visibility", () => {
  const access = read("lib/workspace-tab-access.ts");
  const permissions = read("lib/organization-permissions.ts");
  expect(access).toContain(
    'if (tab === "Automation") return config.modules.automations',
  );
  expect(permissions).toContain('"workflows.manage": "automations"');
  expect(permissions).toContain('"agreements.manage": "agreements"');
  expect(permissions).toContain('"payments.manage": "payments"');
  expect(permissions).toContain("Enable it in Business modules first.");
});
