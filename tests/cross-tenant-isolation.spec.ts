import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const migrationPath =
  "supabase/migrations/202611010001_modular_business_foundation.sql";

const tenantTables = [
  "remodel_organization_secrets",
  "remodel_workflow_incidents",
  "remodel_agreement_templates",
  "remodel_agreement_template_versions",
  "remodel_agreement_packets",
  "remodel_agreement_signers",
  "remodel_agreement_field_values",
  "remodel_payment_connections",
  "remodel_organization_deletion_requests",
] as const;

test("new tenant tables are private to the service layer and protected by RLS", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const table of tenantTables) {
    expect(sql, `${table} must enable RLS`).toContain(
      `alter table public.${table} enable row level security;`,
    );
    expect(sql, `${table} must not be queryable by browser roles`).toContain(
      `revoke all on public.${table} from public, anon, authenticated;`,
    );
    expect(sql, `${table} must be service-role only`).toContain(
      `grant all on public.${table} to service_role;`,
    );
  }
});

test("agreement relationships cannot cross organization boundaries", async () => {
  const sql = await readFile(migrationPath, "utf8");
  expect(sql).toContain(
    "references public.remodel_agreement_templates(organization_id, id)",
  );
  expect(sql).toContain(
    "references public.remodel_agreement_template_versions(organization_id, template_id, version)",
  );
  expect(sql).toContain(
    "references public.remodel_agreement_packets(organization_id, id)",
  );
  expect(sql).toContain("unique (organization_id, id)");
});

test("tenant services scope reads and mutations before exposing data", async () => {
  const [agreements, secrets, payments, lifecycle, incidents] =
    await Promise.all(
      [
        "lib/agreement-templates.ts",
        "lib/organization-secrets.ts",
        "lib/stripe-connect.ts",
        "lib/organization-lifecycle.ts",
        "lib/workflows/incidents.ts",
      ].map((path) => readFile(path, "utf8")),
    );

  expect(agreements).toContain('.eq("organization_id", organizationId)');
  expect(agreements).toContain("`${user.organizationId}/agreements/${id}/source.pdf`");
  expect(agreements).toContain(
    'row.storage_path.startsWith(`${organizationId}/agreements/`)',
  );

  expect(secrets).toContain('.eq("organization_id", organizationId)');
  expect(secrets).toContain("`${organizationId}:${secretId}:v1`");

  expect(payments).toContain('.eq("organization_id", organizationId)');
  expect(payments).toContain("organization_id: user.organizationId");

  expect(lifecycle).toContain('.eq("organization_id", organizationId)');
  expect(lifecycle).toContain('.eq("organization_id", user.organizationId)');

  expect(incidents).toContain('.eq("organization_id", input.organizationId)');
  expect(incidents).toContain("organization_id: input.organizationId");
});
