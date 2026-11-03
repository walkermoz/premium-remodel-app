import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("quote document revisions remain service-role only", () => {
  const migration = readFileSync(
    "supabase/migrations/202611030002_quote_document_revisions.sql",
    "utf8",
  );
  expect(migration).toContain(
    "revoke all on public.remodel_quote_document_revisions from public, anon, authenticated",
  );
  expect(migration).toContain(
    "grant all on public.remodel_quote_document_revisions to service_role",
  );
  expect(migration).not.toMatch(
    /grant\s+select\s+on\s+public\.remodel_quote_document_revisions\s+to\s+authenticated/i,
  );
  expect(migration).not.toMatch(
    /create\s+policy[\s\S]*remodel_quote_document_revisions[\s\S]*for\s+select/i,
  );
});

test("browser mutation origin checks use the configured canonical app origin", () => {
  const auth = readFileSync("lib/auth.ts", "utf8");
  expect(auth).toContain("const expected = process.env.APP_URL");
  expect(auth).toContain("new URL(process.env.APP_URL).origin");
  expect(auth).toContain("origin !== expected");
});

test("production archive dependency has no vulnerable archiver chain", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  expect(packageJson.dependencies["zip-stream"]).toBeTruthy();
  expect(packageJson.dependencies.archiver).toBeUndefined();
  expect(packageJson.devDependencies["@types/archiver"]).toBeUndefined();
});
