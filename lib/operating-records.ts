import {
  assignForm,
  customFieldsFor,
  defaultOperatingSettings,
  normalizeRecordForms,
  publicCustomFields,
  validateFieldValues,
  workingHoursIssue,
  type FieldValue,
  type OperatingSettings,
  type RecordForm,
  type InvoiceDefaults,
} from "./operating-settings";

type RecordData = Record<string, unknown>;
export class OperatingRecordError extends Error {}

/** Shared by the authenticated writer, workflows and preview. */
export function applyOperatingRecord(
  ...args: Parameters<typeof normalizeOperatingRecord>
) {
  try {
    return normalizeOperatingRecord(...args);
  } catch (error) {
    throw new OperatingRecordError(
      error instanceof Error ? error.message : "Invalid operating record.",
    );
  }
}

function normalizeOperatingRecord(
  settings: OperatingSettings,
  kind: string,
  input: RecordData,
  current: RecordData | null,
  actor: string,
  now: string,
  parentValues?: Record<string, FieldValue>,
  options: {
    requireCustomFields?: boolean;
    inheritedInvoiceDefaults?: InvoiceDefaults;
  } = {},
): RecordData {
  const data = { ...input };
  if (kind === "task" || kind === "lead") {
    const keys =
      kind === "task"
        ? ["dueDate", "startTime", "endTime"]
        : ["quoteDate", "quoteStartTime", "quoteEndTime"];
    if (!current || keys.some((k) => (data[k] || "") !== (current[k] || ""))) {
      const issue = workingHoursIssue(
        settings.hours,
        String(data[keys[0]] || ""),
        String(data[keys[1]] || ""),
        String(data[keys[2]] || ""),
      );
      if (issue && settings.hours.blockOutside) throw new Error(issue);
    }
  }
  if (kind === "contact" || kind === "quote" || kind === "project") {
    const fields = customFieldsFor(settings, kind);
    const old = (current?.customValues || {}) as Record<string, FieldValue>;
    const inherited = Object.fromEntries(
      fields
        .filter((f) => f.transfer && parentValues && f.id in parentValues)
        .map((f) => [f.id, parentValues![f.id]]),
    );
    const values = {
      ...(!current ? inherited : {}),
      ...old,
      ...((data.customValues || {}) as Record<string, FieldValue>),
    };
    // Legacy callers can update unrelated record fields without supplying newly required values.
    const normalized = validateFieldValues(
      fields,
      values,
      options.requireCustomFields !== false &&
        (!current ||
          ("customValues" in data &&
            JSON.stringify(data.customValues) !== JSON.stringify(old))),
    );
    data.customValues = { ...old, ...normalized };
    data.publicCustomFields = publicCustomFields(
      settings,
      kind,
      data.customValues as Record<string, FieldValue>,
    );
    if (kind === "quote") delete data.recordForms;
    if (kind !== "contact") {
      data.invoiceDefaults =
        current?.invoiceDefaults ||
        (current
          ? defaultOperatingSettings().invoices
          : structuredClone(
              options.inheritedInvoiceDefaults || settings.invoices,
            ));
    }
  }
  if (kind === "project") {
    const old = (current?.recordForms || []) as RecordForm[];
    const assigned = data.recordForms as RecordForm[] | undefined;
    const forms = assigned || old;
    const initial = !current
      ? settings.forms
          .filter((f) => !f.archived && f.autoAssign)
          .map((f, i) => assignForm(f, `assigned_${f.id.slice(0, 55)}_${i}`))
      : [];
    data.recordForms = normalizeRecordForms(
      settings,
      [
        ...forms,
        ...initial.filter(
          (f) => !forms.some((x) => x.templateId === f.templateId),
        ),
      ],
      old,
      actor,
      now,
    );
    if (
      data.status === "Completed" &&
      current?.status !== "Completed" &&
      (data.recordForms as RecordForm[]).some(
        (f) => f.required && f.status !== "complete",
      )
    )
      throw new Error(
        "Complete all required project forms before marking this project completed.",
      );
  }
  return data;
}

export function operatingProjectHandoff(
  settings: OperatingSettings,
  source: RecordData,
) {
  const fields = customFieldsFor(settings, "project");
  const values = (source.customValues as Record<string, FieldValue>) || {};
  const transferred = Object.fromEntries(
    fields
      .filter((f) => f.transfer && f.id in values)
      .map((f) => [f.id, values[f.id]]),
  );
  const customValues = validateFieldValues(fields, transferred, false);
  return {
    ...source,
    customValues,
    publicCustomFields: publicCustomFields(settings, "project", customValues),
    recordForms: settings.forms
      .filter((f) => !f.archived && f.autoAssign)
      .map((f, i) => assignForm(f, `assigned_${f.id.slice(0, 55)}_${i}`)),
  };
}
