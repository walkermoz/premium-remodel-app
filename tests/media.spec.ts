import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { naturalizeBlogText, sanitizeBlogDraft } from "../lib/blog-generation";
import {
  businessConfigSchema,
  defaultRoleNavigation,
  defaultRolePermissions,
} from "../lib/business-config-schema";
import { canOpenWorkspaceTab } from "../lib/workspace-tab-access";

test("blog cleanup removes dash punctuation and canned AI phrases", () => {
  expect(
    naturalizeBlogText(
      "In today's fast-paced world, we delve into planning—without the filler.",
    ),
  ).toBe("we look at planning, without the filler.");
  const draft = sanitizeBlogDraft({
    title: "A Better Plan—Without Surprises",
    slug: "",
    excerpt: "A practical overview—written for real homeowners.",
    metaDescription:
      "Plan a remodeling project with useful questions, clear priorities, and practical expectations before construction begins.",
    keywords: ["remodeling—planning", "home improvement"],
    bodyMarkdown:
      "A good plan starts with the problem—not the product. This guide explains the choices that matter before construction begins.\n\n## Start with daily life\n\nWrite down what is not working now. Consider storage, traffic, light, cleanup, and the way each person uses the room. Those details give the project a useful direction.\n\n## Set priorities\n\nSeparate the choices you need from the ones you simply like. Clear priorities make later tradeoffs easier and keep the project focused on the result that matters most.\n\n## Confirm the scope\n\nReview preparation, installation, cleanup, allowances, and exclusions. Ask questions before work begins so the written scope matches the plan you discussed.",
  });
  expect(JSON.stringify(draft)).not.toMatch(/[\u2013\u2014]/);
  expect(draft.slug).toBe("a-better-plan-without-surprises");
});

test("Media is an optional role-controlled business module", () => {
  const config = businessConfigSchema.parse({
    profile: { name: "Example Business" },
    features: {},
    modules: {},
    compliance: {},
    regional: { timezone: "America/New_York" },
    quotePreferences: {},
    navigation: defaultRoleNavigation().admin,
    roleNavigation: defaultRoleNavigation(),
    rolePermissions: defaultRolePermissions(),
  });
  expect(config.modules.media).toBe(true);
  expect(config.roleNavigation.admin).toContain("Media");
  expect(canOpenWorkspaceTab(config, "admin", "Media")).toBe(true);
  expect(
    canOpenWorkspaceTab(
      { ...config, modules: { ...config.modules, media: false } },
      "admin",
      "Media",
    ),
  ).toBe(false);
  expect(config.roleNavigation.doorknocker).not.toContain("Media");
});

test("blog generation is authenticated, origin checked, rate limited, and organization branded", () => {
  const route = readFileSync("app/api/media/blog/route.ts", "utf8");
  expect(route).toContain("checkOrigin(request)");
  expect(route).toContain("await requireUser()");
  expect(route).toContain('requireWorkspaceTabs(user, "Media")');
  expect(route).toContain("limitAttempts(`media-blog:");
  expect(route).toContain("process.env.OPENROUTER_API_KEY");
  expect(route).toContain("business.profile.name");
  expect(route).toContain("Never use em dashes or en dashes");
});

test("Media generates a natural-voice editable blog in the demo workspace", async ({
  page,
}) => {
  await page.goto("/demo?view=Media");
  await expect(page.getByRole("heading", { name: "Media." })).toBeVisible();
  await page
    .getByLabel("Topic")
    .fill("What to expect during a kitchen remodel");
  await page.getByRole("button", { name: "Generate blog" }).click();
  await expect(
    page.getByRole("heading", {
      name: "What to expect during a kitchen remodel: What Homeowners Should Know",
    }),
  ).toBeVisible();
  await expect(page.getByText("Natural voice applied")).toBeVisible();
  await expect(page.locator(".media-article-preview")).not.toContainText("—");
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Article")).toBeVisible();
  await expect(page.getByLabel("Meta description")).toBeVisible();
});
