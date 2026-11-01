const secretFieldNames = new Set([
  "key_hash",
  "token_hash",
  "ciphertext",
  "auth_token_ciphertext",
  "refresh_token_ciphertext",
  "auth_secret_ciphertext",
  "lead_webhook_secret",
  "client_secret",
  "access_token",
  "refresh_token",
  "password",
]);

function isSecretField(name: string) {
  const normalized = name.trim().toLowerCase();
  return (
    secretFieldNames.has(normalized) ||
    normalized.endsWith("_ciphertext") ||
    normalized.endsWith("_token_hash") ||
    normalized.endsWith("_secret_hash")
  );
}
/** Tenant owners receive useful configuration and history, never credentials. */
export function sanitizeOrganizationExportValue(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map((item) => sanitizeOrganizationExportValue(item));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isSecretField(key))
      .map(([key, nested]) => [key, sanitizeOrganizationExportValue(nested)]),
  );
}
