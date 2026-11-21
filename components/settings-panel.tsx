"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronRight, Search } from "lucide-react";
import type { User, WorkspaceAlert } from "@/lib/types";
import type { BusinessConfig } from "@/lib/business-config";
import {
  organizationCapabilities,
  type NavigationPage,
} from "@/lib/business-config-schema";
import {
  canOpenSettings,
  resolveSettingsSection,
  settingsEntries,
} from "@/lib/settings-navigation";
import OperatingSettingsEditor from "./operating-settings-editor";
import GenerationSettings from "./generation-settings";
import { AppearanceSettings } from "./theme-controls";
import { InstallAppPanel } from "./pwa-install";
import TwilioSettings from "./twilio-settings";
import WorkspaceAlertSettings from "./workspace-alert-settings";
import WorkspaceHistorySettings from "./workspace-history-settings";
import GoogleCalendarSettings from "./google-calendar-settings";
import GoogleMailSettings from "./google-mail-settings";
import GoogleBusinessSettings from "./google-business-settings";
import ApiKeysSettings from "./api-keys-settings";
import BusinessSettings from "./business-settings";
import BusinessOnboarding from "./business-onboarding";
import OrganizationSecretsSettings from "./organization-secrets-settings";
import AgreementTemplatesSettings from "./agreement-templates-settings";
import QuoteFlowTemplatesSettings from "./quote-flow-templates-settings";
import StripePaymentSettings from "./stripe-payment-settings";
import OrganizationLifecycleSettings from "./organization-lifecycle-settings";
import AccountSecuritySettings from "./account-security-settings";
import { useOrganizationConnections } from "./use-organization-connections";
import styles from "./settings-navigation.module.css";

function ConnectionDirectory({
  demo,
  available,
  onSelect,
}: {
  demo: boolean;
  available: string[];
  onSelect: (id: string) => void;
}) {
  const { registry, loading, error, refresh } =
    useOrganizationConnections(demo);
  const connections = [
    {
      id: "email",
      capability: "google_mail",
      label: "Company email",
      detail: "Company Google account for sending email",
    },
    {
      id: "phone",
      capability: "twilio_sms",
      label: "Phone & texting",
      detail: "Shared Twilio account and phone number",
    },
    {
      id: "stripe",
      capability: "stripe_payments",
      label: "Stripe payments",
      detail: "Company payment processing account",
    },
    {
      id: "calendar",
      capability: "google_calendar",
      label: "My Google Calendar",
      detail: "Your personal calendar connection",
    },
    {
      id: "reviews",
      capability: null,
      label: "Google reviews",
      detail: "Google Business Profile account and location",
    },
  ] as const;
  return (
    <>
      {error && (
        <div className="alert" role="alert">
          {error}{" "}
          <button type="button" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}
      <div className={styles.links}>
        {connections
          .filter((item) => available.includes(item.id))
          .map((item) => {
            const status = item.capability
              ? registry?.capabilities[item.capability]
              : null;
            return (
              <button
                type="button"
                className={styles.link}
                key={item.id}
                onClick={() => onSelect(item.id)}
              >
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                  <span>
                    {item.capability
                      ? loading
                        ? "Checking connection..."
                        : error
                          ? "Status unavailable"
                          : status
                            ? {
                                ready: "Ready",
                                missing: "Needs setup",
                                degraded: "Needs attention",
                                disabled: "Disabled",
                              }[status.state]
                            : "Check setup"
                      : "Open to check connection"}
                    {demo && item.capability ? " - sample status" : ""}
                  </span>
                </div>
                <ChevronRight size={17} />
              </button>
            );
          })}
      </div>
    </>
  );
}

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
  const available = settingsEntries.filter((entry) =>
    canOpenSettings(entry, config, user.group),
  );
  const defaultId = available[0]?.id || "security";
  const [selected, setSelected] = useState(defaultId);
  const [visited, setVisited] = useState<string[]>([defaultId]);
  const [search, setSearch] = useState("");
  const [navigationNotice, setNavigationNotice] = useState("");
  const [businessDirty, setBusinessDirty] = useState(false);
  const dirtyRef = useRef(false);
  const updateBusinessDraft = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
    setBusinessDirty(dirty);
  }, []);
  const active =
    available.find((entry) => entry.id === selected) || available[0];
  const activeId = active.id;
  const capabilities =
    user.group === "owner"
      ? [...organizationCapabilities]
      : config.rolePermissions[user.group];
  const hasBusiness = available.some((entry) => entry.businessTab);
  const visible = available.filter((entry) =>
    [entry.label, entry.group, entry.description, ...entry.questions]
      .join(" ")
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const groups = [...new Set(visible.map((entry) => entry.group))];

  useEffect(() => {
    const applyLocation = () => {
      const next = resolveSettingsSection(window.location.hash);
      if (
        !settingsEntries.some(
          (entry) =>
            entry.id === next && canOpenSettings(entry, config, user.group),
        )
      )
        return;
      setSelected(next);
      setVisited((current) =>
        current.includes(next) ? current : [...current, next],
      );
    };
    applyLocation();
    window.addEventListener("hashchange", applyLocation);
    window.addEventListener("popstate", applyLocation);
    return () => {
      window.removeEventListener("hashchange", applyLocation);
      window.removeEventListener("popstate", applyLocation);
    };
  }, [config, user.group]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  function selectSection(value: string) {
    const id = resolveSettingsSection(value);
    if (!available.some((entry) => entry.id === id)) {
      setNavigationNotice(
        "This section is unavailable for your role or an enabled module. Ask a workspace owner to review access and module setup.",
      );
      return;
    }
    setNavigationNotice("");
    setSelected(id);
    setVisited((current) =>
      current.includes(id) ? current : [...current, id],
    );
    window.history.pushState(null, "", `#${id}`);
  }
  function workspaceHref(view: NavigationPage) {
    const params = new URLSearchParams();
    params.set("view", view);
    if (demo && user.group === "doorknocker") params.set("as", "doorknocker");
    return `${demo ? "/demo" : "/"}?${params}`;
  }
  function workspaceLink(view: NavigationPage, label: string, detail: string) {
    if (!config.roleNavigation[user.group].includes(view)) return null;
    return (
      <a className={styles.link} href={workspaceHref(view)}>
        <div>
          <strong>{label}</strong>
          <span>{detail}</span>
        </div>
        <ArrowUpRight size={17} />
      </a>
    );
  }
  function settingsLink(id: string, detail?: string) {
    const entry = available.find((item) => item.id === id);
    if (!entry) return null;
    return (
      <button
        type="button"
        className={styles.link}
        onClick={() => selectSection(id)}
      >
        <div>
          <strong>{entry.label}</strong>
          <span>{detail || entry.description}</span>
        </div>
        <ChevronRight size={17} />
      </button>
    );
  }
  function renderSection(id: string) {
    const entry = available.find((item) => item.id === id);
    if (!entry) return null;
    if (entry.workspace)
      return (
        <>
          <p className={styles.notice}>
            {id === "intake"
              ? "Open a lead to review its details or schedule a consultation. Customer self-booking rules are not configured on this page."
              : "Use the existing workspace to manage these records."}
          </p>
          {workspaceLink(
            entry.workspace,
            `Open ${entry.workspace.toLowerCase()}`,
            entry.description,
          )}
          {id === "schedule" && (
            <>
              {settingsLink("working-hours")}
              {settingsLink("calendar")}
            </>
          )}
        </>
      );
    const operatingSections = {
      "working-hours": "hours",
      "custom-fields": "customFields",
      forms: "forms",
      "invoice-defaults": "invoices",
      "message-templates": "messages",
    } as const;
    if (id in operatingSections)
      return (
        <OperatingSettingsEditor
          section={operatingSections[id as keyof typeof operatingSections]}
        />
      );
    switch (id) {
      case "setup":
        return (
          <BusinessOnboarding
            config={config}
            admin
            demo={demo}
            onNavigate={(section, target) =>
              selectSection(
                target ||
                  {
                    business: "company",
                    workspace: "appearance",
                    account: "security",
                    connections: "connections",
                  }[section],
              )
            }
          />
        );
      case "email":
        return <GoogleMailSettings demo={demo} />;
      case "phone":
        return (
          <TwilioSettings demo={demo} businessName={config.profile.name} />
        );
      case "reviews":
        return <GoogleBusinessSettings demo={demo} />;
      case "stripe":
        return <StripePaymentSettings demo={demo} />;
      case "calendar":
        return <GoogleCalendarSettings demo={demo} />;
      case "agreements":
        return <AgreementTemplatesSettings demo={demo} />;
      case "quote-flows":
        return (
          <QuoteFlowTemplatesSettings
            demo={demo}
            canPublish={capabilities.includes("quote_flows.publish")}
          />
        );
      case "alerts":
        return (
          <WorkspaceAlertSettings
            alerts={alerts}
            onSave={onSaveAlert}
            onRemove={onRemoveAlert}
          />
        );
      case "history":
        return <WorkspaceHistorySettings demo={demo} />;
      case "generation":
        return <GenerationSettings demo={demo} admin />;
      case "secrets":
        return <OrganizationSecretsSettings demo={demo} />;
      case "api-keys":
        return <ApiKeysSettings demo={demo} />;
      case "organization":
        return (
          <OrganizationLifecycleSettings
            demo={demo}
            organizationName={config.profile.name}
          />
        );
      case "security":
        return <AccountSecuritySettings email={user.email} demo={demo} />;
      case "appearance":
        return (
          <>
            <AppearanceSettings />
            <InstallAppPanel />
          </>
        );
      case "connections":
        return (
          <ConnectionDirectory
            demo={demo}
            available={available.map((item) => item.id)}
            onSelect={selectSection}
          />
        );
      case "portal":
        return (
          <>
            {capabilities.includes("business.manage") && (
              <OperatingSettingsEditor section="portal" />
            )}
            <p className={styles.notice}>
              Manage a customer&apos;s portal link from their quote or project.
              Existing links continue to open the same customer/project context.
            </p>
            <div className={styles.links}>
              {settingsLink("brand")}
              {settingsLink(
                "quotes",
                "Choose the price detail customers see in their quote and PDF.",
              )}
              {settingsLink("quote-flows")}
              {workspaceLink(
                "Quotes",
                "Open customer quotes",
                "Manage customer access and share an existing portal link.",
              )}
              {workspaceLink(
                "Projects",
                "Open projects",
                "Review project schedules and customer portal links.",
              )}
            </div>
          </>
        );
      case "messages":
        return (
          <>
            <p className={styles.notice}>
              Sending accounts are shared company connections. Message timing,
              actions and notification recipients are configured in the existing
              workflow editor.
            </p>
            <div className={styles.links}>
              {settingsLink("message-templates")}
              {settingsLink("email")}
              {settingsLink("phone")}
              {settingsLink("compliance")}
              {settingsLink("automations")}
            </div>
          </>
        );
      default:
        return null;
    }
  }
  const searchField = (id: string) => (
    <div className={styles.search}>
      <Search size={15} aria-hidden="true" />
      <input
        id={id}
        aria-label="Search settings"
        placeholder="Search settings"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
    </div>
  );
  const mounted = [...new Set([...visited, activeId])].filter((id) =>
    available.some((entry) => entry.id === id && !entry.businessTab),
  );
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
      <div className={styles.mobile}>
        {searchField("mobile-settings-search")}
        <label htmlFor="settings-section">Settings section</label>
        <select
          id="settings-section"
          value={visible.some((entry) => entry.id === activeId) ? activeId : ""}
          onChange={(event) => {
            selectSection(event.target.value);
            setSearch("");
          }}
        >
          {!visible.some((entry) => entry.id === activeId) && (
            <option value="">
              {visible.length
                ? "Choose a matching section"
                : "No matching sections"}
            </option>
          )}
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {visible
                .filter((entry) => entry.group === group)
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className={styles.layout}>
        <nav className={styles.sidebar} aria-label="Settings categories">
          {searchField("desktop-settings-search")}
          {groups.map((group) => (
            <section className={styles.group} key={group}>
              <h2>{group}</h2>
              {visible
                .filter((entry) => entry.group === group)
                .map((entry) => (
                  <button
                    className={styles.entry}
                    key={entry.id}
                    type="button"
                    aria-current={activeId === entry.id ? "page" : undefined}
                    onClick={() => selectSection(entry.id)}
                  >
                    {entry.label}
                    {activeId === entry.id && (
                      <ChevronRight size={13} aria-hidden="true" />
                    )}
                  </button>
                ))}
            </section>
          ))}
          {!visible.length && (
            <p className={styles.notice}>
              No matching settings. Try company, phone or calendar.
            </p>
          )}
        </nav>
        <div className={styles.content}>
          {navigationNotice && (
            <p className="alert" role="alert">
              {navigationNotice}
            </p>
          )}
          <header className={styles.header}>
            <div className={styles.breadcrumb}>
              <span>Settings</span>
              <ChevronRight size={12} />
              <span>{active.group}</span>
              <span className={styles.scope}>
                {active.scope === "personal"
                  ? "Your account"
                  : active.id === "connections" || active.id === "schedule"
                    ? "Company & personal"
                    : "Company workspace"}
              </span>
            </div>
            <h2>{active.label}</h2>
            <p>{active.description}</p>
            <details className={styles.guide} key={activeId}>
              <summary>What can I configure here?</summary>
              <ul>
                {active.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </details>
          </header>
          {businessDirty && (
            <div className={styles.draft} role="status">
              Your unsaved business changes are kept while you browse settings.{" "}
              {!active.businessTab && (
                <button type="button" onClick={() => selectSection("company")}>
                  Review & save
                </button>
              )}
            </div>
          )}
          {hasBusiness && (
            <div hidden={!active.businessTab}>
              <BusinessSettings
                initial={config}
                admin
                demo={demo}
                capabilities={capabilities}
                section={
                  active.businessTab ||
                  available.find((entry) => entry.businessTab)?.businessTab
                }
                onDraftChange={updateBusinessDraft}
              />
            </div>
          )}
          {mounted.map((id) => (
            <div hidden={id !== activeId} key={id}>
              {renderSection(id)}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
