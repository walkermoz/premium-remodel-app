"use client";

import type { SignatureMethod, SignatureStroke } from "@/lib/types";
import MsaSignaturePad from "./msa-signature-pad";
import styles from "./signature-field.module.css";

export type SignatureFieldValue = {
  signedName: string;
  signatureMethod: SignatureMethod;
  signatureStrokes: SignatureStroke[];
};

const typedSignatureEvidence: SignatureStroke[] = [
  [
    [0.08, 0.52],
    [0.92, 0.52],
  ],
];

export function signatureFieldComplete(value: SignatureFieldValue) {
  return (
    value.signedName.trim().length >= 2 &&
    (value.signatureMethod === "typed" || value.signatureStrokes.length > 0)
  );
}

export default function SignatureField({
  value,
  onChange,
  disabled = false,
  nameLabel = "Print name",
  nameReadOnly = false,
}: {
  value: SignatureFieldValue;
  onChange: (value: SignatureFieldValue) => void;
  disabled?: boolean;
  nameLabel?: string;
  nameReadOnly?: boolean;
}) {
  const typed = value.signatureMethod === "typed";

  return (
    <fieldset className={styles.field} disabled={disabled}>
      <legend>Signature</legend>
      <p className={styles.description}>
        Draw your signature or use your printed name as the signature.
      </p>
      <label className={styles.nameField}>
        <span>{nameLabel}</span>
        <input
          value={value.signedName}
          minLength={2}
          maxLength={200}
          autoComplete="name"
          required
          readOnly={nameReadOnly}
          onChange={(event) =>
            onChange({ ...value, signedName: event.target.value })
          }
        />
      </label>
      <div className={styles.method} role="group" aria-label="Signature method">
        <button
          type="button"
          className={!typed ? styles.active : undefined}
          aria-pressed={!typed}
          onClick={() => {
            if (!typed) return;
            onChange({
              ...value,
              signatureMethod: "drawn",
              signatureStrokes: [],
            });
          }}
        >
          Draw signature
        </button>
        <button
          type="button"
          className={typed ? styles.active : undefined}
          aria-pressed={typed}
          onClick={() => {
            if (typed) return;
            onChange({
              ...value,
              signatureMethod: "typed",
              signatureStrokes: typedSignatureEvidence,
            });
          }}
        >
          Type name
        </button>
      </div>
      {typed ? (
        <div
          className={styles.typedPreview}
          role="img"
          aria-label="Typed signature preview"
        >
          {value.signedName.trim() || "Your name appears here"}
          <span>Typed electronic signature</span>
        </div>
      ) : (
        <MsaSignaturePad
          onChange={(signatureStrokes) =>
            onChange({ ...value, signatureStrokes })
          }
          disabled={disabled}
        />
      )}
    </fieldset>
  );
}
