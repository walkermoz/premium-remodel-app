"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SignatureField, {
  signatureFieldComplete,
  type SignatureFieldValue,
} from "@/components/signature-field";
import type { MsaAgreement } from "@/lib/types";
import styles from "./quote.module.css";

export default function MsaAcceptance({
  token,
  agreement,
}: {
  token: string;
  agreement: MsaAgreement;
}) {
  const router = useRouter();
  const [signature, setSignature] = useState<SignatureFieldValue>({
    signedName: agreement.owner,
    signatureMethod: "drawn",
    signatureStrokes: [],
  });
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
        if (!signatureFieldComplete(signature)) {
          setError("Add your signature to sign the agreement.");
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
                signedName: signature.signedName.trim(),
                signatureMethod: signature.signatureMethod,
                signatureStrokes: signature.signatureStrokes,
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
      <p>Date: {agreement.transactionDate}</p>
      <SignatureField
        value={signature}
        onChange={(value) => {
          setSignature(value);
          setError("");
        }}
        disabled={pending}
      />
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
        disabled={pending || !agreed || !signatureFieldComplete(signature)}
      >
        {pending ? "Saving signature…" : "Sign agreement"}
      </button>
    </form>
  );
}
