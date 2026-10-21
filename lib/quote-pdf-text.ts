/** Read a PDF locally so large proposals never hit the server upload limit. */
export async function readQuotePdf(file: File): Promise<string[]> {
  if (
    !/\.pdf$/i.test(file.name) ||
    (file.type &&
      !["application/pdf", "application/octet-stream"].includes(file.type))
  )
    throw new Error("Choose a PDF proposal.");
  if (!file.size || file.size > 20 * 1024 * 1024)
    throw new Error("Choose a PDF up to 20 MB.");
  const data = new Uint8Array(await file.arrayBuffer());
  if (
    !new TextDecoder("latin1").decode(data.subarray(0, 8)).startsWith("%PDF-")
  )
    throw new Error("This file is not a valid PDF.");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const document = await pdfjs.getDocument({ data }).promise;
  try {
    if (document.numPages > 25)
      throw new Error("Choose a proposal of 25 pages or fewer.");
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter(
        (item): item is typeof item & { str: string; transform: number[] } =>
          "str" in item && Boolean(item.str),
      );
      const lines: { y: number; parts: { x: number; text: string }[] }[] = [];
      for (const item of items) {
        const y = item.transform[5];
        let line = lines.find((candidate) => Math.abs(candidate.y - y) < 2);
        if (!line) {
          line = { y, parts: [] };
          lines.push(line);
        }
        line.parts.push({ x: item.transform[4], text: item.str });
      }
      pages.push(
        lines
          .sort((a, b) => b.y - a.y)
          .map((line) =>
            line.parts
              .sort((a, b) => a.x - b.x)
              .map((part) => part.text.trim())
              .filter(Boolean)
              .join(" "),
          )
          .join("\n"),
      );
    }
    if (pages.join("").trim().length < 100)
      throw new Error(
        "This PDF has no selectable text. A scanned proposal needs OCR before importing.",
      );
    return pages;
  } finally {
    await document.destroy();
  }
}
