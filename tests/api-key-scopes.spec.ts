import { randomUUID } from "node:crypto";
import { test, expect, password } from "./supabase-fixture";
import { missingApiKeyScopes } from "@/lib/api-key-types";

test("lead patch fields each require their own scope", () => {
  expect(
    missingApiKeyScopes(["leads:read"], ["notes", "status", "nextActionDue"]),
  ).toEqual([
    "leads:write:notes",
    "leads:write:status",
    "leads:write:next_action",
  ]);
  expect(
    missingApiKeyScopes(
      ["leads:read", "leads:write:next_action"],
      ["nextAction", "nextActionDue"],
    ),
  ).toEqual([]);
});

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;

cloudTest(
  "scoped API keys enforce read, write, expiration, and revocation",
  async ({ company, page }) => {
    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers: { Origin: "http://localhost:3100" },
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);

    const invalid = await api.post("/api/admin/api-keys", {
      headers: { Origin: "http://localhost:3100" },
      data: {
        name: "Too broad",
        scopes: ["leads:read", "quotes:write"],
        expiresInDays: 30,
      },
    });
    expect(invalid.status()).toBe(400);

    const created = await api.post("/api/admin/api-keys", {
      headers: { Origin: "http://localhost:3100" },
      data: {
        name: "Read-only test",
        scopes: ["leads:read"],
        expiresInDays: 30,
      },
    });
    expect(created.status()).toBe(201);
    expect(created.headers()["cache-control"]).toBe("private, no-store");
    const { key, secret } = await created.json();
    expect(secret).toMatch(/^sbk_/);
    expect(key).toMatchObject({
      scopes: ["leads:read"],
      expiresAt: expect.any(String),
    });

    const listed = await (await api.get("/api/admin/api-keys")).json();
    expect(
      listed.keys.find((item: { id: string }) => item.id === key.id),
    ).not.toHaveProperty("secret");

    const leadId = randomUUID();
    const contactId = randomUUID();
    const now = new Date().toISOString();
    const inserted = await company.admin.from("remodel_records").insert({
      id: leadId,
      organization_id: company.organizationId,
      kind: "lead",
      project_id: null,
      updated_at: now,
      data: {
        id: leadId,
        contactId,
        name: "Scope Test",
        project: "Kitchen",
        projectDescription: "",
        status: "New",
        source: "Test",
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(inserted.error).toBeNull();

    const headers = { Authorization: `Bearer ${secret}` };
    expect(
      (await api.get(`/api/v1/leads/${leadId}`, { headers })).status(),
    ).toBe(200);
    const denied = await api.patch(`/api/v1/leads/${leadId}`, {
      headers,
      data: { notes: "Denied" },
    });
    expect(denied.status()).toBe(403);
    expect((await denied.json()).error).toContain("leads:write:notes");

    const writer = await api.post("/api/admin/api-keys", {
      headers: { Origin: "http://localhost:3100" },
      data: {
        name: "Notes test",
        scopes: ["leads:read", "leads:write:notes"],
        expiresInDays: 90,
      },
    });
    expect(writer.status()).toBe(201);
    const writerKey = await writer.json();
    const writerHeaders = { Authorization: `Bearer ${writerKey.secret}` };
    expect(
      (
        await api.patch(`/api/v1/leads/${leadId}`, {
          headers: writerHeaders,
          data: { notes: "Allowed" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await api.patch(`/api/v1/leads/${leadId}`, {
          headers: writerHeaders,
          data: { status: "Won" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await api.patch(`/api/v1/leads/${leadId}`, {
          headers: writerHeaders,
          data: { notes: "Should not save", status: "Won" },
        })
      ).status(),
    ).toBe(403);
    const unchanged = await (
      await api.get(`/api/v1/leads/${leadId}`, { headers: writerHeaders })
    ).json();
    expect(unchanged.lead).toMatchObject({ notes: "Allowed", status: "New" });

    const expired = await company.admin
      .from("remodel_api_keys")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", writerKey.key.id);
    expect(expired.error).toBeNull();
    expect(
      (await api.get("/api/v1/leads", { headers: writerHeaders })).status(),
    ).toBe(401);

    const revoked = await api.delete("/api/admin/api-keys", {
      headers: { Origin: "http://localhost:3100" },
      data: { id: key.id },
    });
    expect(revoked.status()).toBe(200);
    expect((await api.get("/api/v1/leads", { headers })).status()).toBe(401);
  },
);
