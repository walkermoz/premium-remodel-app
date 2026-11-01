const blockedHostnames = new Set(["localhost", "localhost.localdomain"]);

function blockedIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function blockedIpv6(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLocaleLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
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
  return /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key)$/i.test(
    name.trim(),
  );
}
