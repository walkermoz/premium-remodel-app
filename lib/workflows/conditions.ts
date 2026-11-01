import type {
  WorkflowCondition,
  WorkflowContext,
  WorkflowOperand,
} from "./schema";

export type ConditionTrace = {
  condition: WorkflowCondition;
  result: boolean;
  actual?: unknown;
  expected?: unknown;
  reason: string;
  children?: ConditionTrace[];
};

function objectValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return (value as Record<string, unknown>)[key];
}

export function resolveWorkflowPath(
  context: WorkflowContext,
  path: string,
): unknown {
  return path.split(".").reduce<unknown>(objectValue, context);
}

export function resolveWorkflowOperand(
  context: WorkflowContext,
  operand?: WorkflowOperand,
): unknown {
  if (!operand) return undefined;
  return operand.kind === "reference"
    ? resolveWorkflowPath(context, operand.path)
    : operand.value;
}

function empty(value: unknown) {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function comparable(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const date = Date.parse(value);
    if (!Number.isNaN(date) && /[-T:]/.test(value)) return date;
    const number = Number(value);
    if (value.trim() && Number.isFinite(number)) return number;
    return value.toLocaleLowerCase();
  }
  return value;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

export function isSafeWorkflowRegex(pattern: string) {
  if (pattern.length > 256) return false;
  if (/\\[1-9]/.test(pattern)) return false;
  if (/\([^)]*[+*][^)]*\)[+*{]/.test(pattern)) return false;
  if (/(\.\*){2,}|(\.\+){2,}/.test(pattern)) return false;
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

function changedValue(
  context: WorkflowContext,
  path: string,
  side: "from" | "to",
) {
  const changes = objectValue(context.event, "changes");
  const direct = objectValue(changes, path);
  if (direct && typeof direct === "object") return objectValue(direct, side);
  const field = path.split(".").at(-1) || path;
  return objectValue(objectValue(changes, field), side);
}

function compare(
  operator: WorkflowCondition extends infer T
    ? T extends { operator: infer O }
      ? O
      : never
    : never,
  actual: unknown,
  expected: unknown,
  context: WorkflowContext,
  path: string,
): boolean {
  switch (operator) {
    case "equals":
      return comparable(actual) === comparable(expected);
    case "notEquals":
      return comparable(actual) !== comparable(expected);
    case "contains":
      return Array.isArray(actual)
        ? actual.some((item) => comparable(item) === comparable(expected))
        : String(actual ?? "")
            .toLocaleLowerCase()
            .includes(String(expected ?? "").toLocaleLowerCase());
    case "notContains":
      return !compare("contains", actual, expected, context, path);
    case "startsWith":
      return String(actual ?? "")
        .toLocaleLowerCase()
        .startsWith(String(expected ?? "").toLocaleLowerCase());
    case "endsWith":
      return String(actual ?? "")
        .toLocaleLowerCase()
        .endsWith(String(expected ?? "").toLocaleLowerCase());
    case "isEmpty":
      return empty(actual);
    case "isNotEmpty":
      return !empty(actual);
    case "greaterThan":
    case "after":
      return comparable(actual)! > comparable(expected)!;
    case "lessThan":
    case "before":
      return comparable(actual)! < comparable(expected)!;
    case "isOneOf":
      return list(expected).some(
        (item) => comparable(item) === comparable(actual),
      );
    case "isNotOneOf":
      return !list(expected).some(
        (item) => comparable(item) === comparable(actual),
      );
    case "changedFrom":
      return (
        comparable(changedValue(context, path, "from")) === comparable(expected)
      );
    case "changedTo":
      return (
        comparable(changedValue(context, path, "to")) === comparable(expected)
      );
    case "matchesRegex": {
      const pattern = typeof expected === "string" ? expected : "";
      return (
        isSafeWorkflowRegex(pattern) &&
        new RegExp(pattern, "i").test(String(actual ?? ""))
      );
    }
  }
}

export function evaluateWorkflowCondition(
  condition: WorkflowCondition,
  context: WorkflowContext,
): ConditionTrace {
  if (condition.kind === "group") {
    const children = condition.conditions.map((child) =>
      evaluateWorkflowCondition(child, context),
    );
    const result =
      condition.combinator === "and"
        ? children.every((child) => child.result)
        : children.some((child) => child.result);
    return {
      condition,
      result,
      reason: `${condition.combinator.toUpperCase()} group ${result ? "passed" : "failed"}.`,
      children,
    };
  }

  const actual = resolveWorkflowPath(context, condition.left.path);
  const expected = resolveWorkflowOperand(context, condition.right);
  const result = compare(
    condition.operator,
    actual,
    expected,
    context,
    condition.left.path,
  );
  return {
    condition,
    result,
    actual,
    expected,
    reason: `${condition.left.path} ${condition.operator} ${result ? "passed" : "failed"}.`,
  };
}

export type MissingValueBehavior = "blank" | "fallback" | "skip" | "error";

export function interpolateWorkflowText(
  template: string,
  context: WorkflowContext,
  options: { missing: MissingValueBehavior; fallback?: string } = {
    missing: "blank",
  },
) {
  let missing = false;
  const value = template.replace(
    /\{\{\s*([^{}]+?)\s*\}\}/g,
    (_, rawPath: string) => {
      const path = rawPath.trim();
      const resolved = resolveWorkflowPath(context, path);
      if (resolved === undefined || resolved === null || resolved === "") {
        missing = true;
        if (options.missing === "fallback") return options.fallback || "";
        if (options.missing === "error")
          throw new Error(`Workflow value ${path} is missing.`);
        return "";
      }
      if (["string", "number", "boolean"].includes(typeof resolved))
        return String(resolved);
      return JSON.stringify(resolved);
    },
  );
  return { value, skipped: missing && options.missing === "skip", missing };
}
