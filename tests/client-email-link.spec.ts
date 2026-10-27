import { expect, test } from "@playwright/test";
import { test as companyTest, password } from "./supabase-fixture";
import {
  clientPortalEmailTag,
  createClientEmailToken,
  createClientPortalToken,
  parseClientPortalAccess,
  parseClientPortalToken,
} from "@/lib/client-portal-token";

const cloudTest =
  process.env.RUN_SUPABASE_TESTS === "1" ? companyTest : companyTest.skip;

test("email portal links are fresh, recipient-bound, and expire after 30 days", () => {
  const previous = process.env.CLIENT_PORTAL_SECRET;
  process.env.CLIENT_PORTAL_SECRET =
    "playwright-only-client-portal-secret-change-before-production";
  try {
    const id = "11111111-1111-4111-8111-111111111111";
    const issuedAt = Date.UTC(2026, 9, 24, 12);
    const first = createClientEmailToken(id, " Client@Example.com ", issuedAt);
    const second = createClientEmailToken(id, "client@example.com", issuedAt);
    expect(second).not.toBe(first);
    const parsed = parseClientPortalAccess(first, issuedAt);
    expect(parsed?.id).toBe(id);
    expect(parsed?.emailTag).toBe(clientPortalEmailTag("client@example.com"));
    expect(parsed?.expired).toBe(false);
    expect(
      parseClientPortalAccess(first, issuedAt + 30 * 24 * 60 * 60 * 1000)
        ?.expired,
    ).toBe(true);
    expect(
      parseClientPortalAccess(
        first.replace(id, "22222222-2222-4222-8222-222222222222"),
        issuedAt,
      ),
    ).toBeNull();
    // The final base64url character has unused bits; change the penultimate one.
    expect(
      parseClientPortalAccess(
        `${first.slice(0, -2)}${first.at(-2) === "A" ? "B" : "A"}${first.slice(-1)}`,
        issuedAt,
      ),
    ).toBeNull();
    const shared = createClientPortalToken(id);
    expect(createClientPortalToken(id)).not.toBe(shared);
    expect(parseClientPortalToken(shared)).toBe(id);
    expect(parseClientPortalAccess(shared)?.emailTag).toBeNull();
    expect(
      parseClientPortalAccess(shared, Date.now() + 30 * 24 * 60 * 60 * 1000)
        ?.expired,
    ).toBe(true);
    const extended = shared.split(".");
    extended[1] = String(Number(extended[1]) + 60);
    expect(parseClientPortalAccess(extended.join("."))).toBeNull();
    expect(parseClientPortalAccess(`${id}.${"A".repeat(43)}`)).toBeNull();
  } finally {
    if (previous === undefined) delete process.env.CLIENT_PORTAL_SECRET;
    else process.env.CLIENT_PORTAL_SECRET = previous;
  }
});

test("client sign-in offers a new email link without exposing quote details", async ({
  page,
}) => {
  await page.route("**/api/client-access/request", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: "not-a-client@example.com",
    });
    await route.fulfill({ json: { sent: true } });
  });
  await page.goto("/client/sign-in");
  await expect(
    page.getByRole("heading", { name: "Sign in with your email" }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill("not-a-client@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();
  await expect(
    page.getByText(/If this email has a quote with this business/),
  ).toBeVisible();
});

cloudTest(
  "email links open only their recipient's quotes",
  async ({ company, page, browser }) => {
    process.env.CLIENT_PORTAL_SECRET =
      "playwright-only-client-portal-secret-change-before-production";
    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers: { Origin: "http://localhost:3100" },
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const links: string[] = [];
    const numbers: string[] = [];
    for (const number of ["201", "202"]) {
      const created = await api.post("/api/workspace", {
        headers: { Origin: "http://localhost:3100" },
        data: {
          kind: "quote",
          data: {
            name: `Bathroom quote ${number}`,
            address: "100 Test Lane",
            client: "Client Email Test",
            clientEmail: "client-email-test@example.com",
            clientPhone: "",
            startDate: "",
            endDate: "",
            completedDate: "",
            status: "Sent",
            description: "Test quote",
            category: "Bathroom",
            cover: "",
            quoteNumber: number,
          },
        },
      });
      expect(created.status()).toBe(201);
      const quote = await created.json();
      numbers.push(quote.quoteNumber);
      const link = await api.post("/api/client-links", {
        headers: { Origin: "http://localhost:3100" },
        data: { projectId: quote.id, kind: "quote" },
      });
      expect(link.status()).toBe(201);
      links.push((await link.json()).url);
    }
    const id = new URL(links[0]).pathname.split("/")[2].split(".")[0];
    const token = createClientEmailToken(id, "client-email-test@example.com");
    const client = await browser.newContext();
    const customerPage = await client.newPage();
    await customerPage.goto(`/client/${token}/quote`);
    await expect(
      customerPage.getByRole("heading", { name: "Customer acceptance" }),
    ).toBeVisible();
    await customerPage.goto(`/client/${token}/quote?view=quotes`);
    await expect(customerPage.getByText(`Quote #${numbers[0]}`)).toBeVisible();
    await expect(customerPage.getByText(`Quote #${numbers[1]}`)).toBeVisible();

    const wrongEmail = createClientEmailToken(id, "other@example.com");
    expect(
      (await client.request.get(`/client/${wrongEmail}/quote`)).status(),
    ).toBe(404);
    const expired = createClientEmailToken(
      id,
      "client-email-test@example.com",
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    );
    await customerPage.goto(`/client/${expired}/quote`);
    await expect(customerPage).toHaveURL(/\/client\/sign-in\?expired=1$/);
    await client.close();
  },
);
