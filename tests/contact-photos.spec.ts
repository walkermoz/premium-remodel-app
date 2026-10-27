import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { test, expect, password } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };

cloudTest(
  "contact photos survive edits and stay in their organization",
  async ({ company, page, request }) => {
    const api = page.request;
    const secondOrg = randomUUID();
    let contactId = "";
    try {
      expect(
        (
          await api.post("/api/auth", {
            headers: origin,
            data: { action: "login", email: company.email, password },
          })
        ).status(),
      ).toBe(200);
      const created = await api.post("/api/workspace", {
        headers: origin,
        data: {
          kind: "contractor",
          data: {
            name: "Taylor Plumbing",
            company: "Taylor Services",
            trade: "Plumbing",
            email: "taylor@example.com",
            phone: "",
            notes: "",
          },
        },
      });
      expect(created.status(), await created.text()).toBe(201);
      const contact = await created.json();
      contactId = contact.id;
      const url = `/api/contact-photos?contactId=${contactId}`;

      const invalid = await api.post("/api/contact-photos", {
        headers: origin,
        multipart: {
          contactId,
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
      const upload = await api.post("/api/contact-photos", {
        headers: origin,
        multipart: {
          contactId,
          file: { name: "headshot.jpg", mimeType: "image/jpeg", buffer: photo },
        },
      });
      expect(upload.status(), await upload.text()).toBe(200);
      const uploaded = (await upload.json()).contact;
      expect(uploaded.photoPath).toContain(
        `${company.organizationId}/contact-photos/${contactId}/`,
      );
      expect((await api.get(url)).headers()["content-type"]).toBe("image/webp");
      expect((await request.get(url)).status()).toBe(401);

      const edit = await api.patch("/api/workspace", {
        headers: origin,
        data: {
          kind: "contractor",
          id: contactId,
          updatedAt: uploaded.updatedAt,
          data: {
            name: "Taylor Plumbing",
            company: "Taylor Services LLC",
            trade: "Plumbing",
            email: "taylor@example.com",
            phone: "",
            notes: "Available weekdays",
          },
        },
      });
      expect(edit.status(), await edit.text()).toBe(200);
      expect((await edit.json()).photoPath).toBe(uploaded.photoPath);
      expect((await api.get(url)).status()).toBe(200);

      expect(
        (
          await company.admin.from("organizations").insert({
            id: secondOrg,
            name: "Other photo test company",
          })
        ).error,
      ).toBeNull();
      const { data: profile, error } = await company.admin
        .from("profiles")
        .select("id")
        .eq("organization_id", company.organizationId)
        .eq("email", company.email)
        .single();
      expect(error).toBeNull();
      expect(
        (
          await company.admin.from("remodel_memberships").insert({
            organization_id: secondOrg,
            profile_id: profile!.id,
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
          await api.post("/api/contact-photos", {
            headers: origin,
            multipart: {
              contactId,
              file: {
                name: "other-company.jpg",
                mimeType: "image/jpeg",
                buffer: photo,
              },
            },
          })
        ).status(),
      ).toBe(404);
      expect(
        (
          await api.delete("/api/contact-photos", {
            headers: origin,
            data: { contactId },
          })
        ).status(),
      ).toBe(404);

      expect(
        (
          await api.post("/api/organizations", {
            headers: origin,
            data: { organizationId: company.organizationId },
          })
        ).status(),
      ).toBe(200);
      await page.goto("/?view=Contractors");
      await page
        .getByRole("button", { name: "Edit Taylor Plumbing", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Edit contact" });
      await dialog.getByRole("button", { name: "Remove photo" }).click();
      await expect(
        dialog.getByRole("button", { name: "Add photo" }),
      ).toBeVisible();
      await dialog.locator('input[type="file"]').setInputFiles({
        name: "replacement.jpg",
        mimeType: "image/jpeg",
        buffer: photo,
      });
      await expect(
        dialog.getByRole("button", { name: "Change photo" }),
      ).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      const row = page.locator("article").filter({
        has: page.getByRole("heading", { name: "Taylor Plumbing" }),
      });
      await expect(row.locator(".avatar img")).toBeVisible();
      const remove = await api.delete("/api/contact-photos", {
        headers: origin,
        data: { contactId },
      });
      expect(remove.status(), await remove.text()).toBe(200);
      expect((await remove.json()).contact.photoPath).toBeUndefined();
      expect((await api.get(url)).status()).toBe(404);
    } finally {
      if (contactId) {
        const { data } = await company.admin
          .from("remodel_records")
          .select("data")
          .eq("organization_id", company.organizationId)
          .eq("id", contactId)
          .maybeSingle();
        if (data?.data?.photoPath)
          await company.admin.storage
            .from("remodel-files")
            .remove([data.data.photoPath]);
      }
      await company.admin.from("organizations").delete().eq("id", secondOrg);
    }
  },
);
