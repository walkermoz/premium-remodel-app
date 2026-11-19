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
    expect(finished.status()).toBe(409);
    expect(await finished.text()).toContain("Closeout");
    // Completion is covered by the job-operations RPC integration test.
  },
);
