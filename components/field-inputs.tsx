"use client";
import type { FieldDefinition, FieldValue } from "@/lib/operating-settings";
import styles from "./operating-settings.module.css";
export default function FieldInputs({
  fields,
  values,
  onChange,
  disabled = false,
  validateRequired = true,
  prefix = "field",
}: {
  fields: FieldDefinition[];
  values: Record<string, FieldValue>;
  onChange: (id: string, value: FieldValue) => void;
  disabled?: boolean;
  validateRequired?: boolean;
  prefix?: string;
}) {
  return (
    <div className="form-grid">
      {fields.map((field) => {
        const value =
          values[field.id] === undefined
            ? (field.defaultValue ?? "")
            : (values[field.id] ?? "");
        const common = {
          id: `${prefix}-${field.id}`,
          disabled,
          required: validateRequired && field.required,
          onChange: (
            event: React.ChangeEvent<
              HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
            >,
          ) =>
            onChange(
              field.id,
              field.type === "boolean"
                ? (event.target as HTMLInputElement).checked
                : field.type === "number"
                  ? event.target.value === ""
                    ? null
                    : Number(event.target.value)
                  : event.target.value,
            ),
        };
        return (
          <label
            className={field.type === "boolean" ? styles.check : undefined}
            key={field.id}
          >
            {field.type === "boolean" ? (
              <input {...common} type="checkbox" checked={value === true} />
            ) : null}
            {field.label}
            {field.required ? " *" : ""}
            {field.type === "boolean" ? null : field.type === "textarea" ? (
              <textarea {...common} value={String(value)} maxLength={5000} />
            ) : field.type === "select" ? (
              <select {...common} value={String(value)}>
                <option value="">Choose…</option>
                {field.options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                {...common}
                type={
                  field.type === "number"
                    ? "number"
                    : field.type === "date"
                      ? "date"
                      : "text"
                }
                step={field.type === "number" ? "any" : undefined}
                value={String(value)}
                maxLength={5000}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
