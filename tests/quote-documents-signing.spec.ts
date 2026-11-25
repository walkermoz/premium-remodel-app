import { test, expect, password } from "./supabase-fixture";
import {
  defaultMsaContractTerms,
  defaultMsaPaymentSchedule,
} from "@/lib/msa-draft";

const cloud = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const headers = { Origin: "http://localhost:3100" };
test.use({ channel: "chromium" });

cloud(
  "existing prepared quote and MSA stay signable with their original private document links",
  async ({ company, page }) => {
    const api = page.request;
    const frameErrors: string[] = [];
    page.on("console", (message) => {
      if (
        /Refused to (frame|display|load).*|frame-ancestors|X-Frame-Options/i.test(
          message.text(),
        )
      )
        frameErrors.push(message.text());
    });
    expect(
      (
        await api.post("/api/auth", {
          headers,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const created = await api.post("/api/workspace", {
      headers,
      data: {
        kind: "quote",
        data: {
          name: "Documents signing kitchen",
          address: "100 Temporary Test Lane",
          client: "Taylor Customer",
          clientEmail: "taylor@example.com",
          clientPhone: "",
          startDate: "",
          endDate: "",
          completedDate: "",
          status: "Draft",
          description: "Isolated signing verification",
          category: "Kitchen",
          cover: "",
          quoteNumber: "DOCS-QA",
        },
      },
    });
    expect(created.status()).toBe(201);
    const quote = await created.json();
    const scopeResponse = await api.post("/api/workspace", {
      headers,
      data: {
        kind: "scope",
        data: {
          projectId: quote.id,
          title: "Cabinet installation",
          details: "Install the selected kitchen cabinets.",
          quantity: 1,
          unit: "job",
          estimate: 10000,
          subCost: 0,
          materialCost: 0,
          contractorId: "",
          status: "To do",
        },
      },
    });
    expect(scopeResponse.status()).toBe(201);
    const scope = await scopeResponse.json();
    const terms = await api.post(`/api/msa/${quote.id}/terms`, {
      headers,
      data: {
        updatedAt: quote.updatedAt,
        msaPaymentSchedule: defaultMsaPaymentSchedule(quote),
        msaPermitResponsibility: "No permit required",
        msaContractTerms: {
          ...defaultMsaContractTerms(quote, []),
          exclusions: "Outside work is excluded.",
          allowances: "No allowances.",
        },
      },
    });
    expect(terms.status()).toBe(200);
    const prepared = await api.post(`/api/msa/${quote.id}/prepare`, {
      headers,
      data: {
        owner: quote.client,
        ownerEmail: quote.clientEmail,
        signedName: "Workspace Owner",
        signatureMethod: "typed",
        signatureStrokes: [
          [
            [0.1, 0.1],
            [0.5, 0.8],
            [0.9, 0.2],
          ],
        ],
      },
    });
    expect(prepared.status()).toBe(200);
    await page.goto(`/?view=Quotes&project=${quote.id}`);
    const workflow = page.getByRole("navigation", { name: "Quote workflow" });
    await workflow.getByRole("button", { name: /Paperwork/ }).click();
    await page
      .getByText("Previously prepared documents", { exact: true })
      .click();
    const documents = page.locator(".paperwork-legacy");
    const quoteCard = documents.getByRole("region", {
      name: /^Quote.* signing status$/,
    });
    const msaCard = documents.getByRole("region", {
      name: "Master Services Agreement signing status",
    });
    await expect(
      quoteCard.getByRole("button", { name: "Sign quote on this device" }),
    ).toBeEnabled();
    const opened = page.waitForResponse((r) =>
      r.url().endsWith(`/api/quotes/${quote.id}/onsite-signing`),
    );
    const reviewedPdf = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname.startsWith("/api/client-quote/") &&
        new URL(r.url()).pathname.endsWith("/pdf") &&
        new URL(r.url()).searchParams.get("view") === "1",
    );
    await quoteCard
      .getByRole("button", { name: "Sign quote on this device" })
      .click();
    const session = await (await opened).json();
    expect(session.quoteUpdatedAt).toBeTruthy();
    const review = await reviewedPdf;
    expect(review.status()).toBe(200);
    expect(review.headers()["x-frame-options"]).toBe("SAMEORIGIN");
    expect(review.headers()["content-disposition"]).toMatch(/^inline;/);
    const quoteForm = page.getByRole("region", {
      name: "On-device quote signing",
    });
    await expect(quoteForm).toBeVisible();
    await quoteForm
      .getByRole("button", { name: "Type name", exact: true })
      .click();
    await quoteForm
      .getByRole("checkbox", { name: /I agree to this quote/ })
      .check();
    await quoteForm
      .getByRole("button", { name: "Sign and accept quote" })
      .click();
    await expect(quoteCard).toContainText("Signed");
    await expect(quoteForm).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`view=Quotes&project=${quote.id}`));
    await expect(
      page.getByRole("button", { name: "Create project", exact: true }),
    ).toBeEnabled();

    await expect(
      page.getByRole("button", { name: "Create project", exact: true }),
    ).toBeEnabled();
    const openedMsa = page.waitForResponse((r) =>
      r.url().endsWith(`/api/quotes/${quote.id}/onsite-signing`),
    );
    await msaCard
      .getByRole("button", { name: "Sign agreement on this device" })
      .click();
    const msaSession = await (await openedMsa).json();
    const linkId = (url: string) =>
      new URL(url).pathname.split("/")[2].split(".")[0];
    expect(linkId(msaSession.url)).toBe(linkId(session.url));
    const msaForm = page.getByRole("region", { name: "On-device MSA signing" });
    await expect(
      msaForm.getByRole("region", {
        name: "Scrollable MSA for customer signature",
      }),
    ).toContainText("Cabinet installation");
    await msaForm
      .getByRole("button", { name: "Type name", exact: true })
      .click();
    await msaForm.locator(".workflow-inline-msa-consent").click();
    await expect(
      msaForm.getByRole("checkbox", {
        name: /I reviewed and approve this Master Services Agreement/,
      }),
    ).toBeChecked();
    await msaForm
      .getByRole("button", { name: "Sign service agreement", exact: true })
      .click();
    await expect(msaForm).toHaveCount(0);
    await expect(msaCard).toContainText("Signed");
    await msaCard.getByText("Details & history", { exact: true }).click();
    await expect(
      msaCard.getByRole("list", { name: "Required signers" }),
    ).toContainText("Workspace Owner");
    await expect(msaCard.locator("time")).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: "Create project", exact: true }),
    ).toBeEnabled();
    const record = await company.admin
      .from("remodel_records")
      .select("data")
      .eq("id", quote.id)
      .single();
    expect(record.error).toBeNull();
    const data = record.data!.data;
    expect(data.quoteAcceptance.signedName).toBe("Taylor Customer");
    expect(data.quoteAcceptance.quoteSnapshotSha256).toBeTruthy();
    expect(data.msaAgreement.customerSignature.name).toBe("Taylor Customer");
    expect(data.msaAgreement.staffSignature.name).toBe("Workspace Owner");
    expect(data.msaAgreement.status).toBe("signed");
    expect(data.msaAgreement.termsSha256).toBeTruthy();
    const attemptedEdit = await api.patch("/api/workspace", {
      headers,
      data: {
        kind: "scope",
        id: scope.id,
        updatedAt: scope.updatedAt,
        data: { ...scope, estimate: 12000 },
      },
    });
    expect(attemptedEdit.status()).toBe(409);
    expect((await api.get(`/api/quotes/${quote.id}/pdf`)).status()).toBe(200);
    expect((await api.get(`/api/msa/${quote.id}/pdf`)).status()).toBe(200);
    expect((await api.get(session.url)).status()).toBe(200);
    const publicPdf = await api.get(
      `${new URL(session.url).origin}${new URL(session.url).pathname.replace(/\/client\//, "/api/client-quote/").replace(/\/quote$/, "/pdf")}?view=1`,
    );
    expect(publicPdf.status()).toBe(200);
    expect(publicPdf.headers()["content-disposition"]).toContain("inline");
    expect(publicPdf.headers()["cache-control"]).toContain("no-store");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Paperwork", exact: true }),
    ).toBeVisible();
    await page
      .getByText("Previously prepared documents", { exact: true })
      .click();
    await expect(quoteCard).toContainText("Signed");
    await expect(msaCard).toContainText("Signed");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Paperwork", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: ".local/quote-documents-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    expect(frameErrors).toEqual([]);
  },
);
