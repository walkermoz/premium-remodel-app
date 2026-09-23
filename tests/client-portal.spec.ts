import sharp from "sharp";
import { test, expect, password } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };

cloudTest(
  "an administrator can rotate and disable a client-safe project link",
  async ({ company, page, request, browser }) => {
    expect(
      (
        await request.post("/api/client-links", {
          headers: origin,
          data: { projectId: "00000000-0000-4000-8000-000000000000" },
        })
      ).status(),
    ).toBe(401);

    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers: origin,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);

    const create = async (kind: string, data: Record<string, unknown>) => {
      const response = await api.post("/api/workspace", {
        headers: origin,
        data: { kind, data },
      });
      expect(response.status()).toBe(201);
      return response.json();
    };

    const project = await create("project", {
      name: "Willowbrook kitchen",
      address: "1214 Willowbrook Drive, Cary, NC",
      client: "Private Client Name",
      clientEmail: "private-client@example.com",
      clientPhone: "+19195550123",
      startDate: "2026-09-01",
      endDate: "2026-10-30",
      completedDate: "",
      status: "In progress",
      description: "A brighter kitchen with improved storage and new finishes.",
      category: "Kitchen",
      cover: "/images/kitchen.jpg",
    });

    const coverPhoto = await sharp({
      create: {
        width: 320,
        height: 220,
        channels: 3,
        background: "#6f95a8",
      },
    })
      .jpeg()
      .toBuffer();
    const photoResponse = await api.post("/api/files", {
      headers: origin,
      multipart: {
        projectId: project.id,
        file: {
          name: "selected-cover.jpg",
          mimeType: "image/jpeg",
          buffer: coverPhoto,
        },
      },
    });
    expect(photoResponse.status()).toBe(201);
    const photo = await photoResponse.json();
    const legacyPhoto = { ...photo };
    delete legacyPhoto.validationVersion;
    const legacyUpdate = await company.admin
      .from("remodel_records")
      .update({ data: legacyPhoto })
      .eq("organization_id", company.organizationId)
      .eq("id", photo.id);
    expect(legacyUpdate.error).toBeNull();
    await page.goto(
      `/?view=Projects&project=${project.id}&tab=Photos+%26+files`,
    );
    await page.getByRole("button", { name: "Set cover" }).click();
    await expect(page.getByText("Project cover")).toBeVisible();
    await expect
      .poll(async () => {
        const result = await company.admin
          .from("remodel_records")
          .select("data")
          .eq("organization_id", company.organizationId)
          .eq("id", photo.id)
          .single();
        return result.data?.data.validationVersion;
      })
      .toBe(1);
    await page.goto("/?view=Projects");
    await expect(
      page
        .locator(".project-card")
        .filter({ hasText: "Willowbrook kitchen" })
        .locator(".project-cover img"),
    ).toHaveAttribute("src", `/api/files?id=${photo.id}`);

    await create("task", {
      projectId: project.id,
      title: "Cabinet installation",
      description: "Internal installation details should stay private.",
      contractorId: "",
      dueDate: "2026-09-19",
      workType: "Contractor visit",
      startTime: "08:00",
      endTime: "12:00",
      priority: "High",
      status: "Done",
    });
    await create("task", {
      projectId: project.id,
      title: "Countertop template",
      description: "Internal vendor instructions should stay private.",
      contractorId: "",
      dueDate: "2026-09-24",
      workType: "Contractor visit",
      startTime: "10:30",
      endTime: "11:30",
      priority: "Medium",
      status: "In progress",
    });
    await create("scope", {
      projectId: project.id,
      title: "Private cost line",
      quantity: 1,
      unit: "allowance",
      estimate: 987654.32,
      subCost: 876543.21,
      materialCost: 765432.1,
      contractorId: "",
      status: "In progress",
    });
    await create("comment", {
      projectId: project.id,
      body: "Internal note: client requested a confidential change.",
      attachmentIds: [],
    });

    const generated = await api.post("/api/client-links", {
      headers: origin,
      data: { projectId: project.id },
    });
    expect(generated.status()).toBe(201);
    const first = await generated.json();
    expect(first.active).toBe(true);
    expect(first.url).toMatch(/^http:\/\/localhost:3100\/client\//);

    const clientContext = await browser.newContext();
    const clientPage = await clientContext.newPage();
    await clientPage.goto(first.url);
    await expect(clientPage.getByRole("heading", { level: 1 })).toHaveText(
      "Willowbrook kitchen",
    );
    await expect(clientPage.getByText("Cabinet installation")).toBeVisible();
    await expect(clientPage.getByText("Countertop template")).toBeVisible();
    await expect(
      clientPage.getByRole("heading", { name: "What’s next" }),
    ).toBeVisible();
    await expect(clientPage.getByText("Sep 1, 2026")).toBeVisible();
    await expect(clientPage.getByText("Oct 30, 2026")).toBeVisible();
    await expect(
      clientPage.getByAltText("Willowbrook kitchen project"),
    ).toHaveCount(0);
    const clientToken = new URL(first.url).pathname.split("/").at(-1)!;
    const publicCover = await clientContext.request.get(
      new URL(`/api/client-cover/${clientToken}`, first.url).toString(),
    );
    expect(publicCover.status()).toBe(200);
    expect(publicCover.headers()["content-type"]).toBe("image/jpeg");
    await expect(clientPage.getByText("Private Client Name")).toHaveCount(0);
    await expect(
      clientPage.getByText("private-client@example.com"),
    ).toHaveCount(0);
    await expect(clientPage.getByText("987,654.32")).toHaveCount(0);
    await expect(
      clientPage.getByText(
        "Internal installation details should stay private.",
      ),
    ).toHaveCount(0);
    await expect(
      clientPage.getByText(
        "Internal note: client requested a confidential change.",
      ),
    ).toHaveCount(0);
    const current = await (
      await api.get(`/api/client-links?projectId=${project.id}`)
    ).json();
    expect(current.url).toBe(first.url);
    expect(current.viewCount).toBeGreaterThanOrEqual(1);

    const rotatedResponse = await api.post("/api/client-links", {
      headers: origin,
      data: { projectId: project.id, rotate: true },
    });
    expect(rotatedResponse.status()).toBe(200);
    const rotated = await rotatedResponse.json();
    expect(rotated.url).not.toBe(first.url);
    expect((await clientContext.request.get(first.url)).status()).toBe(404);
    expect((await clientContext.request.get(rotated.url)).status()).toBe(200);

    expect(
      (
        await api.delete("/api/client-links", {
          headers: origin,
          data: { projectId: project.id },
        })
      ).status(),
    ).toBe(200);
    expect((await clientContext.request.get(rotated.url)).status()).toBe(404);
    await clientContext.close();
  },
);
