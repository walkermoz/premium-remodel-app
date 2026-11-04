"use client";

import { useState } from "react";
import type { QuoteFlowBlock } from "@/lib/quote-flow-schema";
import SignatureField, {
  signatureFieldComplete,
  type SignatureFieldValue,
} from "./signature-field";
import styles from "./quote-flow-signature-control.module.css";

export default function QuoteFlowSignatureControl({
  block,
  value,
  busy,
  onComplete,
}: {
  block: QuoteFlowBlock;
  value: unknown;
  busy: boolean;
  onComplete: (value: unknown) => void;
}) {
  const saved =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  const [initials, setInitials] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState<SignatureFieldValue>({
    signedName: "",
    signatureMethod: "drawn",
    signatureStrokes: [],
  });
  const acknowledgment = String(
    block.config.acknowledgment ||
      (block.type === "initials"
        ? "I reviewed and acknowledge this section."
        : "I reviewed this section and intend this electronic signature to be binding."),
  );

  if (saved?.signedAt)
    return (
      <div className={styles.complete}>
        <strong>{block.type === "initials" ? "Initialed" : "Signed"}</strong>
        <span>
          {String(saved.signedName || saved.initials || "Completed")} ·{" "}
          {new Date(String(saved.signedAt)).toLocaleString()}
        </span>
      </div>
    );

  if (block.type === "initials")
    return (
      <div className={styles.control}>
        <label>
          Your initials
          <input
            value={initials}
            maxLength={12}
            disabled={busy}
            onChange={(event) => setInitials(event.target.value.toUpperCase())}
          />
        </label>
        <label className={styles.accept}>
          <input
            type="checkbox"
            checked={accepted}
            disabled={busy}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          {acknowledgment}
        </label>
        <button
          type="button"
          disabled={busy || !accepted || !initials.trim()}
          onClick={() =>
            onComplete({ initials: initials.trim(), accepted: true })
          }
        >
          {busy ? "Saving…" : "Apply initials"}
        </button>
      </div>
    );

  return (
    <div className={styles.control}>
      <SignatureField
        value={signature}
        onChange={setSignature}
        disabled={busy}
      />
      <label className={styles.accept}>
        <input
          type="checkbox"
          checked={accepted}
          disabled={busy}
          onChange={(event) => setAccepted(event.target.checked)}
        />
        {acknowledgment}
      </label>
      <button
        type="button"
        disabled={busy || !accepted || !signatureFieldComplete(signature)}
        onClick={() =>
          onComplete({
            signedName: signature.signedName.trim(),
            accepted: true,
            signatureMethod: signature.signatureMethod,
            signatureStrokes: signature.signatureStrokes,
          })
        }
      >
        {busy ? "Saving…" : "Apply signature"}
      </button>
    </div>
  );
}
