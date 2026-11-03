"use client";
import { useEffect, useState } from "react";
import { LockKeyhole, MapPin } from "lucide-react";
import type { User } from "@/lib/types";
import { addressPriorityRegion } from "@/lib/address-search";
import GenerationSettings from "./generation-settings";
import { AppearanceSettings } from "./theme-controls";
import { InstallAppPanel } from "./pwa-install";
import TwilioSettings from "./twilio-settings";
import WorkspaceAlertSettings from "./workspace-alert-settings";
import WorkspaceHistorySettings from "./workspace-history-settings";
import GoogleCalendarSettings from "./google-calendar-settings";
import GoogleMailSettings from "./google-mail-settings";
import ApiKeysSettings from "./api-keys-settings";
import type { WorkspaceAlert } from "@/lib/types";
import type { BusinessConfig } from "@/lib/business-config";
import BusinessSettings from "./business-settings";
import BusinessOnboarding from "./business-onboarding";
import OrganizationSecretsSettings from "./organization-secrets-settings";
import type { OrganizationCapability } from "@/lib/business-config-schema";
import AgreementTemplatesSettings from "./agreement-templates-settings";
import QuoteFlowTemplatesSettings from "./quote-flow-templates-settings";
import StripePaymentSettings from "./stripe-payment-settings";
import OrganizationLifecycleSettings from "./organization-lifecycle-settings";
export default function SettingsPanel({
  user,
  config,
  demo,
  alerts,
  onSaveAlert,
  onRemoveAlert,
}: {
  user: User;
  config: BusinessConfig;
  demo: boolean;
  alerts: WorkspaceAlert[];
  onSaveAlert: (
    data: Record<string, unknown>,
    existing?: WorkspaceAlert,
  ) => Promise<unknown>;
  onRemoveAlert: (alert: WorkspaceAlert) => void;
}) {
  type SettingsSection =
    "setup" | "business" | "workspace" | "connections" | "account";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const hasCapability = (capability: OrganizationCapability) =>
    user.group === "owner" ||
    config.rolePermissions[user.group].includes(capability);
  const canManageConnections = hasCapability("connections.manage");
  const canManageSecrets = hasCapability("secrets.manage");
  const canManageAlerts = hasCapability("alerts.manage");
  const canViewAudit = hasCapability("audit.view");
  const canManageGeneration = hasCapability("generation.manage");
  const canManageApiKeys = hasCapability("api_keys.manage");
  const canManageAgreements = hasCapability("agreements.manage");
  const canManageQuoteFlows = hasCapability("quote_flows.manage");
  const canPublishQuoteFlows = hasCapability("quote_flows.publish");
  const canViewSetup = canManageConnections;
  const canViewBusiness = [
    "business.manage",
    "branding.manage",
    "compliance.manage",
    "permissions.manage",
    "agreements.manage",
    "quote_flows.manage",
  ].some((capability) => hasCapability(capability as OrganizationCapability));
  const [section, setSection] = useState<SettingsSection>(
    canViewSetup ? "setup" : canViewBusiness ? "business" : "workspace",
  );
  const visibleSection =
    section === "setup" && !canViewSetup
      ? "workspace"
      : section === "business" && !canViewBusiness
        ? "workspace"
        : section === "connections" && !canManageConnections
          ? "workspace"
          : section;
  function selectSection(next: SettingsSection) {
    setSection(next);
    window.history.replaceState(null, "", `#${next}`);
  }
  useEffect(() => {
    const selectHash = () => {
      const requested = window.location.hash.slice(1) as SettingsSection;
      if (
        !["setup", "business", "workspace", "connections", "account"].includes(
          requested,
        )
      )
        return;
      if (requested === "setup" && !canViewSetup) return;
      if (requested === "business" && !canViewBusiness) return;
      if (requested === "connections" && !canManageConnections) return;
      setSection(requested);
    };
    selectHash();
    window.addEventListener("hashchange", selectHash);
    return () => window.removeEventListener("hashchange", selectHash);
  }, [canManageConnections, canViewBusiness, canViewSetup]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h1>
            Settings<span className="heading-dot">.</span>
          </h1>
          <p>Your company workspace and account preferences.</p>
        </div>
      </div>
      <nav
        className={`settings-main-nav${canViewSetup || canViewBusiness ? "" : " personal-only"}`}
        aria-label="Settings categories"
      >
        {(
          [
            ...(canViewSetup
              ? ([["setup", "Get started", "Setup checklist"]] as const)
              : []),
            ...(canViewBusiness
              ? ([
                  ["business", "Business", "Brand, company, quotes & access"],
                ] as const)
              : []),
            ["workspace", "Workspace", "Display and tools"],
            ...(canManageConnections
              ? ([
                  [
                    "connections",
                    "Connections",
                    "Email, phone & developer access",
                  ],
                ] as const)
              : []),
            ["account", "My account", "Security & calendar"],
          ] as const
        ).map(([id, label, description]) => (
          <button
            key={id}
            type="button"
            className={visibleSection === id ? "active" : ""}
            aria-current={visibleSection === id ? "page" : undefined}
            onClick={() => selectSection(id)}
          >
            <strong>{label}</strong>
            <span>{description}</span>
          </button>
        ))}
      </nav>
      {canViewSetup && visibleSection === "setup" && (
        <BusinessOnboarding
          config={config}
          admin={canViewSetup}
          demo={demo}
          onNavigate={selectSection}
        />
      )}
      {canViewBusiness && (
        <div hidden={visibleSection !== "business"}>
          <BusinessSettings
            initial={config}
            admin
            demo={demo}
            capabilities={config.rolePermissions[user.group]}
          />
          {canManageAgreements && config.modules.agreements && (
            <AgreementTemplatesSettings demo={demo} />
          )}
          {canManageQuoteFlows && config.modules.agreements && (
            <QuoteFlowTemplatesSettings
              demo={demo}
              canPublish={canPublishQuoteFlows}
            />
          )}
          {user.group === "owner" && (
            <OrganizationLifecycleSettings
              demo={demo}
              organizationName={config.profile.name}
            />
          )}
        </div>
      )}
      {visibleSection === "workspace" && (
        <>
          <AppearanceSettings />
          <InstallAppPanel />
          {canManageAlerts && (
            <WorkspaceAlertSettings
              alerts={alerts}
              onSave={onSaveAlert}
              onRemove={onRemoveAlert}
            />
          )}
          {canViewAudit && <WorkspaceHistorySettings demo={demo} />}
          {canManageGeneration && <GenerationSettings demo={demo} admin />}
          {hasCapability("business.manage") &&
            config.profile.addressPriority === "wake" && (
              <div className="settings-section">
                <div className="settings-title">
                  <MapPin size={22} />
                  <div>
                    <h2>Address suggestions</h2>
                    <p>
                      Wake County address records are searched first. If there
                      is no local match, suggestions expand to other U.S.
                      addresses.
                    </p>
                  </div>
                </div>
                <div className="settings-details">
                  <label>
                    Priority region
                    <input value={addressPriorityRegion.name} readOnly />
                  </label>
                </div>
              </div>
            )}
        </>
      )}
      {canManageConnections && visibleSection === "connections" && (
        <>
          <div className="connections-intro">
            <span className="eyebrow">SET UP YOUR BUSINESS</span>
            <h2>Connect the tools your company uses.</h2>
            <p>
              Each business keeps its own mailbox and phone account. An
              administrator can connect them here; teammates do not need access
              to the credentials.
            </p>
          </div>
          <GoogleMailSettings demo={demo} />
          <TwilioSettings demo={demo} businessName={config.profile.name} />
          {hasCapability("payments.manage") && config.modules.payments && (
            <StripePaymentSettings demo={demo} />
          )}
          {canManageSecrets && <OrganizationSecretsSettings demo={demo} />}
          <details className="connections-advanced">
            <summary>
              Advanced connections <span>Developer API access</span>
            </summary>
            {canManageApiKeys ? (
              <ApiKeysSettings demo={demo} />
            ) : (
              <p>Your role cannot manage API keys.</p>
            )}
          </details>
        </>
      )}
      {visibleSection === "account" && (
        <>
          <div className="settings-section">
            <div className="settings-title">
              <LockKeyhole size={22} />
              <div>
                <h2>Account security</h2>
                <p>{user.email}</p>
              </div>
            </div>
            <form
              className="settings-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setMessage("");
                setError(false);
                if (demo) {
                  setError(true);
                  setMessage(
                    "Password changes are available in your real workspace.",
                  );
                  return;
                }
                setBusy(true);
                const form = e.currentTarget;
                try {
                  const fields = Object.fromEntries(new FormData(form));
                  if (fields.password !== fields.confirm)
                    throw new Error("The new passwords do not match.");
                  const response = await fetch("/api/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "password", ...fields }),
                  });
                  const data = await response.json();
                  if (!response.ok) throw new Error(data.error);
                  setMessage(
                    "Password updated. Other sessions have been signed out.",
                  );
                  form.reset();
                } catch (err) {
                  setError(true);
                  setMessage(
                    err instanceof Error
                      ? err.message
                      : "Could not update password.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Current password
                <input
                  type="password"
                  name="current"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                />
              </label>
              <div className="form-grid">
                <label>
                  New password
                  <input
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                    placeholder="At least 12 characters"
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    type="password"
                    name="confirm"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                  />
                </label>
              </div>
              {message && (
                <div className={error ? "alert" : "success-note"} role="status">
                  {message}
                </div>
              )}
              <button className="button primary" disabled={busy}>
                {busy ? "Updating…" : "Update password"}
              </button>
            </form>
          </div>
          <GoogleCalendarSettings demo={demo} />
        </>
      )}
    </>
  );
}
