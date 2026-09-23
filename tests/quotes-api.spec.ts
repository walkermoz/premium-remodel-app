import { randomUUID } from "node:crypto";
import { test, expect, password } from "./supabase-fixture";
const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const headers = { Origin: "http://localhost:3100" };

cloudTest(
  "quote acceptance is scoped, atomic and retry safe, retaining scope, files and historical prices",
  async ({ company, page, request }) => {
    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const quoteData = {
      name: "Garage lead",
      client: "Jason",
      clientEmail: "jason@example.com",
      clientPhone: "9195550100",
      address: "100 Test Lane",
      startDate: "",
      endDate: "",
      status: "Draft",
      description: "Garage scope",
      category: "Other",
      cover: "",
    };
    const created = await api.post("/api/workspace", {
      headers,
      data: {
        kind: "quote",
        data: { ...quoteData, contractPrice: 9999, quoteAcceptedAt: "forged" },
      },
    });
    expect(created.status()).toBe(201);
    const quote = await created.json();
    const foreignOrg = randomUUID(),
      foreignQuote = randomUUID();
    try {
      expect(
        (
          await company.admin
            .from("organizations")
            .insert({ id: foreignOrg, name: "Temporary quote isolation test" })
        ).error,
      ).toBeNull();
      expect(
        (
          await company.admin.from("remodel_records").insert({
            id: foreignQuote,
            organization_id: foreignOrg,
            kind: "quote",
            data: { ...quote, id: foreignQuote },
            updated_at: quote.updatedAt,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await api.post("/api/quotes/accept", {
            headers,
            data: { id: foreignQuote, updatedAt: quote.updatedAt },
          })
        ).status(),
      ).toBe(404);
      expect(
        (
          await api.patch("/api/workspace", {
            headers,
            data: {
              kind: "quote",
              id: foreignQuote,
              updatedAt: quote.updatedAt,
              data: quote,
            },
          })
        ).status(),
      ).toBe(404);
      expect(
        (await (await api.get("/api/workspace")).json()).quotes.map(
          (item: { id: string }) => item.id,
        ),
      ).not.toContain(foreignQuote);
    } finally {
      await company.admin
        .from("remodel_records")
        .delete()
        .eq("organization_id", foreignOrg);
      await company.admin.from("organizations").delete().eq("id", foreignOrg);
    }
    expect(quote).not.toHaveProperty("contractPrice");
    expect(quote).not.toHaveProperty("quoteAcceptedAt");
    const scopeData = {
      projectId: quote.id,
      title: "Framing",
      quantity: 1,
      unit: "job",
      estimate: 5000.15,
      subCost: 2000,
      materialCost: 1234.56,
      contractorId: "",
      status: "To do",
    };
    const scope = await (
      await api.post("/api/workspace", {
        headers,
        data: { kind: "scope", data: scopeData },
      })
    ).json();
    expect(scope.id).toBeTruthy();
    expect(scope.materialCost).toBe(1234.56);
    for (const invalid of [-1, null, 1_000_000_001, "not a number"]) {
      const rejected = await api.post("/api/workspace", {
        headers,
        data: { kind: "scope", data: { ...scopeData, materialCost: invalid } },
      });
      expect(rejected.status()).toBe(400);
    }
    const legacyData: Record<string, unknown> = {
      ...scopeData,
      title: "Framing updated",
    };
    delete legacyData.materialCost;
    const legacyEdit = await api.patch("/api/workspace", {
      headers,
      data: {
        kind: "scope",
        id: scope.id,
        updatedAt: scope.updatedAt,
        data: legacyData,
      },
    });
    expect(legacyEdit.status()).toBe(200);
    const editedScope = await legacyEdit.json();
    expect(editedScope.materialCost).toBe(1234.56);
    const fileResponse = await api.post("/api/files", {
      headers,
      multipart: {
        projectId: quote.id,
        file: {
          name: "quote.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Sent quote test"),
        },
      },
    });
    expect(fileResponse.status()).toBe(201);
    const file = await fileResponse.json();
    expect(
      (
        await api.post("/api/workspace", {
          headers,
          data: {
            kind: "task",
            data: {
              projectId: quote.id,
              title: "Premature task",
              description: "",
              contractorId: "",
              dueDate: "",
              priority: "Medium",
              status: "To do",
            },
          },
        })
      ).status(),
    ).toBe(404);
    const sent = await (
      await api.patch("/api/workspace", {
        headers,
        data: {
          kind: "quote",
          id: quote.id,
          updatedAt: quote.updatedAt,
          data: { ...quote, status: "Sent", quoteSentAt: "forged" },
        },
      })
    ).json();
    expect(sent.quoteSentAt).toMatch(/^\d{4}-/);
    const acceptBody = { id: quote.id, updatedAt: sent.updatedAt };
    expect(
      (
        await request.post("/api/quotes/accept", { headers, data: acceptBody })
      ).status(),
    ).toBe(401);
    expect(
      (
        await api.post("/api/quotes/accept", {
          headers: { Origin: "https://untrusted.example" },
          data: acceptBody,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await api.post("/api/quotes/accept", {
          headers,
          data: { ...acceptBody, updatedAt: quote.updatedAt },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await api.post("/api/quotes/accept", {
          headers,
          data: { ...acceptBody, id: randomUUID() },
        })
      ).status(),
    ).toBe(404);
    const attempts = await Promise.all([
      api.post("/api/quotes/accept", { headers, data: acceptBody }),
      api.post("/api/quotes/accept", { headers, data: acceptBody }),
    ]);
    expect(attempts.some((response) => response.status() === 200)).toBe(true);
    expect(
      attempts.every((response) => [200, 409].includes(response.status())),
    ).toBe(true);
    const retry = await api.post("/api/quotes/accept", {
      headers,
      data: acceptBody,
    });
    expect(retry.status()).toBe(200);
    const project = await retry.json();
    expect(project).toMatchObject({
      id: quote.id,
      status: "Planning",
      clientEmail: quoteData.clientEmail,
      quoteSentAt: sent.quoteSentAt,
    });
    expect(project.quoteAcceptedAt).toMatch(/^\d{4}-/);
    let workspace = await (await api.get("/api/workspace")).json();
    expect(workspace.quotes).toHaveLength(0);
    expect(workspace.projects).toHaveLength(1);
    expect(workspace.scope[0]).toMatchObject({
      id: scope.id,
      projectId: project.id,
      estimate: 5000.15,
      materialCost: 1234.56,
    });
    expect(workspace.attachments[0]).toMatchObject({
      id: file.id,
      projectId: project.id,
      path: file.path,
    });
    expect(await (await api.get(`/api/files?id=${file.id}`)).text()).toBe(
      "Sent quote test",
    );
    expect(
      (
        await api.patch("/api/workspace", {
          headers,
          data: {
            kind: "quote",
            id: sent.id,
            updatedAt: sent.updatedAt,
            data: sent,
          },
        })
      ).status(),
    ).toBe(404);
    // Simulate a record saved by the old app without changing any production records.
    const historical = { ...project, contractPrice: 7000 };
    const seeded = await company.admin
      .from("remodel_records")
      .update({ data: historical })
      .eq("id", project.id)
      .eq("organization_id", company.organizationId);
    expect(seeded.error).toBeNull();
    const edited = await api.patch("/api/workspace", {
      headers,
      data: {
        kind: "project",
        id: project.id,
        updatedAt: project.updatedAt,
        data: {
          ...project,
          contractPrice: 1,
          quoteAcceptedAt: "forged",
          name: "Accepted garage",
        },
      },
    });
    expect(edited.status()).toBe(200);
    expect(await edited.json()).toMatchObject({
      contractPrice: 7000,
      quoteAcceptedAt: project.quoteAcceptedAt,
    });
    workspace = await (await api.get("/api/workspace")).json();
    expect(workspace.projects[0].contractPrice).toBe(7000);
    const cleared = await api.patch("/api/workspace", {
      headers,
      data: {
        kind: "scope",
        id: scope.id,
        updatedAt: editedScope.updatedAt,
        data: { ...editedScope, materialCost: 0 },
      },
    });
    expect(cleared.status()).toBe(200);
    expect((await cleared.json()).materialCost).toBe(0);
  },
);
