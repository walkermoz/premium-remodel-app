import { expect, test } from "@playwright/test";

test("quote to project demo shows the full handoff flow", async ({ page }) => {
  await page.goto(
    "/demo?scenario=quote-project-handoff&view=Quotes&project=quote-project-handoff-demo",
  );

  await expect(
    page.getByRole("heading", { name: "Willowbrook kitchen remodel" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Send & complete" }),
  ).toBeVisible();
  await expect(page.getByText("Sent to taylor@example.com")).toBeVisible();
  await expect(page.getByText("Quote and agreement available")).toBeVisible();
  await expect(page.getByText("1 of 4 complete")).toBeVisible();

  const workflow = page.getByRole("navigation", { name: "Quote workflow" });
  await expect(
    workflow.getByRole("button", { name: /Create project/ }),
  ).toBeDisabled();
  const quoteStep = workflow.getByRole("button", { name: /Quote & pricing/ });
  await quoteStep.click();
  await expect(quoteStep).toHaveAttribute("aria-current", "step");
  await expect(
    page.getByRole("heading", { name: "Scope & pricing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Master services agreement" }),
  ).toHaveCount(0);
  await workflow.getByRole("button", { name: /Agreement details/ }).click();
  await expect(
    page.getByRole("heading", { name: "Agreement details" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Master services agreement" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue to send & complete" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Send & complete" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Signature options" }).click();
  const quoteSignature = page.getByRole("form", {
    name: "Complete quote signature",
  });
  await expect(
    quoteSignature.getByRole("button", { name: /Sign on service tablet/ }),
  ).toBeVisible();
  await expect(
    quoteSignature.getByRole("button", { name: /Mark signed in person/ }),
  ).toBeVisible();
  await quoteSignature
    .getByRole("button", { name: /Sign on service tablet/ })
    .click();
  await quoteSignature.getByRole("checkbox").check();
  await quoteSignature.getByRole("button", { name: "Save signature" }).click();

  await expect(page.getByText("2 of 4 complete")).toBeVisible();
  await page.getByRole("button", { name: "Signature options" }).click();
  const agreementSignature = page.getByRole("form", {
    name: "Complete service agreement signature",
  });
  await agreementSignature
    .getByRole("button", { name: /Mark signed in person/ })
    .click();
  await agreementSignature
    .getByRole("button", { name: "Save signature" })
    .click();

  await expect(page.getByText("3 of 4 complete")).toBeVisible();
  await page.getByRole("button", { name: "Deposit options" }).click();
  const deposit = page.getByRole("form", { name: "Record customer deposit" });
  await expect(
    deposit.getByRole("button", { name: /Record check/ }),
  ).toBeVisible();
  await deposit.getByRole("button", { name: /Record check/ }).click();
  await deposit.getByLabel("Check number").fill("1842");
  await deposit.getByRole("button", { name: "Record deposit" }).click();

  await expect(page.getByText("4 of 4 complete")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Project setup" }),
  ).toBeVisible();
  await expect(
    workflow.getByRole("button", { name: /Create project/ }),
  ).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: "Review project setup" }).click();
  const review = page.getByRole("form", {
    name: "Create project from quote",
  });
  await expect(review.getByLabel("Project name")).toHaveValue(
    "Willowbrook kitchen remodel",
  );
  await expect(review).toContainText("Taylor Reed");
  await expect(review).toContainText("$42,000");

  await review.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("PROJECT CREATED")).toBeVisible();
  const carriedItems = page.getByRole("region", {
    name: "Items carried from quote",
  });
  await expect(
    carriedItems.getByText("Cabinetry and installation"),
  ).toBeVisible();
  await expect(carriedItems.getByText("Quartz countertops")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review items" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add tasks" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Set schedule" }),
  ).toBeVisible();
});
