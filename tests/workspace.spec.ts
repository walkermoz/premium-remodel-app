import { test, expect, password } from "./supabase-fixture";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
const origin = { Origin: "http://localhost:3100" };
const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;

cloudTest(
  "company workflow persists records and enforces access",
  async ({ page, browser, request, company }) => {
    expect((await request.get("/api/workspace")).status()).toBe(401);
    expect((await request.get("/api/files?id=missing")).status()).toBe(401);
    await page.goto("/login");
    await page.getByLabel("Work email").fill(company.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Project overview." }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your next project starts here" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Contractors", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add contractor", exact: true })
      .first()
      .click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Contact name").fill("Test Flooring Lead");
    await dialog.getByLabel("Company", { exact: true }).fill("Flooring Co.");
    await dialog.getByLabel("Trade", { exact: true }).fill("Flooring");
    await dialog
      .getByLabel("Email", { exact: true })
      .fill("flooring@example.com");
    await dialog.getByRole("button", { name: "Create contractor" }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await page.getByRole("button", { name: "New project" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Project name").fill("Real test kitchen");
    await dialog.getByLabel("Job address").fill("100 Test Lane, Raleigh, NC");
    await dialog.getByLabel("Client name").fill("Test Client");
    await expect(dialog.getByLabel("Contract price ($)")).toHaveCount(0);
    await dialog.getByLabel("Start date").fill("2026-09-01");
    await dialog.getByLabel("Target completion").fill("2026-10-01");
    await dialog
      .getByLabel("Full scope of work")
      .fill("Flooring, countertops, and electrical.");
    await expect(dialog.getByLabel("Assigned contractor")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Create project" }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("heading", { name: "Real test kitchen" }).click();
    await expect(
      page.getByRole("heading", { name: "Project brief" }),
    ).toBeVisible();
    for (const item of [
      {
        title: "Flooring LVP",
        qty: "1000",
        estimate: "5000",
        sub: "3000",
        unit: "sq ft",
      },
      {
        title: "Countertops",
        qty: "40",
        estimate: "8000",
        sub: "6000",
        unit: "sq ft",
      },
      {
        title: "Electrical",
        qty: "1",
        estimate: "4000",
        sub: "2000",
        unit: "job",
      },
    ]) {
      await page.getByRole("button", { name: "Add item", exact: true }).click();
      dialog = page.getByRole("dialog");
      await dialog.getByLabel("Work item", { exact: true }).fill(item.title);
      await dialog.getByLabel("Quantity", { exact: true }).fill(item.qty);
      await dialog
        .getByRole("combobox", { name: "Unit", exact: true })
        .selectOption(item.unit);
      await dialog.getByLabel("Price · total ($)").fill(item.estimate);
      await dialog.getByLabel("Subcontractor cost · total ($)").fill(item.sub);
      await dialog
        .getByLabel("Subcontractor for cost estimate")
        .selectOption({ label: "Test Flooring Lead · Flooring" });
      await dialog.getByRole("button", { name: "Create scope item" }).click();
      await expect(dialog).not.toBeVisible();
    }
    await expect(page.locator("tfoot")).toContainText("$17,000");
    await expect(page.locator("tfoot")).toContainText("$11,000");
    await expect(page.locator("tfoot")).toContainText("$6,000");
    await page.getByRole("tab", { name: /^Notes/ }).click();
    const jobNotes = page.getByRole("region", { name: "Job notes" });
    await jobNotes
      .getByLabel("New job note")
      .fill("Client prefers warm white grout. Confirm before ordering.");
    await jobNotes
      .getByRole("button", { name: "Add note", exact: true })
      .click();
    await expect(jobNotes.getByRole("article")).toContainText(
      "Client prefers warm white grout.",
    );
    await page.reload();
    await expect(jobNotes.getByRole("article")).toContainText(
      "Client prefers warm white grout.",
    );
    await page.getByRole("tab", { name: /^Upcoming/ }).click();
    await page.getByRole("button", { name: "List", exact: true }).click();
    await page
      .getByRole("button", { name: "Add work", exact: true })
      .first()
      .click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Work title").fill("Install new flooring");
    await dialog.getByLabel("Due date").fill("2026-09-08");
    await dialog
      .getByLabel("Assigned contractor")
      .selectOption({ label: "Test Flooring Lead · Flooring" });
    await dialog.getByRole("button", { name: "Create work" }).click();
    await expect(dialog).not.toBeVisible();
    await page
      .getByRole("button", {
        name: "Complete Install new flooring",
        exact: true,
      })
      .click();
    await page
      .getByRole("combobox", { name: "Work status" })
      .selectOption("Completed");
    await expect(
      page.getByRole("button", { name: "Reopen Install new flooring" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: /^Activity/ }).click();
    await page
      .getByRole("button", { name: "Log activity", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("textbox", { name: "Update", exact: true })
      .fill("Flooring is complete. Ready for countertops.");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Log activity", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByText("Flooring is complete. Ready for countertops."),
    ).toBeVisible();
    await page.getByRole("tab", { name: /^Photos & files/ }).click();
    await page
      .getByRole("tabpanel", { name: /^Photos & files/ })
      .locator('.files-panel input[type="file"]')
      .setInputFiles({
        name: "site-photo.png",
        mimeType: "image/png",
        buffer: await sharp({
          create: { width: 8, height: 8, channels: 3, background: "#7298ac" },
        })
          .png()
          .toBuffer(),
      });
    await expect(
      page.getByText("site-photo.png", { exact: true }),
    ).toBeVisible();
    const data = await (await page.request.get("/api/workspace")).json();
    const project = data.projects[0],
      attachment = data.attachments[0];
    expect(project).not.toHaveProperty("contractorId");
    expect(data.comments).toHaveLength(1);
    expect(data.comments[0]).toMatchObject({
      projectId: project.id,
      authorName: "Workspace Owner",
      body: "Client prefers warm white grout. Confirm before ordering.",
    });
    expect(data.tasks[0].contractorId).toBe(data.contractors[0].id);
    const fileResponse = await page.request.get(
      `/api/files?id=${attachment.id}`,
    );
    expect(fileResponse.status()).toBe(200);
    expect(fileResponse.headers()["cache-control"]).toBe("private, no-store");
    expect((await request.get(`/api/files?id=${attachment.id}`)).status()).toBe(
      401,
    );
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export sheet" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      "Real-test-kitchen-job-master.csv",
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Real test kitchen" }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /^Photos & files/ }),
    ).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await expect(page.locator("tfoot")).toContainText("$11,000");
    // Stale updates must not overwrite another teammate's work.
    const update = await page.request.patch("/api/workspace", {
      headers: origin,
      data: {
        kind: "project",
        id: project.id,
        updatedAt: project.updatedAt,
        data: {
          ...project,
          name: "Kitchen updated by teammate",
          // Old browser data must not reintroduce a project-level assignment.
          contractorId: "legacy-project-assignment",
        },
      },
    });
    expect(update.status()).toBe(200);
    expect(await update.json()).not.toHaveProperty("contractorId");
    expect(
      (
        await page.request.patch("/api/workspace", {
          headers: origin,
          data: {
            kind: "project",
            id: project.id,
            updatedAt: project.updatedAt,
            data: project,
          },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await page.request.patch("/api/workspace", {
          headers: { Origin: "https://untrusted.example" },
          data: { kind: "project", id: project.id, data: project },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/auth", {
          headers: origin,
          data: {
            action: "setup",
            name: "Attacker",
            email: "second@example.com",
            password,
          },
        })
      ).status(),
    ).toBe(400);
    // Invalid dates and negative amounts are rejected on the server.
    expect(
      (
        await page.request.post("/api/workspace", {
          headers: origin,
          data: {
            kind: "project",
            data: { ...project, startDate: "2026-02-31" },
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.post("/api/workspace", {
          headers: origin,
          data: { kind: "scope", data: { ...data.scope[0], subCost: -10 } },
        })
      ).status(),
    ).toBe(400);
    // Invite another user, and prove their separate session sees the same company records.
    await page.getByRole("button", { name: "Team", exact: true }).click();
    await page.getByRole("button", { name: "Invite teammate" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Work email").fill(company.memberEmail);
    await dialog.getByLabel("Invitation delivery").selectOption("link");
    await dialog
      .getByRole("button", { name: "Invite teammate", exact: true })
      .click();
    const invitation = await dialog
      .getByLabel("Share this link with your teammate")
      .inputValue();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    const memberContext = await browser.newContext();
    const member = await memberContext.newPage();
    await member.goto(invitation);
    await member.getByRole("button", { name: "Accept invitation" }).click();
    await member.getByLabel("Full name").fill("Team Member");
    await member.getByLabel("Password", { exact: true }).fill(password);
    await member.getByLabel("Confirm password", { exact: true }).fill(password);
    await member.getByRole("button", { name: "Join workspace" }).click();
    await expect(
      member.getByRole("heading", { name: "Kitchen updated by teammate" }),
    ).toBeVisible();
    await member
      .getByRole("heading", { name: "Kitchen updated by teammate" })
      .click();
    await member.getByRole("tab", { name: /^Notes/ }).click();
    const sharedNotes = member.getByRole("region", { name: "Job notes" });
    await expect(sharedNotes).toContainText("Client prefers warm white grout.");
    await expect(
      sharedNotes.getByRole("button", { name: "Delete note", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await member.request.delete("/api/files", {
          headers: origin,
          data: { id: attachment.id },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await member.request.put("/api/auth", {
          headers: origin,
          data: { email: "unauthorized@example.com" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await member.request.get(`/api/files?id=${attachment.id}`)).status(),
    ).toBe(200);
    const members = await (await page.request.get("/api/auth")).json();
    const memberId = members.members.find(
      (m: { email: string }) => m.email === company.memberEmail,
    ).id;
    expect(
      (
        await page.request.delete("/api/auth", {
          headers: origin,
          data: { id: memberId },
        })
      ).status(),
    ).toBe(200);
    expect((await member.request.get("/api/workspace")).status()).toBe(401);
    await memberContext.close();
    expect(
      (
        await page.request.delete("/api/files", {
          headers: origin,
          data: { id: attachment.id },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await page.request.get(`/api/files?id=${attachment.id}`)).status(),
    ).toBe(404);
    // Direct Data API calls must not bypass author validation or company isolation.
    const direct = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    expect(
      (await direct.auth.signInWithPassword({ email: company.email, password }))
        .error,
    ).toBeNull();
    const allowed = await direct
      .from("remodel_records")
      .select("id")
      .eq("id", project.id);
    expect(allowed.error).toBeNull();
    expect(allowed.data).toHaveLength(1);
    const denied = await direct
      .from("remodel_records")
      .update({ data: { ...project, name: "FORGED" } })
      .eq("id", project.id);
    expect(denied.error).not.toBeNull();
    const foreign = await direct
      .from("remodel_records")
      .select("id")
      .neq("organization_id", company.organizationId);
    expect(foreign.data).toEqual([]);
    await direct.auth.signOut({ scope: "local" });
    // Password change revokes every old session; the new password can sign in.
    const oldSession = await browser.newContext();
    expect(
      (
        await oldSession.request.post("http://localhost:3100/api/auth", {
          headers: origin,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const newPassword = "A-new-long-passphrase-444!";
    expect(
      (
        await page.request.post("/api/auth", {
          headers: origin,
          data: {
            action: "password",
            current: password,
            password: newPassword,
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await oldSession.request.get("http://localhost:3100/api/workspace")
      ).status(),
    ).toBe(401);
    await oldSession.close();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
    await page.getByLabel("Work email").fill(company.email);
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Kitchen updated by teammate" }),
    ).toBeVisible();
  },
);

test("sample workspace filters, persists edits, and fits mobile screens", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/demo");
  await expect(page.locator(".project-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Planning", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.getByRole("button", { name: /^All projects/ }).click();
  await page.getByRole("textbox", { name: "Search projects" }).fill("oakwood");
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.locator(".list-view")).toBeVisible();
  await page.getByRole("heading", { name: "Oakwood kitchen remodel" }).click();
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project name").fill("My sample kitchen");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "My sample kitchen" }),
  ).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    for (const name of [
      /^Upcoming/,
      /^Scope & costs/,
      /^Photos & files/,
      /^Activity/,
    ]) {
      await page.getByRole("tab", { name }).click();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Contractors", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Contractors." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
