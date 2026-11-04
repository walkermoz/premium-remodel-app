"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SignatureField, {
  signatureFieldComplete,
  type SignatureFieldValue,
} from "@/components/signature-field";
import type { AgreementField } from "@/lib/agreement-template-schema";
import styles from "./page.module.css";

export default function AgreementSigningForm({
  token,
  signerName,
  fields,
  onsite = false,
}: {
  token: string;
  signerName: string;
  fields: AgreementField[];
  onsite?: boolean;
}) {
  const router = useRouter();
  const [signature, setSignature] = useState<SignatureFieldValue>({
    signedName: signerName,
    signatureMethod: "drawn",
    signatureStrokes: [],
  });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <form
      className={styles.signingForm}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!signatureFieldComplete(signature)) {
          setError("Add your signature before signing this agreement.");
          return;
        }
        setBusy(true);
        setError("");
        try {
          const form = event.currentTarget;
          const values: Record<string, unknown> = Object.fromEntries(
            new FormData(form),
          );
          for (const field of fields)
            if (field.type === "checkbox")
              values[field.id] = Boolean(
                (form.elements.namedItem(field.id) as HTMLInputElement | null)
                  ?.checked,
              );
          const response = await fetch(
            `/api/agreement-sign/${encodeURIComponent(token)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                signedName: signature.signedName,
                accepted,
                signatureMethod: signature.signatureMethod,
                signatureStrokes: signature.signatureStrokes,
                values,
              }),
            },
          );
          const body = await response.json().catch(() => ({}));
          if (!response.ok)
            throw new Error(body.error || "Could not sign this agreement.");
          if (onsite && body.nextSigningUrl) {
            window.location.assign(body.nextSigningUrl);
            return;
          }
          router.refresh();
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not sign this agreement.",
          );
          setBusy(false);
        }
      }}
    >
      {fields
        .filter((field) => !["signature", "initials"].includes(field.type))
        .map((field) => (
          <label key={field.id}>
            <span>{field.label}</span>
            {field.type === "multiline_text" ? (
              <textarea
                name={field.id}
                placeholder={field.placeholder || ""}
                required={field.required}
                disabled={busy}
              />
            ) : field.type === "checkbox" ? (
              <input
                name={field.id}
                type="checkbox"
                value="true"
                required={field.required}
                disabled={busy}
              />
            ) : (
              <input
                name={field.id}
                type={
                  field.type === "date"
                    ? "date"
                    : ["number", "currency"].includes(field.type)
                      ? "number"
                      : "text"
                }
                step={field.type === "currency" ? "0.01" : undefined}
                placeholder={field.placeholder || ""}
                required={field.required}
                disabled={busy}
              />
            )}
          </label>
        ))}
      {fields
        .filter((field) => field.type === "initials")
        .map((field) => (
          <label key={field.id}>
            <span>{field.label}</span>
            <input
              name={field.id}
              maxLength={12}
              required={field.required}
              disabled={busy}
            />
          </label>
        ))}
      <SignatureField
        value={signature}
        onChange={(value) => {
          setSignature(value);
          setError("");
        }}
        disabled={busy}
      />
      <label className={styles.consent}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          required
          disabled={busy}
        />
        <span>
          I have reviewed this agreement and intend my electronic signature to
          be legally binding.
        </span>
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !accepted || !signatureFieldComplete(signature)}
      >
        {busy ? "Saving signature…" : "Sign agreement"}
      </button>
    </form>
  );
}
