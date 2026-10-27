import { test, expect } from "@playwright/test";

test("sample settings never attempt a company Gmail connection", async ({
  page,
}) => {
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/google-mail")) requests++;
  });
  await page.goto("/demo?view=Settings");
  await page
    .getByRole("navigation", { name: "Settings categories" })
    .getByRole("button", { name: /Connections/ })
    .click();
  const section = page.getByRole("region", { name: "Company email" });
  await expect(section).toContainText(
    "Company email is available in your signed-in workspace.",
  );
  expect(requests).toBe(0);
});

test("company Gmail and quote send routes require a workspace login", async ({
  request,
}) => {
  expect((await request.get("/api/google-mail")).status()).toBe(401);
  expect((await request.get("/api/google-mail/connect")).status()).toBe(401);
  expect(
    (
      await request.post(
        "/api/quotes/00000000-0000-4000-8000-000000000000/email",
        {
          headers: { Origin: "http://localhost:3100" },
          data: {},
        },
      )
    ).status(),
  ).toBe(401);
});
