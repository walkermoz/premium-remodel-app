import { randomUUID } from "node:crypto";
import { test, expect, password } from "./supabase-fixture";
const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };
cloudTest(
  "activity is scoped, payment retries are deduplicated, and completion logging is atomic",
  async ({ company, page, request }) => {
    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers: origin,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const me = (await (await api.get("/api/auth")).json()).user;
    const projectData = {
      name: "Activity test job",
      address: "",
      client: "Scott",
      contractPrice: 10000,
      startDate: "",
      endDate: "",
      status: "Planning",
      description: "",
      category: "Kitchen",
      cover: "",
    };
    const create = async (
      kind: string,
      data: Record<string, unknown>,
      requestId?: string,
    ) =>
      api.post("/api/workspace", {
        headers: origin,
        data: { kind, data, requestId },
      });
    const project = await (await create("project", projectData)).json();
    const other = await (
      await create("project", { ...projectData, name: "Other job" })
    ).json();
    const receipt = await (
      await api.post("/api/files", {
        headers: origin,
        multipart: {
          projectId: project.id,
          file: {
            name: "receipt.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("Test receipt"),
          },
        },
      })
    ).json();
    const data = {
      projectId: project.id,
      activityType: "Payment received",
      actorId: me.id,
      occurredAt: new Date().toISOString(),
      summary: "Flooring check",
      notes: "",
      amount: 3000.15,
      party: "Scott",
      paymentMethod: "Check",
      attachmentIds: [receipt.id],
      actorName: "Forged",
      authorId: "Forged",
      authorName: "Forged",
      sourceTaskId: "Forged",
    };
    const id = randomUUID();
    const attempts = await Promise.all([
      create("activity", data, id),
      create("activity", data, id),
    ]);
    for (const response of attempts) expect(response.status()).toBe(201);
    const saved = await attempts[0].json();
    expect(saved.actorName).toBe(me.name);
    expect(saved.authorId).toBe(me.id);
    expect(saved).not.toHaveProperty("sourceTaskId");
    let workspace = await (await api.get("/api/workspace")).json();
    expect(workspace.activities).toHaveLength(1);
    for (const invalid of [
      { ...data, projectId: other.id },
      { ...data, actorId: randomUUID() },
      { ...data, amount: -10 },
      { ...data, activityType: "Work completed" },
    ])
      expect((await create("activity", invalid, randomUUID())).status()).toBe(
        400,
      );
    expect(
      (
        await request.post("/api/workspace", {
          headers: origin,
          data: { kind: "activity", data, requestId: randomUUID() },
        })
      ).status(),
    ).toBe(401);
    const task = await (
      await create("task", {
        projectId: project.id,
        title: "Deliver framing lumber",
        description: "",
        contractorId: "",
        dueDate: "",
        workType: "Delivery",
        startTime: "",
        endTime: "",
        priority: "Medium",
        status: "To do",
      })
    ).json();
    const update = (current: typeof task, status: string) =>
      api.patch("/api/workspace", {
        headers: origin,
        data: {
          kind: "task",
          id: current.id,
          updatedAt: current.updatedAt,
          data: {
            ...current,
            status,
            completion: {
              id: randomUUID(),
              at: "bad",
              byId: "fake",
              byName: "fake",
            },
          },
        },
      });
    const concurrent = await Promise.all([
      update(task, "Done"),
      update(task, "Done"),
    ]);
    expect(concurrent.map((response) => response.status()).sort()).toEqual([
      200, 409,
    ]);
    let done = await concurrent
      .find((response) => response.status() === 200)!
      .json();
    expect(done.relatedActivity.actorName).toBe(me.name);
    done = await (await update(done, "Done")).json();
    expect(done).not.toHaveProperty("relatedActivity");
    workspace = await (await api.get("/api/workspace")).json();
    expect(
      workspace.activities.filter(
        (entry: { sourceTaskId?: string }) => entry.sourceTaskId === task.id,
      ),
    ).toHaveLength(1);
    const reopened = await (await update(done, "To do")).json();
    await update(reopened, "Done");
    workspace = await (await api.get("/api/workspace")).json();
    expect(
      workspace.activities.filter(
        (entry: { sourceTaskId?: string }) => entry.sourceTaskId === task.id,
      ),
    ).toHaveLength(2);
    expect(
      (
        await api.delete("/api/workspace", {
          headers: origin,
          data: { kind: "task", id: task.id },
        })
      ).status(),
    ).toBe(200);
    await page.goto(`/?view=Projects&project=${project.id}&tab=Activity`);
    await expect(page.getByText("Flooring check")).toBeVisible();
    await expect(page.getByLabel("Logged project payments")).toContainText(
      "$3,000.15",
    );
    expect(
      (
        await api.delete("/api/workspace", {
          headers: origin,
          data: { kind: "activity", id },
        })
      ).status(),
    ).toBe(200);
    expect((await api.get(`/api/files?id=${receipt.id}`)).status()).toBe(200);
  },
);
