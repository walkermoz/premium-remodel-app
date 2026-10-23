"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MsaSignaturePad from "@/components/msa-signature-pad";
import type { MsaAgreement, SignatureStroke } from "@/lib/types";
import styles from "./quote.module.css";

export default function MsaAcceptance({
  token,
  agreement,
}: {
  token: string;
  agreement: MsaAgreement;
}) {
  const router = useRouter();
  const [name, setName] = useState(agreement.owner);
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (agreement.status === "signed")
    return (
      <p role="status">
        Signed on {agreement.transactionDate}. Your completed agreement is
        available below.
      </p>
    );
  return (
    <form
      className={styles.signForm}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!strokes.length) {
          setError("Draw your signature to sign the agreement.");
          return;
        }
        setPending(true);
        setError("");
        try {
          const response = await fetch(
            `/api/client-quote/${encodeURIComponent(token)}/msa/sign`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                signedName: name.trim(),
                signatureStrokes: strokes,
                termsSha256: agreement.termsSha256,
                transactionDate: agreement.transactionDate,
                agreed,
              }),
            },
          );
          const result = await response.json().catch(() => ({}));
          if (!response.ok)
            throw new Error(result.error || "Could not save your signature.");
          if (result.emailWarning) setNotice(result.emailWarning);
          router.refresh();
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not save your signature.",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <h2>Sign this agreement</h2>
      <p>
        Review the cover agreement and Exhibits A–G above, including the Notice
        of Cancellation, before signing.
      </p>
      <label>
        Print name
        <input
          value={name}
          minLength={2}
          maxLength={150}
          required
          disabled={pending}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <p>Date: {agreement.transactionDate}</p>
      <label>Signature</label>
      <MsaSignaturePad onChange={setStrokes} disabled={pending} />
      <label className={styles.signConsent}>
        <input
          type="checkbox"
          checked={agreed}
          required
          disabled={pending}
          onChange={(event) => setAgreed(event.target.checked)}
        />
        <span>
          I have reviewed and approve this Master Services Agreement, including
          Exhibits B, C, and D, and intend my electronic signature to sign it.
        </span>
      </label>
      {error && (
        <p role="alert" className={styles.signError}>
          {error}
        </p>
      )}
      {notice && <p role="alert">{notice}</p>}
      <button
        type="submit"
        className={styles.signButton}
        disabled={pending || !agreed}
      >
        {pending ? "Saving signature…" : "Sign agreement"}
      </button>
    </form>
  );
}
