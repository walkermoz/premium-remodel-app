import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { test, expect, password } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };

cloudTest(
  "only selected quote photos appear in the client quote and PDF",
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
          name: "Photo quote",
          address: "100 Test Lane",
          client: "Photo Client",
          clientEmail: "photo-client@example.com",
          clientPhone: "",
          startDate: "",
          endDate: "",
          status: "Sent",
          description: "",
          category: "Bathroom",
          cover: "",
        },
      },
    });
    expect(created.status()).toBe(201);
    const quote = await created.json();
    const image = await sharp({
      create: { width: 320, height: 240, channels: 3, background: "#8ba9b7" },
    })
      .jpeg()
      .toBuffer();
    const upload = async (name: string) => {
      const response = await api.post("/api/files", {
        headers: origin,
        multipart: {
          projectId: quote.id,
          file: { name, mimeType: "image/jpeg", buffer: image },
        },
      });
      expect(response.status()).toBe(201);
      return response.json();
    };
    const selected = await upload("before.jpg");
    const privatePhoto = await upload("private.jpg");
    const saved = await api.patch("/api/workspace", {
      headers: origin,
      data: {
        kind: "quote",
        id: quote.id,
        updatedAt: quote.updatedAt,
        data: {
          ...quote,
          quotePhotos: [
            {
              attachmentId: selected.id,
              kind: "before",
              caption: "Existing bathroom",
            },
          ],
        },
      },
    });
    expect(saved.status()).toBe(200);
    await page.route("**/api/generate/config", (route) =>
      route.fulfill({
        status: 200,
        json: {
          models: [{ id: "openai/gpt-image-2", name: "Test image model" }],
          defaultModel: "openai/gpt-image-2",
          configured: true,
        },
      }),
    );
    let generationCalls = 0;
    await page.route("**/api/generate", (route) => {
      generationCalls++;
      expect(route.request().postDataBuffer()?.toString()).toContain(
        "project-photo.jpg",
      );
      return route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        body: image,
      });
    });
    await page.goto("/?view=Quotes");
    await page.getByRole("button", { name: /Photo quote/ }).click();
    const generateButton = page.getByRole("button", {
      name: "Generate finished concept",
    });
    await expect(generateButton).toBeEnabled();
    await generateButton.click();
    await expect(page.getByAltText("Generated finished concept")).toBeVisible();
    await page.screenshot({
      path: "test-results/quote-concept-review.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Add concept to quote" }).click();
    await expect(page.getByText("2 of 8 selected")).toBeVisible();
    expect(generationCalls).toBe(1);
    const link = await api.post("/api/client-links", {
      headers: origin,
      data: { projectId: quote.id, kind: "quote" },
    });
    expect(link.status()).toBe(201);
    const deleteSelected = await api.delete("/api/files", {
      headers: origin,
      data: { id: selected.id },
    });
    expect(deleteSelected.status()).toBe(409);
    const token = new URL((await link.json()).url).pathname.split("/")[2];
    const client = await browser.newContext();
    try {
      const photo = await client.request.get(
        `/api/client-quote/${token}/photos/${selected.id}`,
      );
      expect(photo.status()).toBe(200);
      expect(photo.headers()["content-type"]).toContain("image/jpeg");
      expect(
        (
          await client.request.get(
            `/api/client-quote/${token}/photos/${privatePhoto.id}`,
          )
        ).status(),
      ).toBe(404);
      const customerPage = await client.newPage();
      await customerPage.goto(`/client/${token}/quote`);
      await expect(
        customerPage.getByRole("heading", { name: "Quote photos" }),
      ).toBeVisible();
      await expect(customerPage.getByText("Existing bathroom")).toBeVisible();
      await expect(customerPage.getByText(/Bathroom - Modern/)).toBeVisible();
      const pdf = await client.request.get(`/api/client-quote/${token}/pdf`);
      expect(pdf.status()).toBe(200);
      expect(
        (await PDFDocument.load(await pdf.body())).getPageCount(),
      ).toBeGreaterThan(1);
    } finally {
      await client.close();
    }
  },
);
