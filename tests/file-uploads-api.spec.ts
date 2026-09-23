import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { test, expect, password } from "./supabase-fixture";
const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const headers = { Origin: "http://localhost:3100" };

cloudTest(
  "company upload validation cannot be bypassed and note files stay scoped and deduplicated",
  async ({ company, page, request }) => {
    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const create = async (
      kind: string,
      data: Record<string, unknown>,
      requestId?: string,
    ) =>
      api.post("/api/workspace", { headers, data: { kind, data, requestId } });
    const projectData = {
      name: "Attachment test job",
      address: "",
      client: "Test client",
      startDate: "",
      endDate: "",
      description: "",
      category: "Kitchen",
      cover: "",
      status: "Planning",
    };
    const projectResponse = await create("project", projectData);
    expect(projectResponse.status(), await projectResponse.text()).toBe(201);
    const project = await projectResponse.json();
    const otherResponse = await create("project", {
      ...projectData,
      name: "Other job",
    });
    expect(otherResponse.status(), await otherResponse.text()).toBe(201);
    const other = await otherResponse.json();
    const upload = (name: string, mimeType: string, buffer: Buffer) =>
      api.post("/api/files", {
        headers,
        multipart: { projectId: project.id, file: { name, mimeType, buffer } },
      });
    const photo = await sharp({
      create: { width: 80, height: 50, channels: 3, background: "#5b819b" },
    })
      .jpeg()
      .toBuffer();
    const uploaded = await upload(
      "photo.jpg",
      "image/jpeg",
      Buffer.concat([photo, Buffer.from("appended-test-marker")]),
    );
    expect(uploaded.status()).toBe(201);
    const file = await uploaded.json();
    expect(file.validationVersion).toBe(1);
    const download = await api.get(`/api/files?id=${file.id}`);
    expect(download.status()).toBe(200);
    expect(
      (await download.body()).includes(Buffer.from("appended-test-marker")),
    ).toBe(false);
    expect(download.headers()["x-content-type-options"]).toBe("nosniff");
    expect(download.headers()["content-security-policy"]).toContain("sandbox");
    expect((await request.get(`/api/files?id=${file.id}`)).status()).toBe(401);
    for (const [name, mimeType, bytes] of [
      ["script.svg", "image/svg+xml", "<svg />"],
      ["run.exe.jpg", "image/jpeg", "fake"],
      ["fake.jpg", "image/jpeg", "fake"],
      ["fake.pdf", "application/pdf", "%PDF-1.7\ninvalid\n%%EOF"],
      ["fake.txt", "text/plain", "MZ\x00binary"],
      [
        "office.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "PK",
      ],
    ])
      expect((await upload(name, mimeType, Buffer.from(bytes))).status()).toBe(
        400,
      );
    const activePdf = await PDFDocument.create();
    activePdf.addPage();
    activePdf.addJavaScript("test", "app.alert('Test')");
    expect(
      (
        await upload(
          "active.pdf",
          "application/pdf",
          Buffer.from(await activePdf.save()),
        )
      ).status(),
    ).toBe(400);
    const normalPdf = await PDFDocument.create();
    normalPdf.addPage().drawText("Project measurements");
    const pdfResponse = await upload(
      "measurements.pdf",
      "application/pdf",
      Buffer.from(await normalPdf.save()),
    );
    expect(pdfResponse.status()).toBe(201);
    const pdf = await pdfResponse.json();
    const pdfDownload = await api.get(`/api/files?id=${pdf.id}`);
    expect(pdfDownload.headers()["content-disposition"]).toMatch(/^attachment/);
    const noteData = {
      projectId: project.id,
      body: "Photo and measurements",
      attachmentIds: [file.id, pdf.id],
      authorName: "Forged",
    };
    expect(
      (
        await create(
          "comment",
          { ...noteData, projectId: other.id },
          randomUUID(),
        )
      ).status(),
    ).toBe(400);
    expect(
      (
        await create(
          "comment",
          { ...noteData, attachmentIds: [randomUUID()] },
          randomUUID(),
        )
      ).status(),
    ).toBe(400);
    const id = randomUUID();
    const attempts = await Promise.all([
      create("comment", noteData, id),
      create("comment", noteData, id),
    ]);
    for (const attempt of attempts) expect(attempt.status()).toBe(201);
    const workspace = await (await api.get("/api/workspace")).json();
    expect(workspace.comments).toHaveLength(1);
    expect(workspace.attachments).toHaveLength(2);
    expect(workspace.comments[0]).toMatchObject({
      id,
      authorName: "Workspace Owner",
      attachmentIds: [file.id, pdf.id],
    });
    await page.goto(`/?view=Projects&project=${project.id}&tab=Notes`);
    const notes = page.getByRole("region", { name: "Job notes" });
    await expect(
      notes.getByRole("img", { name: "photo.jpg", exact: true }),
    ).toBeVisible();
    await expect(
      notes.getByRole("link", { name: "measurements.pdf" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: /Photos & files/ }).click();
    await expect(page.locator(".file-item")).toHaveCount(2);
    expect(
      (
        await api.delete("/api/workspace", {
          headers,
          data: { kind: "comment", id },
        })
      ).status(),
    ).toBe(200);
    expect((await api.get(`/api/files?id=${file.id}`)).status()).toBe(200);
  },
);
