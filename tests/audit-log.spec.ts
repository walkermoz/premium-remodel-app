import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { demoWorkspace } from "../lib/demo";
import { test, expect, password } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const headers = { Origin: "http://localhost:3100" };

cloudTest(
  "workspace history records durable create, update, and delete events for administrators",
  async ({ company, browser, page }) => {
    const adminApi = page.request;
    expect(
      (
        await adminApi.post("/api/auth", {
          headers,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);

    const sample = demoWorkspace();
    const projectResponse = await adminApi.post("/api/workspace", {
      headers,
      data: { kind: "project", data: sample.projects[0] },
    });
    expect(projectResponse.status()).toBe(201);
    const project = await projectResponse.json();

    const taskResponse = await adminApi.post("/api/workspace", {
      headers,
      data: {
        kind: "task",
        data: {
          ...sample.tasks[0],
          projectId: project.id,
          contractorId: "",
          title: "Audit trail task",
        },
      },
    });
    expect(taskResponse.status()).toBe(201);
    const task = await taskResponse.json();

    const updatedResponse = await adminApi.patch("/api/workspace", {
      headers,
      data: {
        kind: "task",
        id: task.id,
        updatedAt: task.updatedAt,
        data: { ...task, title: "Updated audit trail task" },
      },
    });
    expect(updatedResponse.status()).toBe(200);
    const updated = await updatedResponse.json();
    expect(
      (
        await adminApi.delete("/api/workspace", {
          headers,
          data: { kind: "task", id: updated.id },
        })
      ).status(),
    ).toBe(200);

    const response = await adminApi.get("/api/audit");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    const history = await response.json();
    const taskHistory = history.entries.filter(
      (entry: { entityId: string }) => entry.entityId === task.id,
    );
    expect(
      taskHistory.map((entry: { action: string }) => entry.action),
    ).toEqual(["deleted", "updated", "created"]);
    expect(taskHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorName: "Workspace Owner",
          entityKind: "task",
          subject: "Updated audit trail task",
        }),
      ]),
    );
    expect(
      taskHistory.find(
        (entry: { action: string }) => entry.action === "updated",
      ).changedFields,
    ).toContain("title");
    expect(
      taskHistory.every((entry: { occurredAt: string }) =>
        Number.isFinite(Date.parse(entry.occurredAt)),
      ),
    ).toBe(true);

    const stored = await company.admin
      .from("remodel_audit_events")
      .select("action,before_data,after_data,actor_name")
      .eq("organization_id", company.organizationId)
      .eq("entity_id", task.id)
      .order("occurred_at");
    expect(stored.error).toBeNull();
    expect(stored.data?.map((entry) => entry.action)).toEqual([
      "created",
      "updated",
      "deleted",
    ]);
    expect(stored.data?.[1].before_data.title).toBe("Audit trail task");
    expect(stored.data?.[1].after_data.title).toBe("Updated audit trail task");
    expect(stored.data?.[2].after_data).toBeNull();

    await page.goto("/?view=Settings");
    const historySection = page.getByRole("region", {
      name: "Workspace history",
    });
    const expandHistory = historySection.getByRole("button", {
      name: /Show more|Show older changes/,
    });
    if (await expandHistory.count()) {
      await expandHistory.first().click();
    }
    await expect(historySection).toContainText("Workspace Owner");
    await expect(historySection).toContainText("Updated audit trail task");
    await expect(historySection).toContainText("deleted work item");
    await historySection.screenshot({
      path: "artifacts/workspace-history-desktop.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(historySection).toContainText("Workspace Owner");
    await historySection.scrollIntoViewIfNeeded();
    const historyBox = await historySection.boundingBox();
    expect(historyBox).not.toBeNull();
    expect(historyBox!.x).toBeGreaterThanOrEqual(0);
    expect(historyBox!.x + historyBox!.width).toBeLessThanOrEqual(390);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "artifacts/workspace-history-mobile.png",
    });

    const workerEmail = `audit-worker-${randomUUID()}@premiumremodel.test`;
    const worker = await company.admin.auth.admin.createUser({
      email: workerEmail,
      password,
      email_confirm: true,
    });
    expect(worker.error).toBeNull();
    expect(
      (
        await company.admin.from("profiles").insert({
          organization_id: company.organizationId,
          auth_user_id: worker.data.user!.id,
          full_name: "Audit Worker",
          email: workerEmail,
          role: "crew",
          active: true,
        })
      ).error,
    ).toBeNull();

    const workerContext = await browser.newContext();
    try {
      expect(
        (
          await workerContext.request.post("/api/auth", {
            headers,
            data: { action: "login", email: workerEmail, password },
          })
        ).status(),
      ).toBe(200);
      expect((await workerContext.request.get("/api/audit")).status()).toBe(
        403,
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
      const direct = await workerDb.from("remodel_audit_events").select("id");
      expect(direct.error).toBeNull();
      expect(direct.data).toEqual([]);
    } finally {
      await workerContext.close();
    }
  },
);
