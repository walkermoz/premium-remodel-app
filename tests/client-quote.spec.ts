import { test, expect, password } from "./supabase-fixture";
import { createHmac } from "node:crypto";
import { randomUUID } from "node:crypto";
import {
  cancellationDeadline,
  easternDate,
  prepareMsa,
} from "@/lib/msa-contract";
import {
  defaultMsaContractTerms,
  defaultMsaPaymentSchedule,
} from "@/lib/msa-draft";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };

cloudTest(
  "a customer signs a sent quote and the signature remains on the quote and PDF",
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
    const created = await api.post("/api/workspace", {
      headers: origin,
      data: {
        kind: "quote",
        data: {
          name: "Bathroom remodel",
          address: "100 Test Lane",
          client: "Walker Portal Test",
          clientEmail: "client@example.com",
          clientPhone: "",
          startDate: "",
          endDate: "",
          completedDate: "",
          status: "Sent",
          description: "Test quote",
          category: "Bathroom",
          cover: "",
          quoteNumber: "999",
          quoteNotes: "Test quote only.",
        },
      },
    });
    expect(created.status()).toBe(201);
    const quote = await created.json();
    const scope = await api.post("/api/workspace", {
      headers: origin,
      data: {
        kind: "scope",
        data: {
          projectId: quote.id,
          title: "Shower waterproofing",
          details: "Waterproof shower.",
          quantity: 1,
          unit: "job",
          estimate: 1850,
          subCost: 0,
          materialCost: 0,
          contractorId: "",
          status: "To do",
        },
      },
    });
    expect(scope.status()).toBe(201);
    const scopeItem = await scope.json();
    const draftTerms = await api.post(`/api/msa/${quote.id}/terms`, {
      headers: origin,
      data: {
        updatedAt: quote.updatedAt,
        msaPaymentSchedule: defaultMsaPaymentSchedule(quote),
        msaPermitResponsibility: "Owner obtains and pays",
        msaContractTerms: defaultMsaContractTerms(quote, [
          {
            section: "Bathroom",
            title: "Shower waterproofing",
            details: "Waterproof shower.",
            amount: 1850,
          },
        ]),
      },
    });
    expect(draftTerms.status()).toBe(200);
    const quoteWithDraftTerms = await draftTerms.json();
    quote.updatedAt = quoteWithDraftTerms.updatedAt;
    const linkResponse = await api.post("/api/client-links", {
      headers: origin,
      data: { projectId: quote.id, kind: "quote" },
    });
    expect(linkResponse.status()).toBe(201);
    const link = await linkResponse.json();
    // Email delivery marks the quote Sent after the frozen customer snapshot
    // is created. This operational timestamp change must not invalidate the
    // exact quote the customer received.
    const emailedAt = new Date(
      Date.parse(quoteWithDraftTerms.updatedAt) + 1000,
    ).toISOString();
    const sentQuote = {
      ...quoteWithDraftTerms,
      status: "Sent",
      quoteSentAt: emailedAt,
      updatedAt: emailedAt,
    };
    const markedSent = await company.admin
      .from("remodel_records")
      .update({
        data: sentQuote,
        updated_at: emailedAt,
      })
      .eq("organization_id", company.organizationId)
      .eq("id", quote.id)
      .eq("kind", "quote")
      .eq("updated_at", quoteWithDraftTerms.updatedAt);
    expect(markedSent.error).toBeNull();
    const client = await browser.newContext();
    const signEndpoint = link.url
      .replace("/client/", "/api/client-quote/")
      .replace(/\/quote$/, "/sign");
    const pdfEndpoint = link.url
      .replace("/client/", "/api/client-quote/")
      .replace(/\/quote$/, "/pdf");
    const changedAt = new Date(Date.parse(emailedAt) + 1000).toISOString();
    const changed = await company.admin
      .from("remodel_records")
      .update({
        data: {
          ...sentQuote,
          description: "Changed after the customer received the quote",
          updatedAt: changedAt,
        },
        updated_at: changedAt,
      })
      .eq("organization_id", company.organizationId)
      .eq("id", quote.id)
      .eq("kind", "quote")
      .eq("updated_at", emailedAt);
    expect(changed.error).toBeNull();
    const staleContent = await client.request.post(signEndpoint, {
      headers: origin,
      data: {
        signedName: "Walker Portal Test",
        quoteUpdatedAt: quote.updatedAt,
        signatureStrokes: [
          [
            [0.1, 0.1],
            [0.3, 0.3],
          ],
        ],
        acceptedTerms: true,
      },
    });
    expect(staleContent.status()).toBe(409);
    const restoredAt = new Date(Date.parse(changedAt) + 1000).toISOString();
    const restored = await company.admin
      .from("remodel_records")
      .update({
        data: { ...sentQuote, updatedAt: restoredAt },
        updated_at: restoredAt,
      })
      .eq("organization_id", company.organizationId)
      .eq("id", quote.id)
      .eq("kind", "quote")
      .eq("updated_at", changedAt);
    expect(restored.error).toBeNull();
    const unsignedPdf = await client.request.get(pdfEndpoint);
    expect(unsignedPdf.status()).toBe(200);
    const missingConsent = await client.request.post(signEndpoint, {
      headers: origin,
      data: {
        signedName: "Walker Portal Test",
        quoteUpdatedAt: quote.updatedAt,
        signatureStrokes: [
          [
            [0.1, 0.1],
            [0.3, 0.3],
          ],
        ],
      },
    });
    expect(missingConsent.status()).toBe(400);
    const customerPage = await client.newPage();
    await customerPage.goto(link.url);
    await expect(
      customerPage.getByText("Project #1", { exact: true }),
    ).toHaveCount(0);
    await expect(customerPage.getByText("Shower waterproofing")).toBeVisible();
    await expect(
      customerPage.getByRole("textbox", { name: "Print name" }),
    ).toHaveValue("Walker Portal Test");
    await expect(customerPage.getByText("Date", { exact: true })).toBeVisible();
    const pad = customerPage.getByRole("img", {
      name: "Draw your signature here",
    });
    await pad.click();
    await pad.scrollIntoViewIfNeeded();
    const box = await pad.boundingBox();
    expect(box).toBeTruthy();
    await customerPage.mouse.move(box!.x + 20, box!.y + 40);
    await customerPage.mouse.down();
    await customerPage.mouse.move(box!.x + 100, box!.y + 20, { steps: 8 });
    await customerPage.mouse.move(box!.x + 180, box!.y + 45, { steps: 8 });
    await customerPage.mouse.up();
    await expect(pad.locator("polyline")).toHaveCount(1);
    await customerPage
      .getByRole("checkbox", { name: /I agree to this quote/ })
      .check();
    await customerPage
      .getByRole("button", { name: "Sign and accept quote" })
      .click();
    await expect(
      customerPage.getByRole("img", { name: "Customer signature" }),
    ).toBeVisible();
    await expect(
      customerPage.getByText("Walker Portal Test").last(),
    ).toBeVisible();
    const record = await company.admin
      .from("remodel_records")
      .select("kind,data")
      .eq("organization_id", company.organizationId)
      .eq("id", quote.id)
      .single();
    expect(record.error).toBeNull();
    expect(record.data?.kind).toBe("quote");
    expect(record.data?.data.status).toBe("Accepted");
    expect(record.data?.data.contractPrice).toBe(1850);
    expect(record.data?.data.acceptedQuoteScope).toEqual(
      expect.arrayContaining([expect.objectContaining({ amount: 1850 })]),
    );
    expect(record.data?.data.quoteAcceptance.signedName).toBe(
      "Walker Portal Test",
    );
    expect(
      record.data?.data.quoteAcceptance.signatureStrokes.length,
    ).toBeGreaterThan(0);
    expect(record.data?.data.quoteAcceptance.ip).toBeDefined();
    await page.goto(`/?view=Quotes&project=${quote.id}`);
    await expect(
      page.getByRole("heading", { name: "Bathroom remodel" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Before this becomes a project" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Sign and send the prepared MSA" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Accept quote" }),
    ).toHaveCount(0);
    const premature = await api.post("/api/quotes/accept", {
      headers: origin,
      data: { id: quote.id, updatedAt: record.data?.data.updatedAt },
    });
    expect(premature.status()).toBe(409);
    const scopeChange = await api.patch("/api/workspace", {
      headers: origin,
      data: {
        kind: "scope",
        id: scopeItem.id,
        updatedAt: scopeItem.updatedAt,
        data: { ...scopeItem, estimate: 1 },
      },
    });
    expect(scopeChange.status()).toBe(409);
    const replay = await client.request.post(signEndpoint, {
      headers: origin,
      data: {
        signedName: "Walker Portal Test",
        quoteUpdatedAt: record.data?.data.quoteAcceptance.quoteUpdatedAt,
        signatureStrokes: record.data?.data.quoteAcceptance.signatureStrokes,
        acceptedTerms: true,
      },
    });
    expect(replay.status()).toBe(200);
    const pdf = await client.request.get(pdfEndpoint);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect(pdf.headers()["cache-control"]).toContain("no-store");
    expect(pdf.headers()["content-disposition"]).toContain(" - Signed.pdf");
    expect(await pdf.body()).not.toEqual(await unsignedPdf.body());
    const { getDocument, OPS } =
      await import("pdfjs-dist/legacy/build/pdf.mjs");
    const unsignedTask = getDocument({
      data: new Uint8Array(await unsignedPdf.body()),
    });
    const signedTask = getDocument({
      data: new Uint8Array(await pdf.body()),
    });
    const [unsignedDocument, signedDocument] = await Promise.all([
      unsignedTask.promise,
      signedTask.promise,
    ]);
    try {
      const unsignedPage = await unsignedDocument.getPage(
        unsignedDocument.numPages,
      );
      const signedPage = await signedDocument.getPage(signedDocument.numPages);
      const text = (await signedPage.getTextContent()).items
        .filter((item): item is typeof item & { str: string } => "str" in item)
        .map((item) => item.str)
        .join(" ");
      expect(text).toContain("Walker Portal Test");
      expect(text).toContain("Date:");
      const unsignedPaths = (
        await unsignedPage.getOperatorList()
      ).fnArray.filter((operator) => operator === OPS.constructPath).length;
      const signedPaths = (await signedPage.getOperatorList()).fnArray.filter(
        (operator) => operator === OPS.constructPath,
      ).length;
      expect(signedPaths).toBeGreaterThan(unsignedPaths);
    } finally {
      await unsignedTask.destroy();
      await signedTask.destroy();
    }
    const acceptedQuote = record.data!.data;
    const paymentSchedule = defaultMsaPaymentSchedule(acceptedQuote);
    const msaContractTerms = defaultMsaContractTerms(
      acceptedQuote,
      acceptedQuote.acceptedQuoteScope,
    );
    const terms = await api.post(`/api/msa/${quote.id}/terms`, {
      headers: origin,
      data: {
        updatedAt: acceptedQuote.updatedAt,
        msaPaymentSchedule: paymentSchedule,
        msaPermitResponsibility: "Owner obtains and pays",
        msaContractTerms,
      },
    });
    expect(terms.status()).toBe(200);
    const quoteWithTerms = await terms.json();
    const signer = await company.admin
      .from("profiles")
      .select("id,full_name")
      .eq("organization_id", company.organizationId)
      .single();
    expect(signer.error).toBeNull();
    const strokes = [
      [
        [0.1, 0.1],
        [0.3, 0.3],
      ],
    ] as Array<Array<[number, number]>>;
    const prepared = prepareMsa(
      quoteWithTerms,
      [scopeItem],
      {
        owner: "Walker Portal Test",
        ownerEmail: "client@example.com",
        signerTitle: "Owner",
        signatureStrokes: strokes,
      },
      { id: signer.data!.id, name: signer.data!.full_name },
      new Date().toISOString(),
    );
    const signedAt = new Date().toISOString();
    const transactionDate = easternDate(signedAt);
    const agreement = {
      ...prepared,
      status: "signed" as const,
      transactionDate,
      cancellationDeadline: cancellationDeadline(transactionDate),
      customerSignature: {
        name: "Walker Portal Test",
        signedAt,
        signatureStrokes: strokes,
      },
    };
    const seededAt = new Date(Date.now() + 1000).toISOString();
    const seeded = await company.admin
      .from("remodel_records")
      .update({
        data: {
          ...quoteWithTerms,
          msaAgreement: agreement,
          updatedAt: seededAt,
        },
        updated_at: seededAt,
      })
      .eq("organization_id", company.organizationId)
      .eq("id", quote.id)
      .eq("kind", "quote");
    expect(seeded.error).toBeNull();
    expect(
      (
        await api.post("/api/quotes/accept", {
          headers: origin,
          data: { id: quote.id, updatedAt: seededAt },
        })
      ).status(),
    ).toBe(409);
    const firstCheck = await api.post(`/api/quotes/${quote.id}/check-deposit`, {
      headers: origin,
      data: {
        requestId: randomUUID(),
        amount: "100",
        checkReference: "test-1",
      },
    });
    expect(firstCheck.status()).toBe(200);
    expect((await firstCheck.json()).projectReady).toBe(false);
    const interim = await company.admin
      .from("remodel_records")
      .select("kind")
      .eq("organization_id", company.organizationId)
      .eq("id", quote.id)
      .single();
    expect(interim.data?.kind).toBe("quote");
    const finalRequestId = randomUUID();
    const finalCheck = await api.post(`/api/quotes/${quote.id}/check-deposit`, {
      headers: origin,
      data: {
        requestId: finalRequestId,
        amount: "825",
        checkReference: "test-2",
      },
    });
    expect(finalCheck.status()).toBe(200);
    expect((await finalCheck.json()).projectReady).toBe(true);
    const promoted = await company.admin
      .from("remodel_records")
      .select("kind,data")
      .eq("organization_id", company.organizationId)
      .eq("id", quote.id)
      .single();
    expect(promoted.data?.kind).toBe("project");
    expect(promoted.data?.data.status).toBe("Planning");
    expect(promoted.data?.data.quoteAcceptedAt).toBe(
      acceptedQuote.quoteAcceptedAt,
    );
    expect(promoted.data?.data.msaAgreement.status).toBe("signed");
    expect(
      (
        await api.post(`/api/quotes/${quote.id}/check-deposit`, {
          headers: origin,
          data: {
            requestId: finalRequestId,
            amount: "825",
            checkReference: "test-2",
          },
        })
      ).status(),
    ).toBe(200);
    await client.close();
  },
);

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
      clientPage.getByRole("heading", { name: "New request" }),
    ).toBeVisible();
    await expect(clientPage.getByText("Free Consultation")).toHaveCount(0);
    await clientPage.getByRole("button", { name: "Bathroom Remodel" }).click();
    await clientPage.getByRole("button", { name: "Continue" }).click();
    await clientPage.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
    });
    const descriptionLabel = clientPage.getByText("Job description", {
      exact: false,
    });
    expect(
      await descriptionLabel.evaluate(
        (element) => getComputedStyle(element).color,
      ),
    ).toBe("rgb(16, 47, 66)");
    expect(
      await descriptionLabel.evaluate(
        (element) => getComputedStyle(element).colorScheme,
      ),
    ).toBe("light");
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
    expect(accepted.status()).toBe(409);
    await clientPage.reload();
    await expect(clientPage.getByText("$4,100.00").first()).toBeVisible();
    const projectLink = await api.post("/api/client-links", {
      headers: origin,
      data: { projectId: quote.id, kind: "project" },
    });
    expect(projectLink.status()).toBe(400);

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
