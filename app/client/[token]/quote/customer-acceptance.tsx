"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MsaSignatureImage } from "@/components/msa-signature-pad";
import SignatureField, {
  signatureFieldComplete,
  type SignatureFieldValue,
} from "@/components/signature-field";
import type { SignatureMethod, SignatureStroke } from "@/lib/types";
import styles from "./quote.module.css";

type PublicAcceptance = {
  signedName: string;
  signedAt: string;
  signatureMethod?: SignatureMethod;
  signatureStrokes: SignatureStroke[];
};

function displayDate(value: Date, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(value);
}

export default function CustomerAcceptance({
  token,
  clientName,
  today,
  quoteUpdatedAt,
  approved,
  acceptance,
  businessName,
  locale,
  timeZone,
  onsite = false,
}: {
  token: string;
  clientName: string;
  today: string;
  quoteUpdatedAt: string;
  approved: boolean;
  acceptance?: PublicAcceptance;
  businessName: string;
  locale: string;
  timeZone: string;
  onsite?: boolean;
}) {
  const router = useRouter();
  const [signature, setSignature] = useState<SignatureFieldValue>({
    signedName: clientName,
    signatureMethod: "drawn",
    signatureStrokes: [],
  });
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (!signatureFieldComplete(signature)) {
      setError("Add your signature before accepting the quote.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/client-quote/${encodeURIComponent(token)}/sign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signedName: signature.signedName.trim(),
            quoteUpdatedAt,
            signatureMethod: signature.signatureMethod,
            signatureStrokes: signature.signatureStrokes,
            acceptedTerms: agreed,
          }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          result.error || "Could not save your signature. Please try again.",
        );
      }
      if (result.nextStep === "msa")
        router.replace(
          `/client/${encodeURIComponent(token)}/quote?view=msa${onsite ? "&onsite=1" : ""}`,
        );
      else router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save your signature.",
      );
      setPending(false);
    }
  };

  if (acceptance)
    return (
      <div className={styles.acceptanceGrid}>
        <div className={styles.acceptanceDetails}>
          <div>
            <span className={styles.acceptanceLabel}>Print name</span>
            <p>{acceptance.signedName}</p>
          </div>
          <div>
            <span className={styles.acceptanceLabel}>Date</span>
            <p>
              {displayDate(new Date(acceptance.signedAt), locale, timeZone)}
            </p>
          </div>
        </div>
        <div className={styles.acceptanceSignature}>
          <span className={styles.acceptanceLabel}>Signature</span>
          <MsaSignatureImage
            strokes={acceptance.signatureStrokes}
            method={acceptance.signatureMethod}
            signedName={acceptance.signedName}
            label="Customer signature"
          />
        </div>
      </div>
    );

  if (approved)
    return <p>This quote was accepted by {businessName} on your behalf.</p>;

  return (
    <form className={styles.signForm} onSubmit={submit}>
      <div className={styles.acceptanceDetails}>
        <div>
          <span className={styles.acceptanceLabel}>Date</span>
          <p>{today}</p>
        </div>
      </div>
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
          onChange={(event) => setAgreed(event.target.checked)}
          required
          disabled={pending}
        />
        <span>
          I agree to this quote and the terms above, and I intend my electronic
          signature to accept it.
        </span>
      </label>
      {error && (
        <p className={styles.signError} role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className={styles.signButton}
        disabled={pending || !agreed || !signatureFieldComplete(signature)}
      >
        {pending ? "Saving signature…" : "Sign and accept quote"}
      </button>
    </form>
  );
}
