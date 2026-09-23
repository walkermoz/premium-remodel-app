import sharp from "sharp";
import {
  PDFDocument,
  PDFDict,
  PDFArray,
  PDFName,
  PDFRawStream,
  PDFInvalidObject,
  type PDFObject,
} from "pdf-lib";
import {
  checkFileSelection,
  checkFileContents,
  MAX_FILE_SIZE,
  FILE_VALIDATION_VERSION,
} from "./file-policy";

const blockedPdfNames = new Set([
  "A",
  "AA",
  "OpenAction",
  "JS",
  "JavaScript",
  "Launch",
  "EmbeddedFiles",
  "EmbeddedFile",
  "Filespec",
  "EF",
  "AF",
  "RichMedia",
  "RichMediaContent",
  "RichMediaSettings",
  "XFA",
  "AcroForm",
  "Collection",
  "Movie",
  "Sound",
  "Rendition",
  "3D",
  "3DD",
  "PS",
  "Crypt",
]);
const pdfError =
  "Use a static PDF without scripts, forms, embedded files, or interactive actions.";

async function validatePdf(bytes: Buffer) {
  if (!/%%EOF\s*$/.test(bytes.subarray(-1024).toString("latin1")))
    throw new Error("This PDF is incomplete or has unsupported trailing data.");
  const pdf = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    throwOnInvalidObject: true,
    updateMetadata: false,
  });
  if (pdf.isEncrypted || pdf.getPageCount() < 1 || pdf.getPageCount() > 200)
    throw new Error("Use an unencrypted PDF with 1–200 pages.");
  const objects = pdf.context.enumerateIndirectObjects();
  if (objects.length > 20000)
    throw new Error("This PDF is too complex. Export a simpler PDF.");
  const seen = new Set<PDFObject>();
  function inspect(object: PDFObject, depth = 0) {
    if (depth > 50 || object instanceof PDFInvalidObject)
      throw new Error(pdfError);
    if (seen.has(object)) return;
    seen.add(object);
    if (object instanceof PDFName && blockedPdfNames.has(object.decodeText()))
      throw new Error(pdfError);
    if (object instanceof PDFRawStream) {
      // External stream files must never be opened by a PDF reader.
      if (object.dict.has(PDFName.of("F"))) throw new Error(pdfError);
      inspect(object.dict, depth + 1);
    } else if (object instanceof PDFDict) {
      for (const [key, value] of object.entries()) {
        if (blockedPdfNames.has(key.decodeText())) throw new Error(pdfError);
        inspect(value, depth + 1);
      }
    } else if (object instanceof PDFArray) {
      for (const value of object.asArray()) inspect(value, depth + 1);
    }
  }
  inspect(pdf.catalog);
  for (const [, object] of objects) inspect(object);
  // Reserialize parsed objects so unparsed appended payloads are not retained.
  return Buffer.from(
    await pdf.save({
      useObjectStreams: false,
      addDefaultPage: false,
      updateFieldAppearances: false,
    }),
  );
}

export async function validateStoredFile(file: File) {
  const info = checkFileSelection(file);
  let bytes = Buffer.from(await file.arrayBuffer());
  checkFileContents(bytes, info.mime);
  if (info.mime.startsWith("image/")) {
    try {
      const image = sharp(bytes, {
        failOn: "warning",
        limitInputPixels: 40_000_000,
      });
      const metadata = await image.metadata();
      const format =
        info.mime === "image/jpeg"
          ? "jpeg"
          : info.mime === "image/png"
            ? "png"
            : "webp";
      if (metadata.format !== format || (metadata.pages ?? 1) !== 1)
        throw new Error("Unsupported image");
      bytes = await image
        .rotate()
        .toFormat(format)
        .timeout({ seconds: 10 })
        .toBuffer();
    } catch {
      throw new Error(
        "Use a valid, still JPG, PNG, or WebP image up to 40 megapixels.",
      );
    }
  } else if (info.mime === "application/pdf") {
    try {
      bytes = await validatePdf(bytes);
    } catch (error) {
      if (error instanceof Error && /^(Use |This PDF)/.test(error.message))
        throw error;
      throw new Error(
        "This PDF could not be safely read. Export it as a new static PDF and try again.",
      );
    }
  }
  if (bytes.length > MAX_FILE_SIZE)
    throw new Error("The processed file exceeds 4 MB. Choose a smaller file.");
  return { ...info, bytes, validationVersion: FILE_VALIDATION_VERSION };
}
