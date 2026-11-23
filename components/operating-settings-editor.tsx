"use client";
import { useEffect, useState } from "react";
import { useOperatingSettings } from "./operating-settings-context";
import { useBusinessConfig } from "./business-context";
import {
  operatingSettingsSchema,
  renderMessageTemplate,
  type FieldDefinition,
  type OperatingSection,
  type OperatingSettings,
} from "@/lib/operating-settings";
import styles from "./operating-settings.module.css";

const labels: Record<OperatingSection, string> = {
  hours: "working hours",
  customFields: "custom fields",
  forms: "reusable forms",
  invoices: "invoice defaults",
  messages: "message templates",
  portal: "portal visibility",
};
const makeId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
const blankField = (): FieldDefinition => ({
  id: makeId("field"),
  label: "New field",
  type: "text",
  required: false,
  options: [],
  defaultValue: null,
});
function Check({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      {label}
    </label>
  );
}
function DefinitionEditor({
  field,
  onChange,
  locked = false,
}: {
  field: FieldDefinition;
  onChange: (next: FieldDefinition) => void;
  locked?: boolean;
}) {
  return (
    <div className="form-grid">
      <label>
        Field label
        <input
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
          required
          maxLength={160}
        />
      </label>
      <label>
        Field type
        <select
          value={field.type}
          disabled={locked}
          onChange={(e) =>
            onChange({
              ...field,
              type: e.target.value as FieldDefinition["type"],
              defaultValue: null,
              options: e.target.value === "select" ? ["Option 1"] : [],
            })
          }
        >
          {["text", "textarea", "number", "boolean", "select", "date"].map(
            (t) => (
              <option key={t} value={t}>
                {
                  {
                    text: "Short text",
                    textarea: "Long text",
                    number: "Number",
                    boolean: "Checkbox",
                    select: "Dropdown",
                    date: "Date",
                  }[t]
                }
              </option>
            ),
          )}
        </select>
      </label>
      {field.type === "select" && (
        <label>
          Options (one per line)
          <textarea
            value={field.options.join("\n")}
            onChange={(e) =>
              onChange({ ...field, options: e.target.value.split("\n") })
            }
          />
        </label>
      )}
      <label>
        Default value
        {field.type === "boolean" ? (
          <select
            value={
              field.defaultValue === null ? "" : String(field.defaultValue)
            }
            onChange={(e) =>
              onChange({
                ...field,
                defaultValue:
                  e.target.value === "" ? null : e.target.value === "true",
              })
            }
          >
            <option value="">No default</option>
            <option value="true">Checked</option>
            <option value="false">Unchecked</option>
          </select>
        ) : (
          <input
            type={
              field.type === "number"
                ? "number"
                : field.type === "date"
                  ? "date"
                  : "text"
            }
            value={String(field.defaultValue ?? "")}
            onChange={(e) =>
              onChange({
                ...field,
                defaultValue:
                  e.target.value === ""
                    ? null
                    : field.type === "number"
                      ? Number(e.target.value)
                      : e.target.value,
              })
            }
          />
        )}
      </label>
      <Check
        label="Required"
        checked={field.required}
        onChange={(required) => onChange({ ...field, required })}
      />
    </div>
  );
}
export default function OperatingSettingsEditor({
  section,
}: {
  section: OperatingSection;
}) {
  const context = useOperatingSettings();
  if (!context.loaded) return <p role="status">Loading settings…</p>;
  return <Editor key={section} section={section} />;
}
function Editor({ section }: { section: OperatingSection }) {
  const { settings, save, demo, storageReady } = useOperatingSettings();
  const config = useBusinessConfig();
  const [draft, setDraft] = useState<OperatingSettings>(() =>
    structuredClone(settings),
  );
  const [saved, setSaved] = useState(() => JSON.stringify(settings[section]));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const dirty = JSON.stringify(draft[section]) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function update<K extends OperatingSection>(
    key: K,
    value: OperatingSettings[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice("");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const parsed = operatingSettingsSchema.parse({
        ...settings,
        [section]: draft[section],
      });
      await save(section, parsed[section]);
      setSaved(JSON.stringify(parsed[section]));
      setDraft((current) => ({ ...current, [section]: parsed[section] }));
      setNotice(
        demo ? "Saved sample settings on this device." : "Settings saved.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }
  const fields = draft.customFields,
    forms = draft.forms;
  return (
    <form
      onSubmit={submit}
      className={styles.editor}
      aria-label={`${labels[section]} editor`}
    >
      {demo && (
        <p className={styles.intro}>
          Preview workspace: changes are saved on this device. No customer
          messages or live records are changed.
        </p>
      )}
      {!storageReady && (
        <p className="alert" role="alert">
          The operating settings database migration must be installed before
          live settings can be saved.
        </p>
      )}
      {section === "hours" && (
        <>
          <p className={styles.intro}>
            Business timezone: {config?.regional.timezone || "America/New_York"}
            . These hours are displayed in the customer portal only. Automations
            send at any hour, and scheduling is unrestricted.
          </p>
          <Check
            label="Show working hours in the customer portal"
            checked={draft.hours.enabled}
            onChange={(enabled) => update("hours", { ...draft.hours, enabled })}
          />
          <div className={styles.list}>
            {draft.hours.days.map((day, index) => (
              <div className={styles.day} key={day.day}>
                <Check
                  label={
                    [
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ][day.day]
                  }
                  checked={day.open}
                  onChange={(open) =>
                    update("hours", {
                      ...draft.hours,
                      days: draft.hours.days.map((d, i) =>
                        i === index ? { ...d, open } : d,
                      ),
                    })
                  }
                />
                <label>
                  Opens
                  <input
                    type="time"
                    aria-label={`${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day.day]} opens`}
                    value={day.start}
                    disabled={!day.open}
                    onChange={(e) =>
                      update("hours", {
                        ...draft.hours,
                        days: draft.hours.days.map((d, i) =>
                          i === index ? { ...d, start: e.target.value } : d,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Closes
                  <input
                    type="time"
                    aria-label={`${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day.day]} closes`}
                    value={day.end}
                    disabled={!day.open}
                    onChange={(e) =>
                      update("hours", {
                        ...draft.hours,
                        days: draft.hours.days.map((d, i) =>
                          i === index ? { ...d, end: e.target.value } : d,
                        ),
                      })
                    }
                  />
                </label>
              </div>
            ))}
          </div>
          <h3>Date exceptions</h3>
          <p>Use an exception for a holiday, closure or a different workday.</p>
          {draft.hours.exceptions.map((ex, index) => (
            <fieldset className={styles.row} key={index}>
              <legend>Exception {index + 1}</legend>
              <div className="form-grid">
                <label>
                  Date
                  <input
                    type="date"
                    required
                    value={ex.date}
                    onChange={(e) =>
                      update("hours", {
                        ...draft.hours,
                        exceptions: draft.hours.exceptions.map((x, i) =>
                          i === index ? { ...x, date: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Reason
                  <input
                    value={ex.note}
                    maxLength={200}
                    onChange={(e) =>
                      update("hours", {
                        ...draft.hours,
                        exceptions: draft.hours.exceptions.map((x, i) =>
                          i === index ? { ...x, note: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <Check
                  label="Closed all day"
                  checked={ex.closed}
                  onChange={(closed) =>
                    update("hours", {
                      ...draft.hours,
                      exceptions: draft.hours.exceptions.map((x, i) =>
                        i === index ? { ...x, closed } : x,
                      ),
                    })
                  }
                />
                {!ex.closed &&
                  ["start", "end"].map((key) => (
                    <label key={key}>
                      {key === "start" ? "Opens" : "Closes"}
                      <input
                        type="time"
                        value={ex[key as "start" | "end"]}
                        onChange={(e) =>
                          update("hours", {
                            ...draft.hours,
                            exceptions: draft.hours.exceptions.map((x, i) =>
                              i === index ? { ...x, [key]: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
              </div>
              <button
                type="button"
                className="button secondary small"
                onClick={() =>
                  update("hours", {
                    ...draft.hours,
                    exceptions: draft.hours.exceptions.filter(
                      (_, i) => i !== index,
                    ),
                  })
                }
              >
                Remove exception
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              update("hours", {
                ...draft.hours,
                exceptions: [
                  ...draft.hours.exceptions,
                  {
                    date: "",
                    closed: true,
                    start: "08:00",
                    end: "17:00",
                    note: "",
                  },
                ],
              })
            }
          >
            Add date exception
          </button>
        </>
      )}
      {section === "customFields" && (
        <>
          <p className={styles.intro}>
            Add fields to contact, quote and project editors. Saved field types
            and record targets are fixed to preserve existing data; archive an
            old field and add a new one to replace it. Only fields explicitly
            marked customer-visible appear in portals.
          </p>
          {fields.length === 0 && <p>No custom fields yet.</p>}
          {fields.map((field, index) => (
            <fieldset className={styles.row} key={field.id}>
              <legend>
                {field.label || `Field ${index + 1}`}
                {field.archived ? " (archived)" : ""}
              </legend>
              <DefinitionEditor
                field={field}
                locked={settings.customFields.some((f) => f.id === field.id)}
                onChange={(next) =>
                  update(
                    "customFields",
                    fields.map((f) =>
                      f.id === field.id ? { ...field, ...next } : f,
                    ),
                  )
                }
              />
              <div className={styles.choices}>
                {(["contact", "quote", "project"] as const).map((target) => (
                  <Check
                    key={target}
                    label={`Show on ${target}s`}
                    disabled={settings.customFields.some(
                      (f) => f.id === field.id,
                    )}
                    checked={field.targets.includes(target)}
                    onChange={(checked) =>
                      update(
                        "customFields",
                        fields.map((f) =>
                          f.id === field.id
                            ? {
                                ...f,
                                targets: checked
                                  ? [...f.targets, target]
                                  : f.targets.filter((t) => t !== target),
                              }
                            : f,
                        ),
                      )
                    }
                  />
                ))}
              </div>
              <Check
                label="Transfer matching values from contact to quote and quote to project"
                checked={field.transfer}
                onChange={(transfer) =>
                  update(
                    "customFields",
                    fields.map((f) =>
                      f.id === field.id ? { ...f, transfer } : f,
                    ),
                  )
                }
              />
              <Check
                label="Customer-visible on quote and project portals"
                checked={field.clientVisible}
                onChange={(clientVisible) =>
                  update(
                    "customFields",
                    fields.map((f) =>
                      f.id === field.id ? { ...f, clientVisible } : f,
                    ),
                  )
                }
              />
              <Check
                label="Archived"
                checked={field.archived}
                onChange={(archived) =>
                  update(
                    "customFields",
                    fields.map((f) =>
                      f.id === field.id ? { ...f, archived } : f,
                    ),
                  )
                }
              />
              {!settings.customFields.some((f) => f.id === field.id) && (
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() =>
                    update(
                      "customFields",
                      fields.filter((f) => f.id !== field.id),
                    )
                  }
                >
                  Remove unsaved field
                </button>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              update("customFields", [
                ...fields,
                {
                  ...blankField(),
                  targets: ["project"],
                  transfer: false,
                  clientVisible: false,
                  archived: false,
                },
              ])
            }
          >
            Add custom field
          </button>
        </>
      )}
      {section === "forms" && (
        <>
          <p className={styles.intro}>
            Assign these forms from a project’s Forms section. Each assigned
            copy keeps its own questions. Completed responses are locked;
            template edits affect future assignments only.
          </p>
          {!forms.length && <p>No reusable forms yet.</p>}
          {forms.map((form) => (
            <fieldset className={styles.row} key={form.id}>
              <legend>
                {form.title}
                {form.archived ? " (archived)" : ""}
              </legend>
              <label>
                Form title
                <input
                  value={form.title}
                  required
                  maxLength={160}
                  onChange={(e) =>
                    update(
                      "forms",
                      forms.map((f) =>
                        f.id === form.id ? { ...f, title: e.target.value } : f,
                      ),
                    )
                  }
                />
              </label>
              <div className={styles.choices}>
                <Check
                  label="Assign automatically to new projects"
                  checked={form.autoAssign}
                  onChange={(autoAssign) =>
                    update(
                      "forms",
                      forms.map((f) =>
                        f.id === form.id ? { ...f, autoAssign } : f,
                      ),
                    )
                  }
                />
                <Check
                  label="Required before project completion"
                  checked={form.required}
                  onChange={(required) =>
                    update(
                      "forms",
                      forms.map((f) =>
                        f.id === form.id ? { ...f, required } : f,
                      ),
                    )
                  }
                />
                <Check
                  label="Archived"
                  checked={form.archived}
                  onChange={(archived) =>
                    update(
                      "forms",
                      forms.map((f) =>
                        f.id === form.id ? { ...f, archived } : f,
                      ),
                    )
                  }
                />
              </div>
              {form.fields.map((field, index) => (
                <div className={styles.row} key={field.id}>
                  <strong>Question {index + 1}</strong>
                  <DefinitionEditor
                    field={field}
                    onChange={(next) =>
                      update(
                        "forms",
                        forms.map((f) =>
                          f.id === form.id
                            ? {
                                ...f,
                                fields: f.fields.map((q) =>
                                  q.id === field.id ? next : q,
                                ),
                              }
                            : f,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() =>
                      update(
                        "forms",
                        forms.map((f) =>
                          f.id === form.id
                            ? {
                                ...f,
                                fields: f.fields.filter(
                                  (q) => q.id !== field.id,
                                ),
                              }
                            : f,
                        ),
                      )
                    }
                  >
                    Remove question
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button secondary small"
                onClick={() =>
                  update(
                    "forms",
                    forms.map((f) =>
                      f.id === form.id
                        ? { ...f, fields: [...f.fields, blankField()] }
                        : f,
                    ),
                  )
                }
              >
                Add question
              </button>
              {!settings.forms.some((f) => f.id === form.id) && (
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() =>
                    update(
                      "forms",
                      forms.filter((f) => f.id !== form.id),
                    )
                  }
                >
                  Remove unsaved form
                </button>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              update("forms", [
                ...forms,
                {
                  id: makeId("form"),
                  title: "New form",
                  autoAssign: false,
                  required: false,
                  archived: false,
                  fields: [blankField()],
                },
              ])
            }
          >
            Add reusable form
          </button>
        </>
      )}
      {section === "invoices" && (
        <>
          <p className={styles.intro}>
            Defaults are copied to new quotes and their contract invoices.
            Existing quotes, prepared agreements and signed terms keep their
            saved defaults. Staff can still tailor a new agreement’s payment
            milestones.
          </p>
          <div className="form-grid">
            <label>
              Invoice title
              <input
                required
                maxLength={120}
                value={draft.invoices.title}
                onChange={(e) =>
                  update("invoices", {
                    ...draft.invoices,
                    title: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Deposit due days after signing
              <input
                type="number"
                min={0}
                max={365}
                step={1}
                value={draft.invoices.dueDays}
                onChange={(e) =>
                  update("invoices", {
                    ...draft.invoices,
                    dueDays: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Default deposit (%)
              <input
                type="number"
                min={1}
                max={99}
                step="0.01"
                value={draft.invoices.depositPercent}
                onChange={(e) =>
                  update("invoices", {
                    ...draft.invoices,
                    depositPercent: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <label>
            Customer invoice note
            <textarea
              maxLength={5000}
              value={draft.invoices.customerNote}
              onChange={(e) =>
                update("invoices", {
                  ...draft.invoices,
                  customerNote: e.target.value,
                })
              }
            />
          </label>
          <p>
            The remaining milestones are adjusted proportionally so the
            agreement still totals 100%. Due days apply to the deposit, not the
            entire contract balance.
          </p>
        </>
      )}
      {section === "messages" && (
        <>
          <p className={styles.intro}>
            Templates are used by the quote email composer, website lead
            acknowledgement email, and homeowner schedule text. Sending
            accounts, recipients, consent and delivery triggers remain in their
            existing editors.
          </p>
          <p>
            Supported variables:{" "}
            {
              "{{firstName}}, {{clientName}}, {{businessName}}, {{quoteName}}, {{quoteNumber}}, {{senderName}}"
            }
            . The schedule footer is plain text.
          </p>
          {(
            [
              ["quoteSubject", "Quote email subject"],
              ["quoteBody", "Quote email body"],
              ["leadSubject", "Lead acknowledgement subject"],
              ["leadBody", "Lead acknowledgement body"],
              ["scheduleFooter", "Schedule SMS footer"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              {key.endsWith("Subject") || key === "scheduleFooter" ? (
                <input
                  required
                  value={draft.messages[key]}
                  maxLength={key === "scheduleFooter" ? 160 : 180}
                  onChange={(e) =>
                    update("messages", {
                      ...draft.messages,
                      [key]: e.target.value,
                    })
                  }
                />
              ) : (
                <textarea
                  required
                  value={draft.messages[key]}
                  rows={7}
                  maxLength={5000}
                  onChange={(e) =>
                    update("messages", {
                      ...draft.messages,
                      [key]: e.target.value,
                    })
                  }
                />
              )}
            </label>
          ))}
          <details>
            <summary>Preview quote email with sample values</summary>
            <div className={styles.preview}>
              <strong>
                {renderMessageTemplate(draft.messages.quoteSubject, {
                  businessName: config?.profile.name || "Your company",
                  firstName: "Jason",
                  clientName: "Jason Smith",
                  quoteName: "Detached garage",
                  quoteNumber: "1042",
                  senderName: "Walker",
                })}
              </strong>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {renderMessageTemplate(draft.messages.quoteBody, {
                  businessName: config?.profile.name || "Your company",
                  firstName: "Jason",
                  clientName: "Jason Smith",
                  quoteName: "Detached garage",
                  quoteNumber: "1042",
                  senderName: "Walker",
                })}
              </p>
            </div>
          </details>
        </>
      )}
      {section === "portal" && (
        <>
          <p className={styles.intro}>
            Choose the sections customers can access through existing portal
            links. Changes apply immediately without replacing links or changing
            their project context. Staff workspace access is unaffected.
          </p>
          {(
            [
              ["schedule", "Project schedule"],
              ["scheduleTimes", "Appointment times in the schedule"],
              ["quotes", "Quotes and quote PDFs"],
              ["agreements", "Agreements, signing and agreement PDFs"],
              ["invoices", "Contract invoices"],
              ["payments", "Online payments and payment methods"],
              ["requests", "New requests and request history"],
            ] as const
          ).map(([key, label]) => (
            <Check
              key={key}
              label={label}
              checked={draft.portal[key]}
              onChange={(checked) =>
                update("portal", {
                  ...draft.portal,
                  [key]: checked,
                  ...(key === "invoices" && !checked
                    ? { payments: false }
                    : {}),
                })
              }
              disabled={key === "payments" && !draft.portal.invoices}
            />
          ))}
          <p>
            Contact information remains available. Hiding a section also
            prevents direct access to its portal actions; provider callbacks and
            staff financial records continue working.
          </p>
        </>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className={styles.footer}>
        <button
          className="button primary"
          type="submit"
          disabled={busy || !storageReady || !dirty}
        >
          {busy ? "Saving…" : `Save ${labels[section]}`}
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={busy || !dirty}
          onClick={() => {
            setDraft((current) => ({
              ...current,
              [section]: structuredClone(settings[section]),
            }));
            setSaved(JSON.stringify(settings[section]));
            setError("");
            setNotice("");
          }}
        >
          Discard changes
        </button>
        {dirty && <span>Unsaved changes</span>}
      </div>
    </form>
  );
}
