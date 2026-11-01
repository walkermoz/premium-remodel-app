import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { sanitizeOrganizationExportValue } from "@/lib/organization-export-sanitizer";

test("organization exports recursively remove credential material", () => {
  expect(
    sanitizeOrganizationExportValue({
      id: "record-1",
      name: "Useful configuration",
      auth_token_ciphertext: "encrypted-provider-token",
      definition: {
        endpoint: "https://example.test/hook",
        token_hash: "verification-material",
        headers: [{ name: "X-Label", value: "safe" }],
      },
      nested: [{ password: "secret", status: "active" }],
    }),
  ).toEqual({
    id: "record-1",
    name: "Useful configuration",
    definition: {
      endpoint: "https://example.test/hook",
      headers: [{ name: "X-Label", value: "safe" }],
    },
    nested: [{ status: "active" }],
  });
});
test("deletion history permits repeated cancelled requests but only one active request", () => {
  const migration = readFileSync(
    "supabase/migrations/202611010001_modular_business_foundation.sql",
    "utf8",
  );
  expect(migration).toContain("remodel_org_deletion_one_pending");
  expect(migration).toContain(
    "where status in ('pending', 'processing', 'failed')",
  );
  expect(migration).not.toMatch(/^\s*unique \(organization_id, status\)/m);
});

test("organization lifecycle endpoints are owner-only and audited", () => {
  const lifecycle = readFileSync("lib/organization-lifecycle.ts", "utf8");
  const route = readFileSync("app/api/organization-lifecycle/route.ts", "utf8");
  const exportRoute = readFileSync(
    "app/api/organization-lifecycle/export/route.ts",
    "utf8",
  );
  expect(lifecycle).toContain('user.group !== "owner"');
  expect(route).toContain("recordAuditEvent");
  expect(exportRoute).toContain("recordAuditEvent");
  expect(exportRoute).toContain('"Cache-Control": "private, no-store"');
});

test("organization export packages tenant uploads with integrity metadata", () => {
  const archive = readFileSync("lib/organization-archive.ts", "utf8");
  const lifecycle = readFileSync("lib/organization-lifecycle.ts", "utf8");
  const exportRoute = readFileSync(
    "app/api/organization-lifecycle/export/route.ts",
    "utf8",
  );
  expect(archive).toContain("listOrganizationFiles(organizationId)");
  expect(archive).toContain("path.startsWith(`${organizationId}/`)");
  expect(archive).toContain('name: "data/organization.json"');
  expect(archive).toContain('name: "data/files-manifest.json"');
  expect(archive).toContain('createHash("sha256")');
  expect(lifecycle).toContain("Organization-owned uploads are stored");
  expect(exportRoute).toContain('"Content-Type": "application/zip"');
  expect(exportRoute).toContain("createOrganizationExportArchive");
});

test("due deletion is claimed, externally disconnected, and transactionally removed", () => {
  const lifecycle = readFileSync("lib/organization-lifecycle.ts", "utf8");
  const migration = readFileSync(
    "supabase/migrations/202611010001_modular_business_foundation.sql",
    "utf8",
  );
  const worker = readFileSync(
    "app/api/organization-lifecycle/worker/route.ts",
    "utf8",
  );
  expect(worker).toContain("timingSafeEqual");
  expect(worker).toContain("CRON_SECRET");
  expect(lifecycle).toContain("revokeGoogleMailForOrganization");
  expect(lifecycle).toContain("revokeGoogleCalendarsForOrganization");
  expect(lifecycle).toContain("disconnectStripeAccountForOrganization");
  expect(lifecycle).toContain("deleteOrganizationStorage");
  expect(lifecycle).toContain('status: "processing"');
  expect(lifecycle).toContain('status: "failed"');
  expect(migration).toContain("servicebuddy_delete_organization");
  expect(migration).toContain("Deletion request is not claimed and due.");
  expect(migration).toContain("delete from public.organizations");
});
