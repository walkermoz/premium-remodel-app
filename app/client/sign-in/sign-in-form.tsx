"use client";

import { useState, type FormEvent } from "react";
import styles from "./sign-in.module.css";

export default function SignInForm({
  organizationId,
}: {
  organizationId?: string;
}) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/client-access/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, organizationId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Please try again in a moment.");
      }
      setSent(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Please try again in a moment.",
      );
    } finally {
      setSending(false);
    }
  }

  if (sent)
    return (
      <div className={styles.sent} role="status">
        <strong>Check your inbox</strong>
        <p>
          If this email has a quote with this business, we’ve sent a new portal
          link. It may take a few minutes to arrive.
        </p>
        <button
          className={styles.again}
          type="button"
          onClick={() => setSent(false)}
        >
          Use a different email
        </button>
      </div>
    );

  return (
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor="client-email">Email address</label>
      <input
        id="client-email"
        type="email"
        autoComplete="email"
        required
        maxLength={320}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
      />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={sending}>
        {sending ? "Sending link…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
