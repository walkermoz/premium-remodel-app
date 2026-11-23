"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { BusinessConfig } from "@/lib/business-config";
import type {
  OrganizationConnectionCapability,
  OrganizationConnectionId,
} from "@/lib/organization-connections.types";

type Section = "business" | "connections" | "workspace" | "account";
type Status = {
  organizationId: string;
  canCreateBusiness: boolean;
  connections: Record<
    OrganizationConnectionId,
    OrganizationConnectionCapability
  >;
  mail: { configured: boolean; connected: boolean; email: string | null };
  googleReviews: {
    configured: boolean;
    connected: boolean;
    locationTitle: string | null;
  };
  phone: { connected: boolean };
  websiteLeads: {
    connected: boolean;
    mode?: "legacy_static" | "workflow_webhook" | "not_configured";
  };
  payments: {
    stripeConnected: boolean;
    stripeReady?: boolean;
    selectedProvider: "stripe" | "manual";
    enabled: boolean;
  };
  modules?: {
    automations: { enabled: boolean; configured: boolean; optional: boolean };
    agreements: { enabled: boolean; configured: boolean; optional: boolean };
    payments: { enabled: boolean; configured: boolean; optional: boolean };
  };
};

type SetupStep = {
  id: string;
  title: string;
  state: "ready" | "connected" | "todo" | "blocked";
  required: boolean;
  detail: string;
  action?: string;
  onAction?: () => void;
};

function isComplete(step: SetupStep) {
  return step.state === "ready" || step.state === "connected";
}

function Step({ step }: { step: SetupStep }) {
  const done = isComplete(step);
  const status = done
    ? step.state === "connected"
      ? "Connected"
      : "Ready"
    : !step.required
      ? "Optional"
      : step.state === "blocked"
        ? "Needs setup"
        : "To do";
  return (
    <li className="onboarding-step">
      <span
        className={`onboarding-marker${done ? " complete" : ""}`}
        aria-hidden="true"
      >
        {done && <Check size={13} />}
      </span>
      <div className="onboarding-step-copy">
        <div className="onboarding-step-heading">
          <h3>{step.title}</h3>
          <span
            className={`onboarding-state ${done ? step.state : step.required ? step.state : "optional"}`}
          >
            {status}
          </span>
        </div>
        <p>{step.detail}</p>
      </div>
      {step.action && step.onAction && (
        <button
          type="button"
          className="button secondary small-button"
          onClick={step.onAction}
        >
          {step.action}
        </button>
      )}
    </li>
  );
}

export default function BusinessOnboarding({
  config,
  admin,
  demo,
  onNavigate,
}: {
  config: BusinessConfig;
  admin: boolean;
  demo: boolean;
  onNavigate: (section: Section, targetId?: string) => void;
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

  function openConnection(section: Section, targetId: string) {
    onNavigate(section, targetId);
    window.setTimeout(() => {
      document
        .getElementById(targetId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

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
    if (!status?.canCreateBusiness || demo || creating) return;
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

  const openAutomation = () =>
    window.location.assign(`${demo ? "/demo" : "/"}?view=Automation`);
  const optionalConnection = (
    id: OrganizationConnectionId,
  ): SetupStep["state"] =>
    status?.connections[id]?.state === "ready" ? "connected" : "todo";
  const paymentsReady =
    status?.payments.selectedProvider === "manual" ||
    (status?.payments.stripeReady && status.payments.enabled);
  const steps: SetupStep[] = [
    {
      id: "business",
      title: "Create business",
      required: true,
      state: "ready",
      detail: `${config.profile.name} has its own workspace.`,
    },
    {
      id: "identity",
      title: "Company details & branding",
      required: true,
      state: identityReady ? "ready" : "todo",
      detail: identityReady
        ? "Logo, website and public contact details are ready."
        : `Add ${identityMissing.join(", ")}.`,
      action: "Edit company",
      onAction: () => onNavigate("business"),
    },
    {
      id: "mail",
      title: "Company email",
      required: true,
      state: status?.mail.connected
        ? "connected"
        : status && !status.mail.configured
          ? "blocked"
          : "todo",
      detail: status?.mail.connected
        ? `Sending from ${status.mail.email || "your connected mailbox"}.`
        : status && !status.mail.configured
          ? "Google email needs platform setup before you can connect."
          : "Connect Gmail to send quotes and portal messages.",
      action: status?.mail.connected ? "View connection" : "Connect Gmail",
      onAction: () => openConnection("connections", "connection-google-mail"),
    },
    {
      id: "leads",
      title: "Website lead form",
      required: config.modules.automations,
      state: status?.websiteLeads.connected ? "ready" : "todo",
      detail: status?.websiteLeads.connected
        ? "Website lead intake is connected."
        : config.modules.automations
          ? "Publish Website lead intake, then connect its private form URL."
          : "Enable Automations when you want website leads to enter a workflow.",
      action: config.modules.automations ? "Open Automation" : "Manage modules",
      onAction: config.modules.automations
        ? openAutomation
        : () => onNavigate("business", "modules"),
    },
    {
      id: "automations",
      title: "Automations",
      required: config.modules.automations,
      state:
        config.modules.automations && status?.modules?.automations.configured
          ? "ready"
          : "todo",
      detail: status?.modules?.automations.configured
        ? "A workflow is published."
        : config.modules.automations
          ? "Review and publish a workflow for this business."
          : "Enable workflows when your team needs them.",
      action: config.modules.automations ? "Open Automation" : "Manage modules",
      onAction: config.modules.automations
        ? openAutomation
        : () => onNavigate("business", "modules"),
    },
    {
      id: "agreements",
      title: "Agreement templates",
      required: config.modules.agreements,
      state:
        config.modules.agreements && status?.modules?.agreements.configured
          ? "ready"
          : "todo",
      detail: status?.modules?.agreements.configured
        ? "A published agreement template is available."
        : config.modules.agreements
          ? "Publish a template for your customer agreements."
          : "Enable agreements when you need customer signatures.",
      action: config.modules.agreements
        ? "Agreement library"
        : "Manage modules",
      onAction: () =>
        onNavigate(
          "business",
          config.modules.agreements ? "agreements" : "modules",
        ),
    },
    {
      id: "payments",
      title: "Payments",
      required: config.modules.payments,
      state: config.modules.payments && paymentsReady ? "ready" : "todo",
      detail: !config.modules.payments
        ? "Enable payments when you want to collect them in the portal."
        : status?.payments.selectedProvider === "manual"
          ? "Manual payments are selected; Stripe is optional."
          : paymentsReady
            ? "Stripe is ready to collect payments."
            : status?.payments.stripeConnected
              ? "Finish Stripe verification and enable payment links."
              : "Connect Stripe, or choose manual payments.",
      action: config.modules.payments ? "Payment settings" : "Manage modules",
      onAction: () =>
        onNavigate("business", config.modules.payments ? "quotes" : "modules"),
    },
    {
      id: "phone",
      title: "Texting",
      required: false,
      state: status?.phone.connected ? "connected" : "todo",
      detail: status?.phone.connected
        ? "Your company texting number is connected."
        : "Connect Twilio when you want to send texts.",
      action: status?.phone.connected ? "Check phone" : "Connect phone",
      onAction: () => openConnection("connections", "connection-twilio"),
    },
    {
      id: "reviews",
      title: "Google reviews",
      required: false,
      state: status?.googleReviews.connected ? "connected" : "todo",
      detail: status?.googleReviews.connected
        ? `Reviews connected${status.googleReviews.locationTitle ? ` for ${status.googleReviews.locationTitle}` : "; choose a location in Google reviews"}.`
        : status && !status.googleReviews.configured
          ? "Available after Google Business Profile platform setup."
          : "Connect the Google account that manages your business listing.",
      action: status?.googleReviews.connected
        ? "View connection"
        : "Connect reviews",
      onAction: () =>
        openConnection("connections", "connection-google-business"),
    },
    {
      id: "calendar",
      title: "Personal calendar",
      required: false,
      state: optionalConnection("google_calendar"),
      detail:
        "Copy appointments to Google Calendar. The built-in schedule works without it.",
      action: "Calendar settings",
      onAction: () => openConnection("account", "connection-google-calendar"),
    },
    {
      id: "ai",
      title: "AI tools",
      required: false,
      state: optionalConnection("openrouter_generation"),
      detail: "Connect a provider for renovation image previews.",
      action: "Generation settings",
      onAction: () => openConnection("workspace", "connection-openrouter"),
    },
    {
      id: "notifications",
      title: "Team notifications",
      required: false,
      state: optionalConnection("team_notifications"),
      detail: "Configure a team destination in your notification workflow.",
      action: "Open Automation",
      onAction: openAutomation,
    },
    {
      id: "secrets",
      title: "Workflow secrets",
      required: false,
      state: optionalConnection("workflow_secrets"),
      detail: "Store protected URLs and headers for workflows that need them.",
      action: "Manage secrets",
      onAction: () => openConnection("connections", "connection-secrets"),
    },
  ];
  const required = steps.filter((step) => step.required);
  const remaining = required.filter((step) => !isComplete(step));
  const completed = required.filter(isComplete);
  const optional = steps.filter((step) => !step.required);
  const loaded = Boolean(status || demo);
  return (
    <section className="onboarding-panel" aria-label="Business setup checklist">
      {loadError && (
        <div className="alert" role="alert">
          {loadError}
        </div>
      )}
      {!loaded && !loadError && (
        <p className="generation-note" role="status">
          Checking connections…
        </p>
      )}
      {loaded && (
        <>
          <p className="onboarding-progress" role="status">
            {remaining.length
              ? `${completed.length} of ${required.length} required tasks complete`
              : "Required setup complete"}
          </p>
          {remaining.length > 0 && (
            <section
              aria-label="Remaining setup"
              className="onboarding-remaining"
            >
              <h3 className="onboarding-group-title">Remaining setup</h3>
              <ul className="onboarding-steps">
                {remaining.map((step) => (
                  <Step key={step.id} step={step} />
                ))}
              </ul>
            </section>
          )}
          {completed.length > 0 && (
            <details className="onboarding-group">
              <summary>Completed ({completed.length})</summary>
              <ul className="onboarding-steps">
                {completed.map((step) => (
                  <Step key={step.id} step={step} />
                ))}
              </ul>
            </details>
          )}
          <details className="onboarding-group">
            <summary>Optional tools ({optional.length})</summary>
            <p className="onboarding-group-note">
              Add these when you need them. They do not block setup completion.
            </p>
            <ul className="onboarding-steps">
              {optional.map((step) => (
                <Step key={step.id} step={step} />
              ))}
            </ul>
          </details>
        </>
      )}
      <details className="onboarding-group">
        <summary>Test connections</summary>
        <div className="onboarding-test">
          <div>
            <p>
              Send a test email to your signed-in address, or a text to your own
              number once connected.
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
                  <span className="onboarding-checkbox" aria-hidden="true" />
                  <span>This is my number</span>
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
      </details>
      {status?.canCreateBusiness && !demo && (
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
    </section>
  );
}
