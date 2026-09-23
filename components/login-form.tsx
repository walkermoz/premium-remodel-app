"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { ThemeToggle } from "./theme-controls";
export default function LoginForm({
  configurationError,
  initialError,
}: {
  configurationError: boolean;
  initialError?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState(initialError || "");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  useEffect(() => {
    // Support projects whose existing Supabase site URL still ends in /login.
    const url = new URL(window.location.href);
    if (
      url.hash.includes("access_token=") ||
      url.hash.includes("error=") ||
      url.searchParams.has("code")
    ) {
      window.location.replace(`/auth/accept${url.search}${url.hash}`);
    }
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...fields,
          action: "login",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not sign in. Try again.",
      );
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-panel">
        <div className="login-theme-toggle">
          <ThemeToggle />
        </div>
        <Link href="/login" className="login-brand">
          <img src="/images/logo.png" alt="Premium Remodel" />
        </Link>
        <div className="login-form-wrap">
          <div className="eyebrow">Premium Remodel</div>
          <h1>Welcome back.</h1>
          <p className="login-intro">
            Sign in to Premium Remodel to keep every job moving forward.
          </p>
          {configurationError ? (
            <div className="alert">
              The company workspace is temporarily unavailable. Please try again
              shortly or contact your administrator. You can explore the sample
              workspace below.
            </div>
          ) : (
            <form onSubmit={submit} className="form-stack">
              <label>
                Work email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@premiumremodel.com"
                  required
                />
              </label>
              <label>
                Password
                <div className="password-wrap">
                  <input
                    name="password"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    maxLength={128}
                    required
                  />
                  <button
                    type="button"
                    aria-label={show ? "Hide password" : "Show password"}
                    onClick={() => setShow(!show)}
                  >
                    {show ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              {error && (
                <div className="alert" role="alert">
                  {error}
                </div>
              )}
              <button className="button primary full" disabled={busy}>
                {busy ? "One moment…" : "Sign in"}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          <p className="login-help">
            Need an account or help signing in? Contact your workspace
            administrator.
          </p>
          <div className="login-divider">
            <span>Take a look around</span>
          </div>
          <Link className="button secondary full" href="/demo">
            Explore sample workspace <ArrowRight size={16} />
          </Link>
          <p className="demo-note">Sample data. No account required.</p>
        </div>
        <div className="login-footer">
          <LockKeyhole size={13} /> Premium Remodel
        </div>
      </div>
      <aside className="login-visual">
        <img
          src="/images/home.jpg"
          alt="A bright, renovated living space by Premium Remodel"
        />
        <div className="login-visual-shade" />
        <div className="photo-topline">
          PREMIUM REMODEL <span>WAKE COUNTY, NC</span>
        </div>
        <div className="login-visual-copy">
          <span className="eyebrow">
            FROM THE FIRST PLAN TO THE FINAL DETAIL
          </span>
          <h2>
            Great work.
            <br />
            All in one place.
          </h2>
          <p>
            A little less paperwork.
            <br />A lot more room to build.
          </p>
          <div className="login-features">
            <span>
              <Check size={14} /> Every project
            </span>
            <span>
              <Check size={14} /> Your whole team
            </span>
            <span>
              <Check size={14} /> Every detail
            </span>
          </div>
        </div>
        <div className="photo-caption">Built by Premium Remodel.</div>
      </aside>
    </main>
  );
}
