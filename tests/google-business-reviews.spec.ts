import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { test as companyTest, password } from "./supabase-fixture";

const cloudTest =
  process.env.RUN_SUPABASE_TESTS === "1" ? companyTest : companyTest.skip;
const origin = { Origin: "http://localhost:3100" };

test("Analytics shows the Google review flow in the workspace preview", async ({
  page,
}) => {
  await page.goto("/demo?view=Analytics");
  await expect(page.getByRole("heading", { name: "Analytics." })).toBeVisible();
  await expect(
    page.getByText(
      "Preview data — connect a real Google Business Profile in your workspace.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Sample customer")).toBeVisible();
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(page.getByLabel("Write a public reply")).toBeVisible();
  await page
    .getByLabel("Write a public reply")
    .fill("Thanks for sharing your feedback!");
  await page.getByRole("button", { name: "Post reply" }).click();
  await expect(
    page.getByText(
      "This is a preview. Connect Google Business Profile to post a reply.",
    ),
  ).toBeVisible();
});

test("Google review APIs require a signed-in workspace member", async ({
  request,
}) => {
  for (const path of [
    "/api/google-business",
    "/api/google-business/locations",
    "/api/google-business/reviews",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(401);
  }
  const reply = await request.post("/api/google-business/replies", {
    headers: { Origin: "http://localhost:3100" },
    data: { reviewId: "sample", comment: "test" },
  });
  expect(reply.status()).toBe(401);
});

cloudTest(
  "Google review connections follow the selected organization",
  async ({ company, page }) => {
    const otherOrganizationId = randomUUID();
    const admin = company.admin;
    const profile = await admin
      .from("profiles")
      .select("id")
      .eq("email", company.email)
      .single();
    expect(profile.error).toBeNull();
    try {
      expect(
        (
          await admin.from("organizations").insert({
            id: otherOrganizationId,
            name: "Other reviews test company",
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await admin.from("remodel_memberships").insert({
            organization_id: otherOrganizationId,
            profile_id: profile.data!.id,
            role: "owner",
            active: true,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await admin.from("remodel_google_business_connections").insert([
            {
              organization_id: company.organizationId,
              connected_by: profile.data!.id,
              google_account_id: "google-one",
              google_email: "one@example.test",
              refresh_token_ciphertext: "test-only-one",
              account_name: "accounts/100",
              location_name: "locations/100",
              location_title: "First company listing",
            },
            {
              organization_id: otherOrganizationId,
              connected_by: profile.data!.id,
              google_account_id: "google-two",
              google_email: "two@example.test",
              refresh_token_ciphertext: "test-only-two",
              account_name: "accounts/200",
              location_name: "locations/200",
              location_title: "Second company listing",
            },
          ])
        ).error,
      ).toBeNull();

      const api = page.request;
      expect(
        (
          await api.post("/api/auth", {
            headers: origin,
            data: { action: "login", email: company.email, password },
          })
        ).status(),
      ).toBe(200);
      const first = await api.get("/api/google-business");
      expect(first.status()).toBe(200);
      expect(await first.json()).toMatchObject({
        email: "one@example.test",
        locationTitle: "First company listing",
      });

      expect(
        (
          await api.post("/api/organizations", {
            headers: origin,
            data: { organizationId: otherOrganizationId },
          })
        ).status(),
      ).toBe(200);
      const second = await api.get("/api/google-business");
      expect(second.status()).toBe(200);
      expect(await second.json()).toMatchObject({
        email: "two@example.test",
        locationTitle: "Second company listing",
      });
    } finally {
      await admin
        .from("remodel_google_business_connections")
        .delete()
        .in("organization_id", [company.organizationId, otherOrganizationId]);
      await admin
        .from("remodel_memberships")
        .delete()
        .eq("organization_id", otherOrganizationId);
      await admin.from("organizations").delete().eq("id", otherOrganizationId);
    }
  },
);
