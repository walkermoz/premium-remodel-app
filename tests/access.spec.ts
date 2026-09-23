import { test, expect, password } from "./supabase-fixture";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };
cloudTest(
  "company isolation and customer access hold at both API and database",
  async ({ company, request }) => {
    const foreignOrg = randomUUID();
    const foreignRecord = randomUUID();
    const customerEmail = `v2-qa-customer-${randomUUID()}@premiumremodel.test`;
    let customerId = "";
    const admin = company.admin;
    const clientOptions = {
      auth: { persistSession: false, autoRefreshToken: false },
    };
    const employee = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      clientOptions,
    );
    const customer = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      clientOptions,
    );
    const filePath = `${foreignOrg}/${foreignRecord}/private.txt`;
    try {
      expect(
        (
          await admin
            .from("organizations")
            .insert({ id: foreignOrg, name: "Temporary isolated company" })
        ).error,
      ).toBeNull();
      const now = new Date().toISOString();
      expect(
        (
          await admin.from("remodel_records").insert({
            id: foreignRecord,
            organization_id: foreignOrg,
            kind: "project",
            updated_at: now,
            data: {
              id: foreignRecord,
              name: "Other company private job",
              createdAt: now,
              updatedAt: now,
            },
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await admin.storage
            .from("remodel-files")
            .upload(filePath, Buffer.from("private company file"), {
              contentType: "text/plain",
            })
        ).error,
      ).toBeNull();
      expect(
        (
          await employee.auth.signInWithPassword({
            email: company.email,
            password,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await employee
            .from("remodel_records")
            .select("id")
            .eq("id", foreignRecord)
        ).data,
      ).toEqual([]);
      expect(
        (await employee.storage.from("remodel-files").download(filePath)).error,
      ).not.toBeNull();
      expect(
        (
          await request.post("/api/auth", {
            headers: origin,
            data: { action: "login", email: company.email, password },
          })
        ).status(),
      ).toBe(200);
      const response = await request.patch("/api/workspace", {
        headers: origin,
        data: {
          kind: "project",
          id: foreignRecord,
          updatedAt: now,
          data: {
            name: "Attempted edit",
            address: "",
            client: "",
            contractPrice: 0,
            startDate: "",
            endDate: "",
            status: "Planning",
            description: "",
            category: "",
            cover: "",
          },
        },
      });
      expect(response.status()).toBe(404);
      const created = await admin.auth.admin.createUser({
        email: customerEmail,
        password,
        email_confirm: true,
      });
      expect(created.error).toBeNull();
      customerId = created.data.user!.id;
      expect(
        (
          await admin.from("profiles").insert({
            organization_id: company.organizationId,
            auth_user_id: customerId,
            full_name: "Temporary customer",
            email: customerEmail,
            role: "customer",
            active: true,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await customer.auth.signInWithPassword({
            email: customerEmail,
            password,
          })
        ).error,
      ).toBeNull();
      expect((await customer.rpc("remodel_current_member")).data).toEqual([]);
      expect(
        (await customer.from("remodel_records").select("id")).data,
      ).toEqual([]);
      expect(
        (
          await request.post("/api/auth", {
            headers: origin,
            data: { action: "login", email: customerEmail, password },
          })
        ).status(),
      ).toBe(403);
      expect((await request.get("/api/workspace")).status()).toBe(401);
    } finally {
      await employee.auth.signOut({ scope: "local" });
      await customer.auth.signOut({ scope: "local" });
      await admin.storage.from("remodel-files").remove([filePath]);
      await admin
        .from("remodel_records")
        .delete()
        .eq("organization_id", foreignOrg);
      await admin.from("organizations").delete().eq("id", foreignOrg);
      if (customerId) {
        await admin.from("profiles").delete().eq("auth_user_id", customerId);
        await admin.auth.admin.deleteUser(customerId);
      }
    }
  },
);
