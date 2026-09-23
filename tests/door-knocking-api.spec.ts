import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect, password } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;

function visit(address: string, createLead = true) {
  return {
    address,
    latitude: 35.7796,
    longitude: -78.6382,
    visitedAt: new Date().toISOString(),
    outcome: createLead ? "Lead captured" : "Not home",
    notes: "Integration test visit",
    createLead,
    firstName: createLead ? "Jordan" : "",
    lastName: createLead ? "Sample" : "",
    email: "",
    phone: createLead ? "9195550188" : "",
    zip: "27601",
    project: createLead ? "Deck" : "",
    projectDescription: createLead ? "Replace the rear deck and railing." : "",
    scheduleQuote: createLead,
    quoteDate: createLead ? "2026-10-05" : "",
    quoteStartTime: createLead ? "14:30" : "",
    quoteEndTime: createLead ? "15:30" : "",
    quoteNotes: createLead ? "Meet at the side gate." : "",
  };
}

cloudTest(
  "door visits save atomically and door knockers only receive their own leads",
  async ({ company, page, browser }) => {
    const ownerApi = page.request;
    expect(
      (
        await ownerApi.post("/api/auth", {
          headers: { Origin: "http://localhost:3100" },
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/?view=Leads");
    await expect(page.getByRole("heading", { name: "Leads." })).toBeVisible();
    await page.getByRole("button", { name: "Door knocking" }).click();
    await expect(page).toHaveURL(/\?view=Door\+knocking$/);
    await expect(
      page.getByRole("heading", { name: "Door knocking." }),
    ).toBeVisible();
    const ownerVisit = await ownerApi.post("/api/door-knocking", {
      headers: { Origin: "http://localhost:3100" },
      data: visit("101 Owner Test Lane, Raleigh, NC 27601"),
    });
    expect(ownerVisit.status()).toBe(201);
    const ownerCreated = await ownerVisit.json();
    expect(ownerCreated.visit.leadId).toBe(ownerCreated.lead.id);
    expect(ownerCreated.contact.id).toBe(ownerCreated.lead.contactId);
    expect(ownerCreated.lead.quoteStartTime).toBe("14:30");

    const suffix = randomUUID();
    const email = `door-${suffix}@premiumremodel.test`;
    const invitation = await ownerApi.put("/api/auth", {
      headers: { Origin: "http://localhost:3100" },
      data: { email, method: "link", group: "doorknocker" },
    });
    expect(invitation.status()).toBe(200);
    const profile = await company.admin
      .from("profiles")
      .select("id,auth_user_id,role")
      .eq("organization_id", company.organizationId)
      .eq("email", email)
      .single();
    expect(profile.error).toBeNull();
    expect(profile.data!.role).toBe("doorknocker");
    const prepared = await company.admin.auth.admin.updateUserById(
      profile.data!.auth_user_id,
      {
        password,
        email_confirm: true,
        user_metadata: { full_name: "Door Knocker Test" },
      },
    );
    expect(prepared.error).toBeNull();
    const renamed = await company.admin
      .from("profiles")
      .update({ full_name: "Door Knocker Test" })
      .eq("id", profile.data!.id);
    expect(renamed.error).toBeNull();

    const context = await browser.newContext({
      baseURL: "http://localhost:3100",
    });
    try {
      const api = context.request;
      expect(
        (
          await api.post("/api/auth", {
            headers: { Origin: "http://localhost:3100" },
            data: { action: "login", email, password },
          })
        ).status(),
      ).toBe(200);
      const before = await (await api.get("/api/workspace")).json();
      expect(before.doorVisits).toHaveLength(1);
      expect(before.leads).toHaveLength(0);
      expect(before.contacts).toHaveLength(0);
      expect(before.projects).toHaveLength(0);

      const ownVisit = await api.post("/api/door-knocking", {
        headers: { Origin: "http://localhost:3100" },
        data: visit("103 Door Test Lane, Raleigh, NC 27601"),
      });
      expect(ownVisit.status()).toBe(201);
      const after = await (await api.get("/api/workspace")).json();
      expect(after.doorVisits).toHaveLength(2);
      expect(after.leads).toHaveLength(1);
      expect(after.contacts).toHaveLength(1);
      expect(after.leads[0].canvasserName).toBe("Door Knocker Test");

      const forbidden = await api.post("/api/workspace", {
        headers: { Origin: "http://localhost:3100" },
        data: { kind: "contractor", data: {} },
      });
      expect(forbidden.status()).toBe(403);

      const mobile = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const signedIn = await mobile.auth.signInWithPassword({
        email,
        password,
      });
      expect(signedIn.error).toBeNull();
      const authorization = `Bearer ${signedIn.data.session!.access_token}`;

      const mobileVisit = await api.post("/api/door-knocking", {
        headers: { Authorization: authorization },
        data: visit("105 Mobile Test Lane, Raleigh, NC 27601", false),
      });
      expect(mobileVisit.status()).toBe(201);
      expect((await mobileVisit.json()).visit.outcome).toBe("Not home");

      const sessionId = randomUUID();
      expect(
        (
          await api.post("/api/locations", {
            headers: { Authorization: authorization },
            data: { action: "start", sessionId },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await api.post("/api/locations", {
            headers: { Authorization: authorization },
            data: {
              action: "update",
              sessionId,
              latitude: 35.7796,
              longitude: -78.6382,
              accuracy: 20,
              capturedAt: new Date().toISOString(),
            },
          })
        ).status(),
      ).toBe(200);
      const visibleLocation = await api.get("/api/locations", {
        headers: { Authorization: authorization },
      });
      expect(visibleLocation.status()).toBe(200);
      expect((await visibleLocation.json()).members[0].location.latitude).toBe(
        35.7796,
      );
      expect(
        (
          await api.post("/api/locations", {
            headers: { Authorization: authorization },
            data: { action: "stop", sessionId },
          })
        ).status(),
      ).toBe(200);
      await mobile.auth.signOut();
    } finally {
      await context.close();
    }
  },
);
