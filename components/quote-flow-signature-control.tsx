"use client";

import { useState } from "react";
import type { SignatureStroke } from "@/lib/types";
import type { QuoteFlowBlock } from "@/lib/quote-flow-schema";
import MsaSignaturePad from "./msa-signature-pad";
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
  const [signedName, setSignedName] = useState("");
  const [initials, setInitials] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
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
      <label>
        Full legal name
        <input
          value={signedName}
          disabled={busy}
          onChange={(event) => setSignedName(event.target.value)}
        />
      </label>
      <MsaSignaturePad onChange={setStrokes} disabled={busy} />
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
        disabled={
          busy || !accepted || signedName.trim().length < 2 || !strokes.length
        }
        onClick={() =>
          onComplete({
            signedName: signedName.trim(),
            accepted: true,
            signatureStrokes: strokes,
          })
        }
      >
        {busy ? "Saving…" : "Apply signature"}
      </button>
    </div>
  );
}
