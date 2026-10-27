import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { test, expect, password } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };

cloudTest(
  "team photos stay private to their organization",
  async ({ company, page, request }) => {
    const admin = company.admin;
    const secondOrg = randomUUID();
    const { data: profile, error } = await admin
      .from("profiles")
      .select("id")
      .eq("organization_id", company.organizationId)
      .eq("email", company.email)
      .single();
    expect(error).toBeNull();
    const memberId = profile!.id;
    const url = `/api/team-photos?memberId=${memberId}`;
    const api = page.request;
    try {
      expect(
        (
          await api.post("/api/auth", {
            headers: origin,
            data: { action: "login", email: company.email, password },
          })
        ).status(),
      ).toBe(200);
      const invalid = await api.post("/api/team-photos", {
        headers: origin,
        multipart: {
          memberId,
          file: {
            name: "fake.jpg",
            mimeType: "image/jpeg",
            buffer: Buffer.from("fake"),
          },
        },
      });
      expect(invalid.status()).toBe(400);
      const photo = await sharp({
        create: { width: 80, height: 60, channels: 3, background: "#5985a9" },
      })
        .jpeg()
        .toBuffer();
      const upload = await api.post("/api/team-photos", {
        headers: origin,
        multipart: {
          memberId,
          file: { name: "headshot.jpg", mimeType: "image/jpeg", buffer: photo },
        },
      });
      expect(upload.status(), await upload.text()).toBe(200);
      expect((await api.get(url)).headers()["content-type"]).toBe("image/webp");
      expect((await request.get(url)).status()).toBe(401);

      expect(
        (
          await admin.from("organizations").insert({
            id: secondOrg,
            name: "Second photo test company",
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await admin.from("remodel_memberships").insert({
            organization_id: secondOrg,
            profile_id: memberId,
            role: "owner",
            active: true,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await api.post("/api/organizations", {
            headers: origin,
            data: { organizationId: secondOrg },
          })
        ).status(),
      ).toBe(200);
      expect((await api.get(url)).status()).toBe(404);
      expect(
        (
          await api.post("/api/organizations", {
            headers: origin,
            data: { organizationId: company.organizationId },
          })
        ).status(),
      ).toBe(200);
      expect((await api.get(url)).status()).toBe(200);
      expect(
        (
          await api.delete("/api/team-photos", {
            headers: origin,
            data: { memberId },
          })
        ).status(),
      ).toBe(200);
      expect((await api.get(url)).status()).toBe(404);
    } finally {
      const { data } = await admin
        .from("remodel_memberships")
        .select("avatar_path")
        .eq("organization_id", company.organizationId)
        .eq("profile_id", memberId)
        .maybeSingle();
      if (data?.avatar_path)
        await admin.storage.from("remodel-files").remove([data.avatar_path]);
      await admin.from("organizations").delete().eq("id", secondOrg);
    }
  },
);
