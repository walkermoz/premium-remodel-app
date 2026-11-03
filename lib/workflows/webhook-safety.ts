const blockedHostnames = new Set(["localhost", "localhost.localdomain"]);

function blockedIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function blockedIpv6(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLocaleLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("64:ff9b:") ||
    normalized.startsWith("100:") ||
    normalized.startsWith("2001:db8:") ||
    /^2001:0{0,3}[1-1][0-9a-f]:/.test(normalized) ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("fec") ||
    normalized.startsWith("ff")
  );
}

export function isPublicWorkflowWebhookUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase().replace(/\.$/, "");
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      !blockedHostnames.has(hostname) &&
      !hostname.endsWith(".localhost") &&
      !hostname.endsWith(".local") &&
      !hostname.endsWith(".internal") &&
      !blockedIpv4(hostname) &&
      !blockedIpv6(hostname)
    );
  } catch {
    return false;
  }
}

export function isSensitiveWorkflowHeader(name: string) {
  return /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|host|content-length|transfer-encoding|connection|te|trailer|upgrade|expect)$/i.test(
    name.trim(),
  );
}
