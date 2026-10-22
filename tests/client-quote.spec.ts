import { test, expect, password } from "./supabase-fixture";
import { createHmac } from "node:crypto";

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
    const walletEndpoint = first.url
      .replace("/client/", "/api/client-quote/")
      .replace(/\/quote$/, "/wallet");
    const missingFormToken = await client.request.post(walletEndpoint, {
      form: {},
      maxRedirects: 0,
    });
    expect(missingFormToken.status()).toBe(303);
    expect(missingFormToken.headers().location).toContain("result=expired");
    const issuedAt = Math.floor(Date.now() / 1000);
    const linkId = token.split(".")[0];
    const formSignature = createHmac(
      "sha256",
      "playwright-only-client-portal-secret-change-before-production",
    )
      .update(`premium-remodel-wallet-form:${linkId}:${issuedAt}`)
      .digest("base64url");
    const validForm = await client.request.post(walletEndpoint, {
      form: {
        authenticity: `${issuedAt}.${formSignature}`,
      },
      maxRedirects: 0,
    });
    expect(validForm.status()).toBe(303);
    expect(validForm.headers().location).toContain("view=wallet");
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
    await clientPage.getByRole("link", { name: "Quotes", exact: true }).click();
    await expect(
      clientPage.getByRole("heading", { name: "Your quotes" }),
    ).toBeVisible();
    await expect(
      clientPage.getByRole("link", {
        name: new RegExp(`Quote #${quote.quoteNumber}`),
      }),
    ).toBeVisible();
    await clientPage.getByRole("link", { name: "Invoices" }).click();
    await expect(
      clientPage.getByText("No invoices are available in this quote link"),
    ).toBeVisible();
    await clientPage.getByRole("link", { name: "Wallet" }).click();
    await expect(
      clientPage.getByText("Payment methods are temporarily unavailable.", {
        exact: false,
      }),
    ).toBeVisible();
    await clientPage.getByRole("link", { name: "Contact us" }).click();
    await expect(
      clientPage.getByRole("link", { name: "contact@premiumremodel.com" }),
    ).toBeVisible();
    await clientPage.getByRole("link", { name: "New request" }).first().click();
    await expect(
      clientPage.getByRole("heading", {
        name: "Get Your Free In-Home Estimate",
      }),
    ).toBeVisible();
    await clientPage.getByRole("button", { name: "Bathroom Remodel" }).click();
    await clientPage.getByRole("button", { name: "Continue" }).click();
    await clientPage
      .getByRole("textbox", { name: "Full name" })
      .fill("New Client");
    await clientPage.getByRole("textbox", { name: "Zip code" }).fill("27513");
    await clientPage
      .getByRole("textbox", { name: "Street address" })
      .fill("100 Test Lane");
    await clientPage
      .getByRole("textbox", { name: "Phone number" })
      .fill("9195550100");
    await clientPage
      .getByRole("textbox", { name: "Email address" })
      .fill("new@example.com");
    await clientPage
      .getByRole("checkbox", {
        name: "Receive text messages about appointment",
      })
      .check();
    let requestPayload: Record<string, unknown> | undefined;
    await clientPage.route("**/api/leads", async (route) => {
      requestPayload = route.request().postDataJSON();
      await route.fulfill({ status: 201, json: { received: true } });
    });
    await clientPage.getByRole("button", { name: "Schedule Now" }).click();
    await expect(
      clientPage.getByRole("heading", { name: "Thank You!" }),
    ).toBeVisible();
    expect(requestPayload).toMatchObject({
      first_name: "New",
      last_name: "Client",
      phone: "+19195550100",
      project: "Bathroom Remodel",
      sms_appointment_opt_in: true,
      sms_marketing_opt_in: false,
    });
    await clientPage.goto(first.url);
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
