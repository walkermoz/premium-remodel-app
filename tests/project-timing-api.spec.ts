import { test, expect, password } from "./supabase-fixture";
import { demoWorkspace } from "../lib/demo";
import { workToday } from "../lib/work";
const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const headers = { Origin: "http://localhost:3100" };

cloudTest(
  "project lifecycle dates persist and survive edits from older clients",
  async ({ request, company }) => {
    expect(
      (
        await request.post("/api/auth", {
          headers,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const created = await request.post("/api/workspace", {
      headers,
      data: {
        kind: "project",
        data: {
          ...demoWorkspace().projects[0],
          status: "Planning",
          startDate: "",
          endDate: "",
        },
      },
    });
    expect(created.status()).toBe(201);
    let project = await created.json();
    const patch = (data: Record<string, unknown>) =>
      request.patch("/api/workspace", {
        headers,
        data: {
          kind: "project",
          id: project.id,
          updatedAt: project.updatedAt,
          data,
        },
      });
    const started = await patch({ ...project, status: "In progress" });
    expect(started.status()).toBe(200);
    project = await started.json();
    expect(project.startDate).toBe(workToday());
    const finished = await patch({ ...project, status: "Completed" });
    expect(finished.status()).toBe(200);
    project = await finished.json();
    expect(project.completedDate).toBe(workToday());
    expect(project.endDate).toBe("");
    const bad = await patch({ ...project, completedDate: "2024-01-01" });
    expect(bad.status()).toBe(400);
    const legacy = { ...project, name: "Edited by an older browser" };
    delete legacy.completedDate;
    const edited = await patch(legacy);
    expect(edited.status()).toBe(200);
    project = await edited.json();
    expect(project.completedDate).toBe(workToday());
    const read = await (await request.get("/api/workspace")).json();
    expect(read.projects[0]).toMatchObject({
      id: project.id,
      completedDate: workToday(),
      startDate: workToday(),
    });
    const reopened = await patch({ ...project, status: "In progress" });
    expect(reopened.status()).toBe(200);
    expect(await reopened.json()).toMatchObject({
      completedDate: "",
      startDate: workToday(),
    });
  },
);
