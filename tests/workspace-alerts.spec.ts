import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localDateTime } from "../lib/activity";
import { test, expect, password } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };

test("administrators can post, rotate, target, and remove overview alerts", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings");
  const settings = page.getByRole("region", {
    name: "Overview alerts",
    exact: true,
  });
  await settings.getByLabel("Alert message").fill("Crew meeting at 7:30 AM.");
  await settings.getByLabel("Duration").fill("2");
  await settings.getByLabel("Time unit").selectOption("days");
  await settings.getByRole("button", { name: "Post alert" }).click();
  await expect(settings.getByRole("alert")).toHaveCount(0);
  await expect(settings.getByLabel("Alert message")).toHaveValue("");
  await expect(settings.getByLabel("Active overview alerts")).toContainText(
    "Crew meeting at 7:30 AM.",
  );
  await expect(settings.getByLabel("Active overview alerts")).toContainText(
    "Posted by",
  );
  await settings
    .getByRole("button", { name: "Edit alert: Crew meeting at 7:30 AM." })
    .click();
  const editDialog = page.getByRole("dialog", { name: "Update alert" });
  await editDialog
    .getByLabel("Alert message")
    .fill("Crew meeting moved to 8:00 AM.");
  await editDialog
    .getByLabel("Expires")
    .fill(localDateTime(new Date(Date.now() + 3 * 24 * 60 * 60_000)));
  await editDialog.screenshot({
    path: "artifacts/workspace-alert-edit-dialog.png",
  });
  await editDialog.getByRole("button", { name: "Save alert" }).click();
  await expect(editDialog).toBeHidden();
  await expect(settings.getByLabel("Active overview alerts")).toContainText(
    "Crew meeting moved to 8:00 AM.",
  );
  await expect(settings.getByLabel("Active overview alerts")).toContainText(
    "Updated by",
  );
  await settings
    .getByLabel("Alert message")
    .fill("Material delivery moved to Friday.");
  await settings.getByRole("button", { name: "Post alert" }).click();
  await expect(settings.getByRole("alert")).toHaveCount(0);
  await expect(settings.getByLabel("Alert message")).toHaveValue("");
  await settings.screenshot({
    path: "artifacts/workspace-alert-settings-light.png",
  });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  const banner = page.getByRole("region", { name: "Company alerts" });
  await expect(banner).toContainText("Material delivery moved to Friday.");
  await expect(banner).toContainText("1 / 2");
  expect(
    await banner
      .locator(".overview-alert-copy")
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("alert-cycle-in");
  await page.waitForTimeout(6700);
  await expect(banner).toContainText("Crew meeting moved to 8:00 AM.");
  await expect(banner).toContainText("2 / 2");
  await banner.getByRole("button", { name: "Next company alert" }).click();
  await expect(banner).toContainText("Material delivery moved to Friday.");
  await page.screenshot({
    path: "artifacts/workspace-alert-overview-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Color theme").selectOption("dark");
  await page.setViewportSize({ width: 390, height: 844 });
  const durationBoxes = await Promise.all([
    settings.locator(".alert-duration-label").boundingBox(),
    settings.getByLabel("Duration").boundingBox(),
    settings.getByLabel("Time unit").boundingBox(),
  ]);
  expect(durationBoxes.every(Boolean)).toBe(true);
  const durationCenters = durationBoxes.map((box) => box!.y + box!.height / 2);
  expect(
    Math.max(...durationCenters) - Math.min(...durationCenters),
  ).toBeLessThan(1);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(banner).toBeVisible();
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/workspace-alert-overview-mobile-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await settings
    .getByRole("button", {
      name: "Remove alert: Material delivery moved to Friday.",
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "Delete this alert?" });
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(settings.getByLabel("Active overview alerts")).not.toContainText(
    "Material delivery moved to Friday.",
  );
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(banner).toContainText("Crew meeting moved to 8:00 AM.");
  await expect(
    banner.getByRole("button", { name: "Next company alert" }),
  ).toHaveCount(0);
});

cloudTest(
  "alert audiences and administrator controls are enforced by the API and database",
  async ({ company, browser, page, request }) => {
    expect((await request.get("/api/workspace")).status()).toBe(401);
    expect((await request.get("/api/audit")).status()).toBe(401);
    const adminApi = page.request;
    expect(
      (
        await adminApi.post("/api/auth", {
          headers: origin,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const create = (
      message: string,
      audiences: string[],
      durationMinutes = 60,
    ) =>
      adminApi.post("/api/workspace", {
        headers: origin,
        data: {
          kind: "alert",
          data: {
            message,
            audiences,
            durationMinutes,
            authorId: "forged",
            authorName: "Forged",
            expiresAt: "2099-01-01T00:00:00.000Z",
          },
        },
      });
    const crewResponse = await create("Crew only notice", ["crew"]);
    expect(crewResponse.status()).toBe(201);
    let crewAlert = await crewResponse.json();
    expect(crewAlert.authorName).toBe("Workspace Owner");
    expect(Date.parse(crewAlert.expiresAt)).toBeLessThan(
      Date.now() + 61 * 60_000,
    );
    expect(Date.parse(crewAlert.createdAt)).toBeLessThanOrEqual(Date.now());
    const update = (expiresAt: string, message = "Updated crew notice") =>
      adminApi.patch("/api/workspace", {
        headers: origin,
        data: {
          kind: "alert",
          id: crewAlert.id,
          updatedAt: crewAlert.updatedAt,
          data: { ...crewAlert, message, expiresAt },
        },
      });
    expect(
      (await update(new Date(Date.now() - 60_000).toISOString())).status(),
    ).toBe(400);
    expect(
      (
        await update(
          new Date(Date.now() + 366 * 24 * 60 * 60_000).toISOString(),
        )
      ).status(),
    ).toBe(400);
    const revisedExpiration = new Date(Date.now() + 2 * 60 * 60_000);
    const revisedResponse = await update(revisedExpiration.toISOString());
    expect(revisedResponse.status()).toBe(200);
    crewAlert = await revisedResponse.json();
    expect(crewAlert).toMatchObject({
      message: "Updated crew notice",
      authorName: "Workspace Owner",
      lastEditedByName: "Workspace Owner",
    });
    expect(crewAlert.createdAt).toBeDefined();
    expect(
      Math.abs(Date.parse(crewAlert.expiresAt) - revisedExpiration.getTime()),
    ).toBeLessThan(1000);
    const adminAlert = await (
      await create("Administrators only notice", ["administrators"])
    ).json();
    expect((await create("Invalid audience", ["customers"])).status()).toBe(
      400,
    );
    expect((await create("No audience", [])).status()).toBe(400);
    expect((await create("Too long", ["crew"], 525_601)).status()).toBe(400);

    const createdHistory = await (await adminApi.get("/api/audit")).json();
    expect(createdHistory.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorName: "Workspace Owner",
          action: "created",
          entityKind: "alert",
          entityId: crewAlert.id,
          subject: "Crew only notice",
        }),
      ]),
    );
    expect(createdHistory.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorName: "Workspace Owner",
          action: "updated",
          entityKind: "alert",
          entityId: crewAlert.id,
          subject: "Updated crew notice",
          changedFields: expect.arrayContaining(["message", "expiresAt"]),
        }),
      ]),
    );

    const workerEmail = `alert-crew-${randomUUID()}@premiumremodel.test`;
    const worker = await company.admin.auth.admin.createUser({
      email: workerEmail,
      password,
      email_confirm: true,
    });
    expect(worker.error).toBeNull();
    const workerId = worker.data.user!.id;
    expect(
      (
        await company.admin.from("profiles").insert({
          organization_id: company.organizationId,
          auth_user_id: workerId,
          full_name: "Crew Alert Tester",
          email: workerEmail,
          role: "crew",
          active: true,
        })
      ).error,
    ).toBeNull();
    const workerContext = await browser.newContext();
    try {
      const workerApi = workerContext.request;
      expect(
        (
          await workerApi.post("/api/auth", {
            headers: origin,
            data: { action: "login", email: workerEmail, password },
          })
        ).status(),
      ).toBe(200);
      const workspace = await (await workerApi.get("/api/workspace")).json();
      expect(workspace.alerts.map((alert: { id: string }) => alert.id)).toEqual(
        [crewAlert.id],
      );
      const workerDb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      expect(
        (
          await workerDb.auth.signInWithPassword({
            email: workerEmail,
            password,
          })
        ).error,
      ).toBeNull();
      const directAlerts = await workerDb
        .from("remodel_records")
        .select("id")
        .eq("kind", "alert");
      expect(directAlerts.error).toBeNull();
      expect(directAlerts.data?.map((alert) => alert.id)).toEqual([
        crewAlert.id,
      ]);
      const directHistory = await workerDb
        .from("remodel_audit_events")
        .select("id");
      expect(directHistory.error).toBeNull();
      expect(directHistory.data).toEqual([]);
      // API writes remain administrator-only even when a worker knows a record ID.
      expect(
        (
          await workerApi.post("/api/workspace", {
            headers: origin,
            data: {
              kind: "alert",
              data: {
                message: "Unauthorized",
                audiences: ["crew"],
                durationMinutes: 60,
              },
            },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await workerApi.delete("/api/workspace", {
            headers: origin,
            data: { kind: "alert", id: crewAlert.id },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await workerApi.patch("/api/workspace", {
            headers: origin,
            data: {
              kind: "alert",
              id: crewAlert.id,
              updatedAt: crewAlert.updatedAt,
              data: {
                ...crewAlert,
                message: "Unauthorized edit",
                expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
              },
            },
          })
        ).status(),
      ).toBe(403);
      expect((await workerApi.get("/api/audit")).status()).toBe(403);
      await workerDb.auth.signOut();
    } finally {
      await workerContext.close();
    }
    for (const alert of [crewAlert, adminAlert])
      expect(
        (
          await adminApi.delete("/api/workspace", {
            headers: origin,
            data: { kind: "alert", id: alert.id },
          })
        ).status(),
      ).toBe(200);
    const retainedHistory = await (await adminApi.get("/api/audit")).json();
    expect(retainedHistory.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorName: "Workspace Owner",
          action: "deleted",
          entityKind: "alert",
          entityId: crewAlert.id,
          subject: "Updated crew notice",
        }),
      ]),
    );
  },
);
