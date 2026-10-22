"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SignatureStroke } from "@/lib/types";
import styles from "./quote.module.css";

type PublicAcceptance = {
  signedName: string;
  signedAt: string;
  signatureStrokes: SignatureStroke[];
};

function displayDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(value);
}

function SignatureImage({ strokes }: { strokes: SignatureStroke[] }) {
  return (
    <svg
      viewBox="0 0 600 160"
      preserveAspectRatio="none"
      className={styles.signatureImage}
      role="img"
      aria-label="Customer signature"
    >
      {strokes.map((stroke, index) => (
        <polyline
          key={index}
          points={stroke.map(([x, y]) => `${x * 600},${y * 160}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export default function CustomerAcceptance({
  token,
  clientName,
  today,
  quoteUpdatedAt,
  approved,
  acceptance,
}: {
  token: string;
  clientName: string;
  today: string;
  quoteUpdatedAt: string;
  approved: boolean;
  acceptance?: PublicAcceptance;
}) {
  const router = useRouter();
  const pad = useRef<SVGSVGElement>(null);
  const pointer = useRef<number | null>(null);
  const [signedName, setSignedName] = useState(clientName);
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const point = (
    event: React.PointerEvent<SVGSVGElement>,
  ): [number, number] => {
    const bounds = pad.current!.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    ];
  };

  const start = (event: React.PointerEvent<SVGSVGElement>) => {
    if (pending || pointer.current !== null) return;
    event.preventDefault();
    pointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    const first = point(event);
    setStrokes((current) => [...current, [first]]);
    setError("");
  };

  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    if (pending || pointer.current !== event.pointerId) return;
    event.preventDefault();
    const next = point(event);
    setStrokes((current) => {
      const last = current.at(-1);
      if (!last || last.length >= 1000 || current.length > 40) return current;
      const previous = last.at(-1)!;
      if (Math.hypot(next[0] - previous[0], next[1] - previous[1]) < 0.0015)
        return current;
      return [...current.slice(0, -1), [...last, next]];
    });
  };

  const stop = (event: React.PointerEvent<SVGSVGElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setStrokes((current) => current.filter((stroke) => stroke.length > 1));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const validStrokes = strokes.filter((stroke) => stroke.length > 1);
    if (!validStrokes.length) {
      setError("Draw your signature before accepting the quote.");
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
            signedName: signedName.trim(),
            quoteUpdatedAt,
            signatureStrokes: validStrokes,
            acceptedTerms: agreed,
          }),
        },
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(
          result.error || "Could not save your signature. Please try again.",
        );
      }
      router.refresh();
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
            <p>{displayDate(new Date(acceptance.signedAt))}</p>
          </div>
        </div>
        <div className={styles.acceptanceSignature}>
          <span className={styles.acceptanceLabel}>Signature</span>
          <SignatureImage strokes={acceptance.signatureStrokes} />
        </div>
      </div>
    );

  if (approved)
    return <p>This quote was accepted by Premium Remodel on your behalf.</p>;

  return (
    <form className={styles.signForm} onSubmit={submit}>
      <div className={styles.acceptanceGrid}>
        <div className={styles.acceptanceDetails}>
          <div>
            <label htmlFor="customer-name" className={styles.acceptanceLabel}>
              Print name
            </label>
            <input
              id="customer-name"
              name="signedName"
              value={signedName}
              onChange={(event) => setSignedName(event.target.value)}
              autoComplete="name"
              maxLength={100}
              minLength={2}
              required
              disabled={pending}
            />
          </div>
          <div>
            <span className={styles.acceptanceLabel}>Date</span>
            <p>{today}</p>
          </div>
        </div>
        <div className={styles.acceptanceSignature}>
          <label
            htmlFor="customer-signature"
            className={styles.acceptanceLabel}
          >
            Signature
          </label>
          <svg
            id="customer-signature"
            ref={pad}
            viewBox="0 0 600 160"
            preserveAspectRatio="none"
            className={styles.signaturePad}
            role="img"
            aria-label="Draw your signature here"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={stop}
          >
            {strokes.map((stroke, index) => (
              <polyline
                key={index}
                points={stroke
                  .map(([x, y]) => `${x * 600},${y * 160}`)
                  .join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
          <button
            type="button"
            className={styles.clearSignature}
            onClick={() => setStrokes([])}
            disabled={pending}
          >
            Clear signature
          </button>
        </div>
      </div>
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
        disabled={pending || !agreed}
      >
        {pending ? "Saving signature…" : "Sign and accept quote"}
      </button>
    </form>
  );
}
