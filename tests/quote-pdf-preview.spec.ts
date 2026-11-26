import { expect, test } from "@playwright/test";

const pdfPath = "/api/quotes/00000000-0000-4000-8000-000000000000/pdf";
test("only inline quote PDFs allow same-origin framing and still require authentication", async ({
  request,
}) => {
  const inline = await request.get(`${pdfPath}?view=1`);
  expect(inline.status()).toBe(401);
  expect(inline.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(inline.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'self'",
  );
  expect(inline.headers()["content-security-policy-report-only"]).toContain(
    "frame-ancestors 'self'",
  );
  for (const path of [
    pdfPath,
    `${pdfPath}?view=11`,
    "/login?view=1",
    "/api/workspace?view=1",
  ]) {
    const response = await request.get(path);
    expect(response.headers()["x-frame-options"], path).toBe("DENY");
    expect(response.headers()["content-security-policy"], path).toContain(
      "frame-ancestors 'none'",
    );
  }
  const files = await request.get("/api/files?id=missing&view=1");
  expect(files.headers()["content-security-policy"]).toBe(
    "default-src 'none'; sandbox",
  );
  const privatePdf = "/api/client-quote/invalid-token/pdf";
  const missing = await request.get(`${privatePdf}?view=1`);
  expect(missing.status()).toBe(404);
  expect(missing.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  for (const path of [privatePdf, `${privatePdf}?view=11`]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(response.headers()["x-frame-options"]).toBe("DENY");
  }
});
