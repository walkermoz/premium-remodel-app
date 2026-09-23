import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { validateStoredFile } from "../lib/validate-file";
import { checkFileSelection, MAX_FILE_SIZE } from "../lib/file-policy";

const asFile = (name: string, mime: string, bytes: Uint8Array | string) =>
  new File([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], name, {
    type: mime,
  });
test("uploads enforce an allowlist, verify content and rewrite photos without appended data", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    const image = await sharp({
      create: { width: 20, height: 12, channels: 3, background: "#6292b0" },
    })
      .withMetadata()
      .toFormat(format)
      .toBuffer();
    const uploaded = await validateStoredFile(
      asFile(
        `photo.${format}`,
        `image/${format}`,
        Buffer.concat([image, Buffer.from("harmless-appended-test-payload")]),
      ),
    );
    expect(uploaded.validationVersion).toBe(1);
    expect(
      uploaded.bytes.includes(Buffer.from("harmless-appended-test-payload")),
    ).toBe(false);
    expect((await sharp(uploaded.bytes).metadata()).exif).toBeUndefined();
  }
  const text = await validateStoredFile(
    asFile("job.txt", "", "Job notes\nCafé tile measurements."),
  );
  expect(text.mime).toBe("text/plain");
  for (const name of [
    "run.exe",
    "run.exe.jpg",
    "file.svg",
    "file.html",
    "file.zip",
    "file.docx",
    "file.xlsx",
    "file.csv",
    "file.constructor",
    "file.ps1",
    "file.jpg\u202eexe",
    "../file.txt",
  ]) {
    expect(() => checkFileSelection({ name, size: 5, type: "" })).toThrow();
  }
  expect(() =>
    checkFileSelection({
      name: "photo.jpg",
      size: MAX_FILE_SIZE + 1,
      type: "image/jpeg",
    }),
  ).toThrow(/4 MB/);
  await expect(
    validateStoredFile(asFile("photo.jpg", "image/jpeg", "not a photo")),
  ).rejects.toThrow();
  await expect(
    validateStoredFile(
      asFile("photo.jpg", "image/jpeg", new Uint8Array([255, 216, 255, 0])),
    ),
  ).rejects.toThrow(/valid, still/);
  await expect(
    validateStoredFile(asFile("photo.png", "text/plain", "text")),
  ).rejects.toThrow(/extension/);
  await expect(
    validateStoredFile(
      asFile("binary.txt", "text/plain", new Uint8Array([77, 90, 0, 255])),
    ),
  ).rejects.toThrow();
});

test("static PDFs pass; active, embedded, corrupt and appended content is rejected", async () => {
  const normal = await PDFDocument.create();
  normal.addPage().drawText("Remodel measurements");
  const good = await normal.save();
  const validated = await validateStoredFile(
    asFile("measurements.pdf", "application/pdf", good),
  );
  expect((await PDFDocument.load(validated.bytes)).getPageCount()).toBe(1);
  const script = await PDFDocument.create();
  script.addPage();
  script.addJavaScript("test", "app.alert('Test only')");
  await expect(
    validateStoredFile(
      asFile("script.pdf", "application/pdf", await script.save()),
    ),
  ).rejects.toThrow(/static PDF/);
  const embedded = await PDFDocument.create();
  embedded.addPage();
  await embedded.attach(
    new TextEncoder().encode("test attachment"),
    "test.txt",
  );
  await expect(
    validateStoredFile(
      asFile("embedded.pdf", "application/pdf", await embedded.save()),
    ),
  ).rejects.toThrow(/static PDF/);
  const action = await PDFDocument.create();
  action.addPage();
  action.catalog.set(
    PDFName.of("OpenAction"),
    action.context.obj({
      S: PDFName.of("URI"),
      URI: PDFString.of("https://example.com"),
    }),
  );
  await expect(
    validateStoredFile(
      asFile("action.pdf", "application/pdf", await action.save()),
    ),
  ).rejects.toThrow(/static PDF/);
  const form = await PDFDocument.create();
  form.addPage();
  form.getForm().createTextField("field");
  await expect(
    validateStoredFile(
      asFile("form.pdf", "application/pdf", await form.save()),
    ),
  ).rejects.toThrow(/static PDF/);
  await expect(
    validateStoredFile(
      asFile("fake.pdf", "application/pdf", "%PDF-1.7\ninvalid\n%%EOF"),
    ),
  ).rejects.toThrow();
  await expect(
    validateStoredFile(
      asFile(
        "extra.pdf",
        "application/pdf",
        Buffer.concat([good, Buffer.from("payload")]),
      ),
    ),
  ).rejects.toThrow(/trailing/);
});
