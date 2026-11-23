import { PDFDocument } from "pdf-lib";
import { test, expect, password } from "./supabase-fixture";
const cloud = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const headers = { Origin: "http://localhost:3100" };
// The full Chromium headless browser includes the built-in PDF viewer.
test.use({ channel: "chromium" });

cloud(
  "authenticated customer PDF preview loads with same-origin headers and mobile fallbacks",
  async ({ company, page }) => {
    expect(
      (
        await page.request.post("/api/auth", {
          headers,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const created = await page.request.post("/api/workspace", {
      headers,
      data: {
        kind: "quote",
        data: {
          name: "PDF preview regression",
          client: "Test Customer",
          clientEmail: "pdf@example.test",
          clientPhone: "",
          address: "100 Test Lane",
          startDate: "",
          endDate: "",
          status: "Draft",
          description: "Preview test",
          category: "Other",
          cover: "",
          revisedDate: "2026-11-23",
          preparedBy: "Test Admin",
          preparedByPhone: "",
          quoteNotes: "",
        },
      },
    });
    expect(created.status()).toBe(201);
    const quote = await created.json();
    expect(
      (
        await page.request.post("/api/workspace", {
          headers,
          data: {
            kind: "scope",
            data: {
              projectId: quote.id,
              title: "Kitchen cabinets",
              quantity: 1,
              unit: "job",
              estimate: 500,
              subCost: 100,
              materialCost: 0,
              contractorId: "",
              status: "To do",
            },
          },
        })
      ).status(),
    ).toBe(201);
    const violations: string[] = [];
    page.on("console", (message) => {
      if (
        /Refused to (frame|display|load).*|frame-ancestors|X-Frame-Options/i.test(
          message.text(),
        )
      )
        violations.push(message.text());
    });
    await page.goto(`/?view=Quotes&project=${quote.id}`);
    const preview = page.getByRole("dialog", {
      name: "Customer quote preview",
      exact: true,
    });
    const responsePromise = page.waitForResponse((response) =>
      response.url().endsWith(`/api/quotes/${quote.id}/pdf?view=1`),
    );
    await page
      .getByRole("button", { name: "Preview customer PDF", exact: true })
      .click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(response.headers()["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers()["content-security-policy"]).toContain(
      "frame-ancestors 'self'",
    );
    expect(response.headers()["content-disposition"]).toMatch(/^inline;/);
    // Chrome hands the iframe response to its PDF viewer, so read bytes through
    // the authenticated request client rather than CDP's consumed navigation.
    const inlinePdf = await page.request.get(
      `/api/quotes/${quote.id}/pdf?view=1`,
    );
    expect(inlinePdf.status()).toBe(200);
    const pdf = await PDFDocument.load(await inlinePdf.body());
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    await expect(preview).toBeVisible();
    await expect(preview.locator("iframe")).toHaveAttribute(
      "src",
      `/api/quotes/${quote.id}/pdf?view=1`,
    );
    await expect(
      preview.getByRole("link", { name: "Open PDF", exact: true }),
    ).toHaveAttribute("href", `/api/quotes/${quote.id}/pdf?view=1`);
    await expect(
      preview.getByRole("link", { name: "Open PDF", exact: true }),
    ).toHaveAttribute("target", "_blank");
    await expect(
      preview.getByRole("link", { name: "Download", exact: true }),
    ).toHaveAttribute("href", `/api/quotes/${quote.id}/pdf`);
    const download = await page.request.get(`/api/quotes/${quote.id}/pdf`);
    expect(download.status()).toBe(200);
    expect(download.headers()["content-disposition"]).toMatch(/^attachment;/);
    expect(download.headers()["x-frame-options"]).toBe("DENY");
    await page.waitForTimeout(500);
    await page.screenshot({ path: ".local/pdf-preview-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      preview.getByRole("link", { name: "Open PDF", exact: true }),
    ).toBeVisible();
    await expect(
      preview.getByRole("link", { name: "Download", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: ".local/pdf-preview-mobile.png",
    });
    expect(violations).toEqual([]);
    await preview.getByRole("button", { name: "Close", exact: true }).click();
    await expect(preview).toHaveCount(0);
  },
);
