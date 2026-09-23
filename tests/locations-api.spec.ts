import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect, password } from "./supabase-fixture";
const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const headers = { Origin: "http://localhost:3100" };

cloudTest(
  "locations enforce consent sessions, administrator visibility, isolation, expiry and stop races",
  async ({ company, page, browser, request }) => {
    expect((await request.get("/api/locations")).status()).toBe(401);
    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const owner = (await (await api.get("/api/auth")).json()).user;
    const foreignOrg = randomUUID(),
      foreignProfile = randomUUID();
    let foreignAuth = "";
    try {
      expect(
        (
          await company.admin.from("organizations").insert({
            id: foreignOrg,
            name: "Temporary location isolation test",
          })
        ).error,
      ).toBeNull();
      const foreignEmail = `location-foreign-${randomUUID()}@premiumremodel.test`;
      const auth = await company.admin.auth.admin.createUser({
        email: foreignEmail,
        password,
        email_confirm: true,
      });
      expect(auth.error).toBeNull();
      foreignAuth = auth.data.user!.id;
      expect(
        (
          await company.admin.from("profiles").insert({
            id: foreignProfile,
            organization_id: foreignOrg,
            auth_user_id: foreignAuth,
            full_name: "Other company",
            email: foreignEmail,
            role: "owner",
            active: true,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await company.admin.from("remodel_locations").insert({
            profile_id: foreignProfile,
            organization_id: foreignOrg,
            session_id: randomUUID(),
            sharing: true,
            latitude: 45,
            longitude: -80,
            accuracy: 10,
            captured_at: new Date().toISOString(),
          })
        ).error,
      ).toBeNull();
      const foreignRead = await (await api.get("/api/locations")).json();
      expect(
        foreignRead.members.map((member: { id: string }) => member.id),
      ).not.toContain(foreignProfile);
      const ownerDirect = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      expect(
        (
          await ownerDirect.auth.signInWithPassword({
            email: company.email,
            password,
          })
        ).error,
      ).toBeNull();
      const invisible = await ownerDirect
        .from("remodel_locations")
        .select("profile_id")
        .eq("profile_id", foreignProfile);
      expect(invisible.error).toBeNull();
      expect(invisible.data).toEqual([]);
      await ownerDirect.auth.signOut({ scope: "local" });
    } finally {
      await company.admin
        .from("profiles")
        .delete()
        .eq("organization_id", foreignOrg);
      if (foreignAuth) await company.admin.auth.admin.deleteUser(foreignAuth);
      await company.admin.from("organizations").delete().eq("id", foreignOrg);
    }
    const memberUser = await company.admin.auth.admin.createUser({
      email: company.memberEmail,
      password,
      email_confirm: true,
    });
    expect(memberUser.error).toBeNull();
    const memberProfile = await company.admin
      .from("profiles")
      .insert({
        organization_id: company.organizationId,
        auth_user_id: memberUser.data.user!.id,
        full_name: "Location Test Member",
        email: company.memberEmail,
        role: "crew",
        active: true,
      })
      .select("id")
      .single();
    expect(memberProfile.error).toBeNull();
    const memberContext = await browser.newContext();
    try {
      const member = memberContext.request;
      expect(
        (
          await member.post("http://localhost:3100/api/auth", {
            headers,
            data: { action: "login", email: company.memberEmail, password },
          })
        ).status(),
      ).toBe(200);
      const id = randomUUID(),
        memberId = randomUUID();
      const point = {
        action: "update",
        sessionId: id,
        latitude: 35.77,
        longitude: -78.63,
        accuracy: 20,
        capturedAt: new Date().toISOString(),
      };
      const post = (data: object) =>
        api.post("/api/locations", { headers, data });
      expect((await post(point)).status()).toBe(409);
      expect(
        (
          await api.post("/api/locations", {
            headers: { Origin: "https://untrusted.example" },
            data: { action: "start", sessionId: id },
          })
        ).status(),
      ).toBe(403);
      expect((await post({ action: "start", sessionId: id })).status()).toBe(
        200,
      );
      expect(
        (
          await post({
            ...point,
            profileId: memberProfile.data!.id,
            organizationId: randomUUID(),
          })
        ).status(),
      ).toBe(200);
      for (const invalid of [
        { latitude: 91 },
        { longitude: -181 },
        { accuracy: -1 },
        { capturedAt: new Date(Date.now() + 120000).toISOString() },
        { capturedAt: new Date(Date.now() - 3600000).toISOString() },
      ])
        expect((await post({ ...point, ...invalid })).status()).toBe(400);
      expect(
        (
          await member.post("http://localhost:3100/api/locations", {
            headers,
            data: { action: "start", sessionId: memberId },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await member.post("http://localhost:3100/api/locations", {
            headers,
            data: { ...point, sessionId: memberId, latitude: 35.8 },
          })
        ).status(),
      ).toBe(200);
      const ownOnly = await (
        await member.get("http://localhost:3100/api/locations")
      ).json();
      expect(ownOnly.members).toHaveLength(1);
      expect(ownOnly.members[0].id).toBe(memberProfile.data!.id);
      const all = await (await api.get("/api/locations")).json();
      expect(
        all.members.filter((item: { location: unknown }) => item.location),
      ).toHaveLength(2);
      const direct = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      expect(
        (
          await direct.auth.signInWithPassword({
            email: company.memberEmail,
            password,
          })
        ).error,
      ).toBeNull();
      const hidden = await direct
        .from("remodel_locations")
        .select("profile_id")
        .eq("profile_id", owner.id);
      expect(hidden.error).toBeNull();
      expect(hidden.data).toEqual([]);
      expect(
        (
          await direct
            .from("remodel_locations")
            .update({ latitude: 1 })
            .eq("profile_id", memberProfile.data!.id)
        ).error,
      ).not.toBeNull();
      expect(
        (
          await direct.rpc("remodel_update_location", {
            p_profile: owner.id,
            p_org: company.organizationId,
            p_session: id,
            p_lat: 1,
            p_lng: 1,
            p_accuracy: 1,
            p_captured: point.capturedAt,
          })
        ).error,
      ).not.toBeNull();
      // Older fixes cannot overwrite a newer reading, even when requests finish out of order.
      const newer = {
        ...point,
        latitude: 36,
        capturedAt: new Date(Date.now() + 1000).toISOString(),
      };
      expect((await post(newer)).status()).toBe(200);
      expect((await post(point)).status()).toBe(200);
      expect(
        (await (await api.get("/api/locations")).json()).members.find(
          (item: { id: string }) => item.id === owner.id,
        ).location.latitude,
      ).toBe(36);
      await Promise.all([
        post({
          ...newer,
          capturedAt: new Date(Date.now() + 2000).toISOString(),
        }),
        post({ action: "stop", sessionId: id }),
      ]);
      expect(
        (
          await post({ ...point, capturedAt: new Date().toISOString() })
        ).status(),
      ).toBe(409);
      expect(
        (await (await api.get("/api/locations")).json()).members.find(
          (item: { id: string }) => item.id === owner.id,
        ).location,
      ).toBeNull();
      const secondSession = randomUUID();
      expect(
        (await post({ action: "start", sessionId: secondSession })).status(),
      ).toBe(200);
      expect(
        (
          await post({
            ...point,
            sessionId: secondSession,
            capturedAt: new Date().toISOString(),
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await post({ action: "clear", profileId: memberProfile.data!.id })
        ).status(),
      ).toBe(200);
      expect(
        (
          await post({
            ...point,
            sessionId: secondSession,
            capturedAt: new Date().toISOString(),
          })
        ).status(),
      ).toBe(409);
      expect(
        (await (await api.get("/api/locations")).json()).members.find(
          (item: { id: string }) => item.id === memberProfile.data!.id,
        ).location,
      ).not.toBeNull();
      // Expired coordinates are hidden and cleared; revoking membership removes a marker.
      expect(
        (
          await company.admin
            .from("remodel_locations")
            .update({
              captured_at: new Date(Date.now() - 3600001).toISOString(),
            })
            .eq("profile_id", memberProfile.data!.id)
        ).error,
      ).toBeNull();
      expect(
        (await (await api.get("/api/locations")).json()).members.every(
          (item: { location: unknown }) => !item.location,
        ),
      ).toBe(true);
      expect(
        (
          await company.admin
            .from("remodel_locations")
            .select("latitude")
            .eq("profile_id", memberProfile.data!.id)
            .single()
        ).data?.latitude,
      ).toBeNull();
      expect(
        (
          await member.post("http://localhost:3100/api/locations", {
            headers,
            data: {
              ...point,
              sessionId: memberId,
              capturedAt: new Date().toISOString(),
            },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await company.admin
            .from("profiles")
            .update({ active: false })
            .eq("id", memberProfile.data!.id)
            .eq("organization_id", company.organizationId)
        ).error,
      ).toBeNull();
      expect(
        (await (await api.get("/api/locations")).json()).members.map(
          (item: { id: string }) => item.id,
        ),
      ).not.toContain(memberProfile.data!.id);
      expect(
        (
          await member.post("http://localhost:3100/api/locations", {
            headers,
            data: {
              ...point,
              sessionId: memberId,
              capturedAt: new Date().toISOString(),
            },
          })
        ).status(),
      ).toBe(401);
      await direct.auth.signOut({ scope: "local" });
    } finally {
      await memberContext.close();
    }
  },
);

cloudTest(
  "phone location starts only on request, persists through navigation, and retries an offline stop",
  async ({ company, page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: 35.78,
      longitude: -78.64,
      accuracy: 12,
    });
    await page.request.post("/api/auth", {
      headers,
      data: { action: "login", email: company.email, password },
    });
    await page.goto("/?view=Team+map");
    await expect(
      page.getByRole("button", { name: "Share my location", exact: true }),
    ).toBeVisible();
    expect(
      (
        await company.admin
          .from("remodel_locations")
          .select("profile_id")
          .eq("organization_id", company.organizationId)
      ).data,
    ).toHaveLength(0);
    await page
      .getByRole("button", { name: "Share my location", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your location sharing is on" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Your location sharing" }),
    ).toContainText("Updated just now");
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Location sharing is on. Open sharing controls",
      })
      .click();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Stop sharing", exact: true }),
    ).toBeVisible();
    let offlineStop = true;
    await page.route("**/api/locations", async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().postDataJSON().action === "stop" &&
        offlineStop
      )
        return route.abort();
      return route.continue();
    });
    await page
      .getByRole("button", { name: "Stop sharing", exact: true })
      .click();
    await expect(page.locator('.alert[role="alert"]')).toContainText(
      "Sharing has stopped on this phone",
    );
    await expect(
      page.getByRole("button", { name: "Share my location", exact: true }),
    ).toBeDisabled();
    offlineStop = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(
      page.getByRole("button", { name: "Share my location", exact: true }),
    ).toBeEnabled();
    expect(
      (await (await page.request.get("/api/locations")).json()).members[0]
        .location,
    ).toBeNull();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Share my location", exact: true }),
    ).toBeVisible();
    // Permission denial must not create a sharing session.
    await page.evaluate(() => {
      navigator.geolocation.getCurrentPosition = (_success, failure) =>
        failure?.({
          code: 1,
          message: "Denied",
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
    });
    await page
      .getByRole("button", { name: "Share my location", exact: true })
      .click();
    await expect(page.locator('.alert[role="alert"]')).toContainText(
      "permission was denied",
    );
    expect(
      (
        await company.admin
          .from("remodel_locations")
          .select("sharing")
          .eq("organization_id", company.organizationId)
          .single()
      ).data?.sharing,
    ).toBe(false);
  },
);
