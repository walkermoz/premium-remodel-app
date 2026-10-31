"use client";

import { useEffect, useState } from "react";
import type { BusinessConfig } from "@/lib/business-config";

type Section = "business" | "connections";
type Status = {
  organizationId: string;
  mail: { configured: boolean; connected: boolean; email: string | null };
  phone: { connected: boolean };
  websiteLeads: { connected: boolean };
  payments: {
    stripeConnected: boolean;
    selectedProvider: "stripe" | "manual";
    enabled: boolean;
  };
};

function Step({
  number,
  title,
  state,
  detail,
  action,
  onAction,
}: {
  number: string;
  title: string;
  state: "ready" | "connected" | "todo" | "optional" | "blocked";
  detail: string;
  action?: string;
  onAction?: () => void;
}) {
  const status = {
    ready: "Ready",
    connected: "Connected",
    todo: "To do",
    optional: "Optional",
    blocked: "Needs setup",
  }[state];
  return (
    <li className="onboarding-step">
      <span className="onboarding-number" aria-hidden="true">
        {number}
      </span>
      <div className="onboarding-step-copy">
        <div className="onboarding-step-heading">
          <h3>{title}</h3>
          <span className={`onboarding-state ${state}`}>{status}</span>
        </div>
        <p>{detail}</p>
      </div>
      {action && onAction && (
        <button
          type="button"
          className="button secondary small-button"
          onClick={onAction}
        >
          {action}
        </button>
      )}
    </li>
  );
}

export default function BusinessOnboarding({
  config,
  owner,
  admin,
  demo,
  onNavigate,
}: {
  config: BusinessConfig;
  owner: boolean;
  admin: boolean;
  demo: boolean;
  onNavigate: (section: Section) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState("");
  const [createError, setCreateError] = useState("");
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [testError, setTestError] = useState(false);
  const [smsPhone, setSmsPhone] = useState("");
  const [ownNumber, setOwnNumber] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState("");
  const [smsError, setSmsError] = useState(false);

  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    fetch("/api/onboarding/status", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Could not check setup.");
        setStatus(body);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setLoadError(
            error instanceof Error ? error.message : "Could not check setup.",
          );
      });
    return () => controller.abort();
  }, [demo]);

  async function selectBusiness(id: string) {
    const response = await fetch("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: id }),
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error || "Could not open the new business.");
    window.location.assign("/?view=Settings");
  }

  async function createBusiness(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!owner || demo || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      let id = createdId;
      if (!id) {
        const response = await fetch("/api/organizations", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Could not create the business.");
        id = body.id;
        setCreatedId(id);
      }
      await selectBusiness(id);
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Could not create the business.",
      );
      setCreating(false);
    }
  }

  async function sendTestEmail() {
    if (sending) return;
    setSending(true);
    setTestResult("");
    setTestError(false);
    try {
      const response = await fetch("/api/onboarding/test-email", {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not send test email.");
      setTestResult(`Test email sent to ${body.sentTo}.`);
    } catch (error) {
      setTestError(true);
      setTestResult(
        error instanceof Error ? error.message : "Could not send test email.",
      );
    } finally {
      setSending(false);
    }
  }

  async function sendTestSms(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (smsSending || !ownNumber) return;
    setSmsSending(true);
    setSmsResult("");
    setSmsError(false);
    try {
      const response = await fetch("/api/onboarding/test-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: smsPhone, confirmOwnNumber: true }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not send test text.");
      setSmsResult(`Test text sent to ${body.sentTo}.`);
    } catch (error) {
      setSmsError(true);
      setSmsResult(
        error instanceof Error ? error.message : "Could not send test text.",
      );
    } finally {
      setSmsSending(false);
    }
  }

  const identityMissing = [
    !config.profile.logoUrl && "logo",
    !config.profile.website && "website",
    !config.profile.email && "contact email",
    !config.profile.phone && "phone number",
  ].filter(Boolean);
  const identityReady = identityMissing.length === 0;

  return (
    <div className="onboarding-panel">
      <div className="onboarding-hero">
        <span className="eyebrow">BUSINESS SETUP</span>
        <h2>Get your business ready</h2>
        <p>
          Follow these steps to put your own branding and connections in place.
          You can come back to this checklist at any time.
        </p>
      </div>
      {loadError && (
        <div className="alert" role="alert">
          {loadError}
        </div>
      )}
      {!demo && !status && !loadError && (
        <p className="generation-note" role="status">
          Checking connections…
        </p>
      )}
      {(status || demo) && (
        <ol className="onboarding-steps">
          <Step
            number="01"
            title="Create business"
            state="ready"
            detail={`${config.profile.name} is its own workspace.`}
          />
          <Step
            number="02"
            title="Set brand and website"
            state={identityReady ? "ready" : "todo"}
            detail={
              identityReady
                ? "Logo and public contact details are in place."
                : `Add ${identityMissing.join(", ")} in Business settings.`
            }
            action="Edit business"
            onAction={() => onNavigate("business")}
          />
          <Step
            number="03"
            title="Connect mailbox"
            state={status?.mail.connected ? "connected" : "todo"}
            detail={
              status?.mail.connected
                ? `Email sends from ${status.mail.email}.`
                : status && !status.mail.configured
                  ? "Google connection needs one-time platform setup. Your business does not need Google API keys."
                  : "Authorize the company Gmail account used for quotes and portal messages."
            }
            action={
              status?.mail.connected ? "View connection" : "Connect Gmail"
            }
            onAction={() => onNavigate("connections")}
          />
          <Step
            number="04"
            title="Connect lead form"
            state={status?.websiteLeads.connected ? "ready" : "blocked"}
            detail={
              status?.websiteLeads.connected
                ? "The existing website lead form is connected."
                : "Website lead intake currently routes to the original company. Your site needs its own verified intake connection before its form can send leads here."
            }
            action="Set website"
            onAction={() => onNavigate("business")}
          />
          <Step
            number="05"
            title="Connect texting"
            state={status?.phone.connected ? "connected" : "optional"}
            detail={
              status?.phone.connected
                ? "The company Twilio account is connected. Check its number and verification in Connections."
                : "Optional. Add your company Twilio account when you want to send texts."
            }
            action={status?.phone.connected ? "Check phone" : "Connect phone"}
            onAction={() => onNavigate("connections")}
          />
          <Step
            number="06"
            title="Choose payments"
            state={
              status?.payments.selectedProvider === "manual"
                ? "ready"
                : status?.payments.stripeConnected
                  ? status.payments.enabled
                    ? "connected"
                    : "todo"
                  : "blocked"
            }
            detail={
              status?.payments.selectedProvider === "manual"
                ? "Manual payments are selected. Stripe can be enabled after the platform connects an account."
                : status?.payments.stripeConnected
                  ? status.payments.enabled
                    ? "Stripe is connected for this business."
                    : "Stripe is connected. Enable payment links in Business settings to use it."
                  : "Stripe is selected but this business has no Stripe account configured yet."
            }
            action="Payment settings"
            onAction={() => onNavigate("business")}
          />
        </ol>
      )}
      <div className="onboarding-test">
        <div>
          <h3>Run test sends</h3>
          <p>
            Confirm the mailbox with an email to your signed-in address. If
            texting is connected, send one test to your own mobile number.
          </p>
        </div>
        <div className="onboarding-test-actions">
          <button
            type="button"
            className="button secondary"
            disabled={!admin || !status?.mail.connected || sending || demo}
            onClick={() => void sendTestEmail()}
          >
            {sending ? "Sending…" : "Send test email"}
          </button>
          {status?.phone.connected && admin && !demo && (
            <form onSubmit={(event) => void sendTestSms(event)}>
              <label>
                Your mobile number
                <input
                  type="tel"
                  value={smsPhone}
                  onChange={(event) => setSmsPhone(event.target.value)}
                  placeholder="(555) 555-0123"
                  required
                  maxLength={24}
                  disabled={smsSending}
                />
              </label>
              <label className="onboarding-own-number">
                <input
                  type="checkbox"
                  checked={ownNumber}
                  onChange={(event) => setOwnNumber(event.target.checked)}
                  required
                  disabled={smsSending}
                />
                This is my number
              </label>
              <button
                className="button secondary"
                disabled={smsSending || !ownNumber}
              >
                {smsSending ? "Sending…" : "Send test text"}
              </button>
            </form>
          )}
        </div>
      </div>
      {testResult && (
        <div className={testError ? "alert" : "success-note"} role="status">
          {testResult}
        </div>
      )}
      {smsResult && (
        <div className={smsError ? "alert" : "success-note"} role="status">
          {smsResult}
        </div>
      )}
      {owner && !demo && (
        <form
          className="onboarding-create"
          onSubmit={(event) => void createBusiness(event)}
        >
          <div>
            <h3>Add another business</h3>
            <p>
              Create a separate workspace with its own settings, people, and
              connections.
            </p>
          </div>
          <label>
            Business name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={120}
              required
              disabled={creating || Boolean(createdId)}
              placeholder="Business name"
            />
          </label>
          <button
            className="button primary"
            disabled={creating || (!createdId && name.trim().length < 2)}
          >
            {creating
              ? "Opening…"
              : createdId
                ? "Open new business"
                : "Create business"}
          </button>
          {createError && (
            <div className="alert" role="alert">
              {createdId
                ? `Business created. ${createError} Try opening it again.`
                : createError}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
