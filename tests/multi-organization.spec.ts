import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect, password } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };

cloudTest(
  "organization setup status is limited to administrators",
  async ({ company, page }) => {
    const memberUser = await company.admin.auth.admin.createUser({
      email: company.memberEmail,
      password,
      email_confirm: true,
    });
    expect(memberUser.error).toBeNull();
    const memberProfile = await company.admin.from("profiles").insert({
      organization_id: company.organizationId,
      auth_user_id: memberUser.data.user!.id,
      full_name: "Workspace Member",
      email: company.memberEmail,
      role: "office",
      active: true,
    });
    expect(memberProfile.error).toBeNull();
    const login = await page.request.post("/api/auth", {
      headers: origin,
      data: { action: "login", email: company.memberEmail, password },
    });
    expect(login.status()).toBe(200);
    expect((await page.request.get("/api/onboarding/status")).status()).toBe(
      403,
    );
    expect((await page.request.get("/api/twilio/config")).status()).toBe(403);
    expect((await page.request.get("/api/admin/api-keys")).status()).toBe(403);
    const mail = await page.request.get("/api/google-mail");
    expect(mail.status()).toBe(200);
    expect(await mail.json()).toEqual({ connected: false });
  },
);

cloudTest(
  "an organization owner can create another business",
  async ({ company, page }) => {
    const login = await page.request.post("/api/auth", {
      headers: origin,
      data: { action: "login", email: company.email, password },
    });
    expect(login.status()).toBe(200);
    const attempt = await page.request.put("/api/organizations", {
      headers: origin,
      data: { name: "Owner test business" },
    });
    expect(attempt.status()).toBe(201);
    const created = (await attempt.json()) as { id: string };
    try {
      const listed = await page.request.get("/api/organizations");
      expect(listed.status()).toBe(200);
      expect((await listed.json()).organizations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: created.id,
            name: "Owner test business",
          }),
        ]),
      );
    } finally {
      const membership = await company.admin
        .from("remodel_memberships")
        .delete()
        .eq("organization_id", created.id);
      expect(membership.error).toBeNull();
      const organization = await company.admin
        .from("organizations")
        .delete()
        .eq("id", created.id);
      expect(organization.error).toBeNull();
    }
  },
);

cloudTest(
  "one employee can switch companies without mixing records",
  async ({ company, page }) => {
    const secondOrg = randomUUID();
    const homeRecord = randomUUID();
    const secondRecord = randomUUID();
    const admin = company.admin;
    const profile = await admin
      .from("profiles")
      .select("id")
      .eq("organization_id", company.organizationId)
      .eq("email", company.email)
      .single();
    expect(profile.error).toBeNull();
    const profileId = profile.data!.id;
    const now = new Date().toISOString();
    try {
      expect(
        (
          await admin
            .from("organizations")
            .insert({ id: secondOrg, name: "Second test company" })
        ).error,
      ).toBeNull();
      expect(
        (
          await admin.from("remodel_memberships").insert({
            organization_id: secondOrg,
            profile_id: profileId,
            role: "office",
            active: true,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await admin.from("remodel_records").insert([
            {
              id: homeRecord,
              organization_id: company.organizationId,
              kind: "project",
              data: {
                id: homeRecord,
                name: "Home-only job",
                createdAt: now,
                updatedAt: now,
              },
              updated_at: now,
            },
            {
              id: secondRecord,
              organization_id: secondOrg,
              kind: "project",
              data: {
                id: secondRecord,
                name: "Second-only job",
                createdAt: now,
                updatedAt: now,
              },
              updated_at: now,
            },
          ])
        ).error,
      ).toBeNull();

      const api = page.request;
      expect(
        (
          await api.post("/api/auth", {
            headers: origin,
            data: {
              action: "login",
              email: company.email,
              password,
            },
          })
        ).status(),
      ).toBe(200);
      const listed = await api.get("/api/organizations");
      expect(listed.status()).toBe(200);
      expect(
        (await listed.json()).organizations.map(
          (item: { id: string }) => item.id,
        ),
      ).toEqual(expect.arrayContaining([company.organizationId, secondOrg]));

      expect(
        (
          await api.post("/api/organizations", {
            headers: origin,
            data: { organizationId: secondOrg },
          })
        ).status(),
      ).toBe(200);
      const secondWorkspace = await api.get("/api/workspace");
      expect(secondWorkspace.status()).toBe(200);
      const projectIds = (await secondWorkspace.json()).projects.map(
        (project: { id: string }) => project.id,
      );
      expect(projectIds).toContain(secondRecord);
      expect(projectIds).not.toContain(homeRecord);

      const direct = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          global: { headers: { "x-remodel-organization-id": secondOrg } },
          auth: { persistSession: false, autoRefreshToken: false },
        },
      );
      expect(
        (
          await direct.auth.signInWithPassword({
            email: company.email,
            password,
          })
        ).error,
      ).toBeNull();
      const visible = await direct
        .from("remodel_records")
        .select("id")
        .in("id", [homeRecord, secondRecord]);
      expect(visible.error).toBeNull();
      expect(visible.data?.map((row) => row.id)).toEqual([secondRecord]);
      await direct.auth.signOut({ scope: "local" });

      expect(
        (
          await admin
            .from("remodel_memberships")
            .update({ active: false })
            .eq("organization_id", secondOrg)
            .eq("profile_id", profileId)
        ).error,
      ).toBeNull();
      expect((await api.get("/api/workspace")).status()).toBe(401);
      expect(
        (
          await api.post("/api/organizations", {
            headers: origin,
            data: {
              organizationId: company.organizationId,
            },
          })
        ).status(),
      ).toBe(200);
      expect((await api.get("/api/workspace")).status()).toBe(200);
      expect(
        (
          await api.post("/api/organizations", {
            headers: origin,
            data: {
              organizationId: secondOrg,
            },
          })
        ).status(),
      ).toBe(403);
    } finally {
      await admin
        .from("remodel_records")
        .delete()
        .in("id", [homeRecord, secondRecord]);
      await admin.from("organizations").delete().eq("id", secondOrg);
    }
  },
);
