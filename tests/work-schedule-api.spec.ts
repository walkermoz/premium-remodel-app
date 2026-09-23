import { test, expect, password } from "./supabase-fixture";
import { demoWorkspace } from "../lib/demo";
const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const headers = { Origin: "http://localhost:3100" };

cloudTest(
  "scheduled work persists through the API and older clients cannot erase its times",
  async ({ request, company }) => {
    const sample = demoWorkspace();
    expect(
      (
        await request.post("/api/auth", {
          headers,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const projectResponse = await request.post("/api/workspace", {
      headers,
      data: { kind: "project", data: sample.projects[0] },
    });
    expect(projectResponse.status()).toBe(201);
    const project = await projectResponse.json();
    const taskData = {
      ...sample.tasks[0],
      projectId: project.id,
      contractorId: "",
      workType: "Inspection",
      dueDate: "2026-09-12",
      startTime: "09:00",
      endTime: "10:30",
    };
    const createdResponse = await request.post("/api/workspace", {
      headers,
      data: { kind: "task", data: taskData },
    });
    expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json();
    expect(created).toMatchObject({
      workType: "Inspection",
      startTime: "09:00",
      endTime: "10:30",
    });
    const read = await (await request.get("/api/workspace")).json();
    expect(read.tasks).toHaveLength(1);
    expect(read.tasks[0]).toMatchObject({ id: created.id, startTime: "09:00" });
    const bad = await request.patch("/api/workspace", {
      headers,
      data: {
        kind: "task",
        id: created.id,
        updatedAt: created.updatedAt,
        data: { ...created, endTime: "08:00" },
      },
    });
    expect(bad.status()).toBe(400);
    // A pre-update browser has no scheduling fields in its payload.
    const legacyData = {
      ...sample.tasks[0],
      projectId: project.id,
      contractorId: "",
      dueDate: "2026-09-13",
      title: "Updated inspection",
    };
    const updatedResponse = await request.patch("/api/workspace", {
      headers,
      data: {
        kind: "task",
        id: created.id,
        updatedAt: created.updatedAt,
        data: legacyData,
      },
    });
    expect(updatedResponse.status()).toBe(200);
    const updated = await updatedResponse.json();
    expect(updated).toMatchObject({
      workType: "Inspection",
      startTime: "09:00",
      endTime: "10:30",
      dueDate: "2026-09-13",
    });
    const clearedResponse = await request.patch("/api/workspace", {
      headers,
      data: {
        kind: "task",
        id: updated.id,
        updatedAt: updated.updatedAt,
        data: { ...updated, startTime: "", endTime: "" },
      },
    });
    expect(clearedResponse.status()).toBe(200);
    expect(await clearedResponse.json()).toMatchObject({
      startTime: "",
      endTime: "",
      workType: "Inspection",
    });
  },
);
