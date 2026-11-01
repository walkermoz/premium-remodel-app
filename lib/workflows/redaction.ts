const sensitiveWorkflowKey =
  /(authorization|cookie|password|secret|token|api[-_]?key|auth[-_]?token|client[-_]?secret|private[-_]?key)/i;

export function redactWorkflowValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactWorkflowValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      sensitiveWorkflowKey.test(key)
        ? "[redacted]"
        : redactWorkflowValue(child),
    ]),
  );
}
