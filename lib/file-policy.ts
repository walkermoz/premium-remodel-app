export const MAX_FILE_SIZE = 4 * 1024 * 1024;
export const FILE_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.txt";
export const FILE_TYPES_LABEL = "JPG, PNG, WebP, PDF or TXT";
export const FILE_VALIDATION_VERSION = 1;
const types: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
};

export function checkFileSelection(file: Pick<File, "name" | "size" | "type">) {
  if (!file.size || file.size > MAX_FILE_SIZE)
    throw new Error("Choose a nonempty file up to 4 MB.");
  const name = file.name.normalize("NFKC");
  const extension = name.split(".").pop()?.toLowerCase() || "";
  const mime = Object.hasOwn(types, extension) ? types[extension] : undefined;
  if (
    !mime ||
    !name.includes(".") ||
    /[\x00-\x1f\x7f/\\\u202a-\u202e\u2066-\u2069]/.test(name) ||
    /\.(exe|com|msi|dll|bat|cmd|ps1|vbs|js|jse|scr|hta|html?|svg|jar|zip|docm|xlsm)(\.|$)/i.test(
      name,
    )
  )
    throw new Error(`Unsupported file. Use ${FILE_TYPES_LABEL}.`);
  if (
    file.type &&
    file.type !== "application/octet-stream" &&
    file.type !== mime
  )
    throw new Error(
      "The file type does not match its extension. Choose the original supported file.",
    );
  const stem =
    name
      .slice(0, -(extension.length + 1))
      .replace(/[^a-zA-Z0-9 ._-]/g, "_")
      .replace(/^[ .-]+/, "")
      .slice(0, 130) || "attachment";
  return { mime, extension, name: `${stem}.${extension}` };
}

export function checkFileContents(bytes: Uint8Array, mime: string) {
  const prefix = new TextDecoder("latin1").decode(bytes.subarray(0, 16));
  const matches =
    mime === "image/jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : mime === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10].every(
            (value, index) => bytes[index] === value,
          )
        : mime === "image/webp"
          ? prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP"
          : mime === "application/pdf"
            ? /^%PDF-[12]\.\d/.test(prefix)
            : mime === "text/plain";
  if (!matches)
    throw new Error(
      "This file's contents do not match its type. Choose a valid supported file.",
    );
  if (mime === "text/plain") {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("Text files must contain valid UTF-8 plain text.");
    }
    if (
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) ||
      /^(MZ|PK\x03\x04|%PDF-)/.test(text)
    )
      throw new Error("Binary files cannot be uploaded as plain text.");
  }
}

export async function checkUploadFile(file: File) {
  const info = checkFileSelection(file);
  checkFileContents(new Uint8Array(await file.arrayBuffer()), info.mime);
  return info;
}
