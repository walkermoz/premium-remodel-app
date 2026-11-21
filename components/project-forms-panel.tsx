"use client";
import { useState } from "react";
import type { Project } from "@/lib/types";
import { assignForm, type RecordForm } from "@/lib/operating-settings";
import { useOperatingSettings } from "./operating-settings-context";
import FieldInputs from "./field-inputs";
import styles from "./operating-settings.module.css";
export default function ProjectFormsPanel({
  project,
  onSave,
}: {
  project: Project;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const { settings } = useOperatingSettings();
  const [template, setTemplate] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, RecordForm["answers"]>>(
    {},
  );
  const forms = project.recordForms || [];
  async function persist(next: RecordForm[]) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSave({ ...project, recordForms: next });
      setDrafts((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([id, answers]) =>
              JSON.stringify(next.find((f) => f.id === id)?.answers) !==
              JSON.stringify(answers),
          ),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save form.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.editor}>
      <div>
        <h2>Project forms</h2>
        <p>
          Assigned forms keep their original questions. Complete required forms
          before closing the project. Completed responses are locked.
        </p>
      </div>
      <div className={styles.heading}>
        <label>
          Reusable form
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            <option value="">Choose a form</option>
            {settings.forms
              .filter((f) => !f.archived)
              .map((f) => (
                <option value={f.id} key={f.id}>
                  {f.title}
                </option>
              ))}
          </select>
        </label>
        <button
          className="button secondary"
          type="button"
          disabled={!template || busy}
          onClick={() => {
            const selected = settings.forms.find(
              (f) => f.id === template && !f.archived,
            );
            if (selected)
              void persist([
                ...forms,
                assignForm(
                  selected,
                  `assigned_${crypto.randomUUID().replaceAll("-", "")}`,
                ),
              ]);
          }}
        >
          Assign form
        </button>
      </div>
      {!settings.forms.some((f) => !f.archived) && (
        <p>Create templates in Settings → Reusable forms.</p>
      )}
      {!forms.length && <p>No forms assigned to this project.</p>}
      {forms.map((form) => (
        <article key={form.id} className={styles.row}>
          <div className={styles.heading}>
            <h3>{form.title}</h3>
            <span>
              {form.status === "complete"
                ? "Complete"
                : form.required
                  ? "Required · Draft"
                  : "Draft"}
            </span>
          </div>
          <FieldInputs
            prefix={form.id}
            fields={form.fields}
            values={drafts[form.id] || form.answers}
            disabled={busy || form.status === "complete"}
            validateRequired={false}
            onChange={(id, value) =>
              setDrafts((current) => ({
                ...current,
                [form.id]: {
                  ...(current[form.id] || form.answers),
                  [id]: value,
                },
              }))
            }
          />
          {form.status === "complete" ? (
            <p>
              Completed by {form.completedBy} on{" "}
              {form.completedAt
                ? new Date(form.completedAt).toLocaleString()
                : "—"}
              . Assign a new copy for a correction.
            </p>
          ) : (
            <div className={styles.footer}>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void persist(
                    forms.map((f) =>
                      f.id === form.id
                        ? { ...f, answers: drafts[f.id] || f.answers }
                        : f,
                    ),
                  )
                }
              >
                Save draft
              </button>
              <button
                type="button"
                className="button primary"
                disabled={busy}
                onClick={() =>
                  void persist(
                    forms.map((f) =>
                      f.id === form.id
                        ? {
                            ...f,
                            answers: drafts[f.id] || f.answers,
                            status: "complete",
                          }
                        : f,
                    ),
                  )
                }
              >
                Complete form
              </button>
            </div>
          )}
        </article>
      ))}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
