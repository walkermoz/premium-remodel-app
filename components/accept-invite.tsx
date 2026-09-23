"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";

export default function AcceptInvite() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  async function finishSession() {
    const response = await fetch("/api/auth");
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        "This invitation does not have employee access. Contact your administrator.",
      );
    setName(result.user.name);
    setEmail(result.user.email);
    window.history.replaceState(null, "", "/auth/accept");
    setReady(true);
  }
  async function accept() {
    setBusy(true);
    setError("");
    try {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.slice(1));
      const client = supabaseBrowser();
      if (hash.get("error") || url.searchParams.get("error"))
        throw new Error(
          "This invitation is invalid or expired. Ask your administrator for a new one.",
        );
      const token = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      if (
        token &&
        ["invite", "magiclink", "recovery", "email"].includes(type || "")
      ) {
        const { error } = await client.auth.verifyOtp({
          token_hash: token,
          type: type as EmailOtpType,
        });
        if (error)
          throw new Error(
            "This invitation is invalid or expired. Ask your administrator for a new one.",
          );
      } else if (hash.get("access_token") && hash.get("refresh_token")) {
        const { error } = await client.auth.setSession({
          access_token: hash.get("access_token")!,
          refresh_token: hash.get("refresh_token")!,
        });
        if (error) throw error;
      } else if (url.searchParams.get("code")) {
        const { error } = await client.auth.exchangeCodeForSession(
          url.searchParams.get("code")!,
        );
        if (error) throw error;
      }
      await finishSession();
    } catch (e) {
      window.history.replaceState(null, "", "/auth/accept");
      setError(
        e instanceof Error ? e.message : "Could not accept this invitation.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-panel">
        <Link href="/login" className="login-brand">
          <img src="/images/logo.png" alt="Premium Remodel" />
        </Link>
        <div className="login-form-wrap">
          <div className="eyebrow">Premium Remodel</div>
          <h1>{ready ? "Make yourself at home." : "You’re invited."}</h1>
          <p className="login-intro">
            {ready
              ? "Set your name and password to get started."
              : "Join your team at Premium Remodel."}
          </p>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          {!ready ? (
            <button
              className="button primary full"
              disabled={busy}
              onClick={accept}
            >
              {busy ? "One moment…" : "Accept invitation"}
              <ArrowRight size={17} />
            </button>
          ) : (
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const fields = Object.fromEntries(
                  new FormData(e.currentTarget),
                );
                try {
                  if (fields.password !== fields.confirm)
                    throw new Error("The passwords do not match.");
                  const response = await fetch("/api/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...fields, action: "accept" }),
                  });
                  const result = await response.json();
                  if (!response.ok) throw new Error(result.error);
                  window.location.replace("/");
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not finish setting up your account.",
                  );
                  setBusy(false);
                }
              }}
            >
              <label>
                Full name
                <input
                  name="name"
                  autoComplete="name"
                  defaultValue={name}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                Work email
                <input type="email" value={email} readOnly />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  placeholder="At least 12 characters"
                  required
                />
              </label>
              <label>
                Confirm password
                <input
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
              <button className="button primary full" disabled={busy}>
                {busy ? "Saving…" : "Join workspace"}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          <p className="login-help">
            <Link href="/login">Back to sign in</Link>
          </p>
        </div>
        <div className="login-footer">
          <LockKeyhole size={13} /> Premium Remodel
        </div>
      </div>
      <aside className="login-visual">
        <img src="/images/home.jpg" alt="A renovated Premium Remodel home" />
        <div className="login-visual-shade" />
        <div className="login-visual-copy">
          <span className="eyebrow">EVERY PROJECT. YOUR WHOLE TEAM.</span>
          <h2>
            Great work.
            <br />
            All in one place.
          </h2>
        </div>
      </aside>
    </main>
  );
}
