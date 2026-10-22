import { test, expect, password } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };

cloudTest(
  "a client quote link shows only one public quote and can be replaced",
  async ({ company, page, browser }) => {
    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers: origin,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);

    const create = async (kind: string, data: Record<string, unknown>) => {
      const response = await api.post("/api/workspace", {
        headers: origin,
        data: { kind, data },
      });
      expect(response.status()).toBe(201);
      return response.json();
    };
    const quote = await create("quote", {
      name: "Willowbrook bathroom remodel",
      address: "1214 Willowbrook Drive, Cary, NC",
      client: "Private Client",
      clientEmail: "client@example.com",
      clientPhone: "",
      startDate: "",
      endDate: "",
      completedDate: "",
      status: "Sent",
      description: "Customer-facing remodel scope",
      category: "Bathroom",
      cover: "",
      quoteNumber: "901",
      quoteNotes: "Selections are subject to availability.",
    });
    const scope = await create("scope", {
      projectId: quote.id,
      title: "Shower waterproofing",
      details: "Waterproof the shower walls and floor.",
      quantity: 1,
      unit: "job",
      estimate: 4100,
      subCost: 987654,
      materialCost: 876543,
      contractorId: "",
      status: "To do",
    });

    const created = await api.post("/api/client-links", {
      headers: origin,
      data: { projectId: quote.id, kind: "quote" },
    });
    expect(created.status()).toBe(201);
    const first = await created.json();
    expect(first.url).toMatch(/^http:\/\/localhost:3100\/client\/.+\/quote$/);
    const token = first.url.split("/client/")[1].split("/quote")[0];
    const altered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

    const client = await browser.newContext();
    expect(
      (await client.request.get(first.url.replace(token, altered))).status(),
    ).toBe(404);
    const clientPage = await client.newPage();
    await clientPage.goto(first.url);
    await expect(clientPage.getByRole("heading", { level: 1 })).toHaveText(
      "Willowbrook bathroom remodel",
    );
    await expect(clientPage.getByText("Shower waterproofing")).toBeVisible();
    await expect(clientPage.getByText("$4,100.00").first()).toBeVisible();
    await expect(clientPage.getByText("987,654")).toHaveCount(0);
    await expect(clientPage.getByText("876,543")).toHaveCount(0);
    const editedScope = await company.admin
      .from("remodel_records")
      .update({ data: { ...scope, estimate: 9900 } })
      .eq("organization_id", company.organizationId)
      .eq("id", scope.id);
    expect(editedScope.error).toBeNull();
    await clientPage.reload();
    await expect(clientPage.getByText("$4,100.00").first()).toBeVisible();
    await expect(clientPage.getByText("$9,900.00")).toHaveCount(0);
    const pdf = await client.request.get(
      first.url
        .replace(/\/quote$/, "")
        .replace("/client/", "/api/client-quote/") + "/pdf",
    );
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");

    const projectPage = await client.request.get(
      first.url.replace(/\/quote$/, ""),
    );
    expect(projectPage.status()).toBe(404);

    const accepted = await api.post("/api/quotes/accept", {
      headers: origin,
      data: { id: quote.id, updatedAt: quote.updatedAt },
    });
    expect(accepted.status()).toBe(200);
    await clientPage.reload();
    await expect(
      clientPage.getByText("Approved", { exact: true }).first(),
    ).toBeVisible();
    const projectLink = await api.post("/api/client-links", {
      headers: origin,
      data: { projectId: quote.id, kind: "project" },
    });
    expect(projectLink.status()).toBe(201);
    const projectUrl = (await projectLink.json()).url as string;
    expect((await client.request.get(`${projectUrl}/quote`)).status()).toBe(
      404,
    );

    const rotated = await api.post("/api/client-links", {
      headers: origin,
      data: { projectId: quote.id, kind: "quote", rotate: true },
    });
    expect(rotated.status()).toBe(200);
    const second = await rotated.json();
    expect(second.url).not.toBe(first.url);
    expect((await client.request.get(first.url)).status()).toBe(404);
    expect((await client.request.get(second.url)).status()).toBe(200);

    expect(
      (
        await api.delete("/api/client-links", {
          headers: origin,
          data: { projectId: quote.id, kind: "quote" },
        })
      ).status(),
    ).toBe(200);
    expect((await client.request.get(second.url)).status()).toBe(404);
    await client.close();
  },
);
