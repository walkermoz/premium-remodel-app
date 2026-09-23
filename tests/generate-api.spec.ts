import { readFile } from "node:fs/promises";
import { test, expect, password } from "./supabase-fixture";
const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };

cloudTest(
  "company default persists, generation is validated, and previews survive navigation",
  async ({ company, page }) => {
    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers: origin,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const initial = await api.get("/api/generate/config");
    expect(initial.status()).toBe(200);
    const config = await initial.json();
    expect(config.configured).toBe(true);
    expect(JSON.stringify(config)).not.toContain("sk-or-");
    expect(
      config.models.some(
        (model: { id: string }) => model.id === "black-forest-labs/flux.2-pro",
      ),
    ).toBe(true);
    expect(
      (
        await api.patch("/api/generate/config", {
          headers: origin,
          data: { defaultModel: "not/an-image-model" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await api.patch("/api/generate/config", {
          headers: origin,
          data: { defaultModel: "black-forest-labs/flux.2-pro" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await api.get("/api/generate/config")).json()).defaultModel,
    ).toBe("black-forest-labs/flux.2-pro");
    const file = {
      name: "photo.jpg",
      mimeType: "image/jpeg",
      buffer: await readFile("public/images/kitchen.jpg"),
    };
    for (const fields of [
      {
        projectType: "deck",
        style: "spa",
        model: "black-forest-labs/flux.2-pro",
      },
      {
        projectType: "other",
        style: "modern",
        model: "black-forest-labs/flux.2-pro",
        otherProject: "",
      },
      { projectType: "kitchen", style: "modern", model: "not/an-image-model" },
    ]) {
      expect(
        (
          await api.post("/api/generate", {
            headers: origin,
            multipart: {
              photo: file,
              ...fields,
              otherProject: fields.otherProject || "",
            },
          })
        ).status(),
      ).toBe(400);
    }
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    await page.route("**/api/generate", async (route) => {
      calls++;
      const body = route.request().postDataBuffer()!.toString();
      expect(body).toContain("kitchen");
      expect(body).toContain("coastal");
      expect(body).toContain("black-forest-labs/flux.2-pro");
      if (calls === 1) {
        await pending;
        await route.fulfill({
          status: 200,
          contentType: "image/jpeg",
          body: await readFile("public/images/kitchen.jpg"),
        });
      } else
        await route.fulfill({
          status: 402,
          json: { error: "The OpenRouter account needs more credits." },
        });
    });
    await page.goto("/?view=Generate");
    await expect(
      page
        .getByRole("combobox", { name: "Image model", exact: true })
        .locator("option:checked"),
    ).toContainText("FLUX.2 Pro");
    await page
      .getByLabel("Upload project photo")
      .setInputFiles("public/images/kitchen.jpg");
    await page
      .getByRole("combobox", { name: "Project type", exact: true })
      .selectOption("kitchen");
    await page.getByText("Coastal", { exact: true }).click();
    await page
      .getByRole("button", { name: "Generate preview", exact: true })
      .click();
    await expect(
      page.getByText("Creating your renovation preview"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Generating preview…" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    release!();
    await page.getByRole("button", { name: "Generate", exact: true }).click();
    await expect(
      page.getByAltText("Generated Kitchen · Coastal concept"),
    ).toBeVisible();
    await page
      .getByRole("slider", { name: "Before and after comparison" })
      .fill("70");
    await expect(
      page.getByAltText("Original space for comparison"),
    ).toHaveAttribute("style", /30%/);
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download" }).click();
    expect((await downloadEvent).suggestedFilename()).toBe(
      "premium-remodel-kitchen-coastal.jpg",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Generate another version" })
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "needs more credits",
    );
    await expect(page.getByRole("main").getByRole("alert")).toBeInViewport();
    await expect(
      page.getByAltText("Generated Kitchen · Coastal concept"),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "test-results/generate-result.png",
      fullPage: true,
      animations: "disabled",
    });
    const { data: profile } = await company.admin
      .from("profiles")
      .select("id")
      .eq("organization_id", company.organizationId)
      .eq("email", company.email)
      .single();
    expect(
      (
        await company.admin
          .from("profiles")
          .update({ role: "crew" })
          .eq("id", profile!.id)
      ).error,
    ).toBeNull();
    expect(
      (
        await api.patch("/api/generate/config", {
          headers: origin,
          data: { defaultModel: "openai/gpt-image-2" },
        })
      ).status(),
    ).toBe(403);
  },
);
