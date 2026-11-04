"use client";

import { useState } from "react";
import BrandAssetPreview, {
  type BrandPreviewKind,
} from "./brand-asset-preview";
import type { BusinessConfig } from "@/lib/business-config";
import {
  navigationFromRoles,
  organizationCapabilities,
  organizationCapabilityLabels,
  type OrganizationCapability,
} from "@/lib/business-config-schema";
import { workspaceGroups, type WorkspaceGroup } from "@/lib/types";
import RoleTabAccessEditor from "./role-tab-access-editor";

const moduleOptions: Array<{
  id: keyof BusinessConfig["modules"];
  label: string;
  description: string;
}> = [
  {
    id: "priceBook",
    label: "Price book",
    description: "Reusable labor, material, and contractor pricing.",
  },
  {
    id: "payments",
    label: "Payments",
    description: "Online or manual payment collection in customer flows.",
  },
  {
    id: "doorKnocking",
    label: "Door knocking",
    description: "Field canvassing, visits, and follow-up intake.",
  },
  {
    id: "imageGeneration",
    label: "Image generation",
    description: "AI-assisted renovation concept generation.",
  },
  {
    id: "media",
    label: "Media",
    description: "AI-assisted blog and marketing content creation.",
  },
  {
    id: "automations",
    label: "Automations",
    description: "Decision-tree workflows, webhooks, and actions.",
  },
  {
    id: "agreements",
    label: "Agreements",
    description: "Organization-owned document templates and signing setup.",
  },
];

const roleLabels: Record<WorkspaceGroup, string> = {
  owner: "Owner",
  admin: "Admin",
  office: "Office",
  crew: "Crew",
  field: "Field",
  doorknocker: "Door knocker",
};

type BusinessTab =
  | "brand"
  | "details"
  | "modules"
  | "compliance"
  | "quotes"
  | "access"
  | "permissions";
const businessTabs: { id: BusinessTab; label: string }[] = [
  { id: "brand", label: "Brand" },
  { id: "details", label: "Business details" },
  { id: "modules", label: "Modules" },
  { id: "compliance", label: "Compliance & region" },
  { id: "quotes", label: "Quotes & payments" },
  { id: "access", label: "Tab access by role" },
  { id: "permissions", label: "Permissions" },
];

export default function BusinessSettings({
  initial,
  admin,
  demo,
  capabilities,
}: {
  initial: BusinessConfig;
  admin: boolean;
  demo: boolean;
  capabilities: OrganizationCapability[];
}) {
  const canBrand = capabilities.includes("branding.manage");
  const canBusiness = capabilities.includes("business.manage");
  const canCompliance = capabilities.includes("compliance.manage");
  const canPermissions = capabilities.includes("permissions.manage");
  const visibleTabs = businessTabs.filter((tab) => {
    if (tab.id === "brand") return canBrand;
    if (tab.id === "details" || tab.id === "modules" || tab.id === "quotes")
      return canBusiness;
    if (tab.id === "compliance") return canCompliance || canBusiness;
    return canPermissions;
  });
  const [config, setConfig] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<BusinessTab>(
    visibleTabs[0]?.id || "details",
  );
  const [previewVersion, setPreviewVersion] = useState(0);
  const [previewAsset, setPreviewAsset] = useState<BrandPreviewKind | null>(
    null,
  );

  function updateProfile(key: keyof BusinessConfig["profile"], value: string) {
    setConfig((current) => ({
      ...current,
      profile: { ...current.profile, [key]: value },
    }));
  }
  function updateCompliance(
    key: keyof BusinessConfig["compliance"],
    value: string,
  ) {
    setConfig((current) => ({
      ...current,
      compliance: { ...current.compliance, [key]: value },
    }));
  }
  function updateRegional(
    key: keyof BusinessConfig["regional"],
    value: string,
  ) {
    setConfig((current) => ({
      ...current,
      regional: { ...current.regional, [key]: value },
    }));
  }
  function toggleModule(
    key: keyof BusinessConfig["modules"],
    enabled: boolean,
  ) {
    setConfig((current) => ({
      ...current,
      modules: { ...current.modules, [key]: enabled },
      features: {
        ...current.features,
        ...(key === "priceBook" ||
        key === "payments" ||
        key === "doorKnocking" ||
        key === "imageGeneration"
          ? { [key]: enabled }
          : {}),
      },
      quotePreferences:
        key === "payments" && !enabled
          ? { ...current.quotePreferences, paymentProvider: "manual" }
          : current.quotePreferences,
    }));
  }
  function togglePermission(
    group: WorkspaceGroup,
    capability: OrganizationCapability,
    enabled: boolean,
  ) {
    if (group === "owner") return;
    setConfig((current) => ({
      ...current,
      rolePermissions: {
        ...current.rolePermissions,
        [group]: enabled
          ? [...current.rolePermissions[group], capability]
          : current.rolePermissions[group].filter(
              (permission) => permission !== capability,
            ),
      },
    }));
  }
  async function uploadAsset(
    asset: "logo" | "logo-dark" | "logo-mark" | "banner",
    file: File,
  ) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set(asset === "logo" ? "logo" : "image", file);
      const response = await fetch(
        asset === "logo"
          ? "/api/business-logo"
          : `/api/business-branding/${asset}`,
        { method: "POST", body: form },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not upload image.");
      const field = {
        logo: "logoUrl",
        "logo-dark": "logoDarkUrl",
        "logo-mark": "logoMarkUrl",
        banner: "bannerUrl",
      } as const;
      updateProfile(field[asset], asset === "logo" ? body.logoUrl : body.url);
      setPreviewVersion(Date.now());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not upload image.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset(asset: "logo-dark" | "logo-mark" | "banner") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/business-branding/${asset}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not remove image.");
      const field = {
        "logo-dark": "logoDarkUrl",
        "logo-mark": "logoMarkUrl",
        banner: "bannerUrl",
      } as const;
      updateProfile(field[asset], "");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not remove image.",
      );
    } finally {
      setBusy(false);
    }
  }

  function previewUrl(url: string) {
    return url.startsWith("/api/") && previewVersion
      ? `${url}?v=${previewVersion}`
      : url;
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (demo)
        throw new Error("Business settings are available in a real workspace.");
      const response = await fetch("/api/business-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not save business settings.");
      window.location.reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save business settings.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="business-settings-panel">
      <div className="business-settings-heading">
        <div>
          <h2>Business setup</h2>
          <p>
            Brand assets, company information, quoting, and workspace access.
          </p>
        </div>
      </div>
      <nav className="settings-subnav" aria-label="Business settings">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-current={activeTab === tab.id ? "page" : undefined}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <form className="settings-form" onSubmit={save}>
        {activeTab === "brand" && (
          <div className="business-settings-content">
            <div className="business-panel-intro">
              <h3>Brand assets</h3>
              <p>
                Upload the versions used across your workspace and client
                materials. Images are stored for this organization only.
              </p>
            </div>
            <div className="brand-asset-grid">
              <div className="brand-asset">
                <div className="brand-asset-preview light">
                  {config.profile.logoUrl ? (
                    <img
                      src={previewUrl(config.profile.logoUrl)}
                      alt={`${config.profile.name} logo preview`}
                    />
                  ) : (
                    <span>{config.profile.name}</span>
                  )}
                </div>
                <div className="brand-asset-copy">
                  <strong>Primary logo</strong>
                  <span>Used in the workspace, quote, PDF, and email.</span>
                </div>
                <div className="brand-asset-actions">
                  <button
                    type="button"
                    className="brand-preview-button"
                    onClick={() => setPreviewAsset("logo")}
                  >
                    See in context
                  </button>
                  {canBrand && (
                    <label className="brand-upload">
                      Replace image
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={busy || demo}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadAsset("logo", file);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
              <div className="brand-asset">
                <div className="brand-asset-preview dark">
                  {config.profile.logoDarkUrl ? (
                    <img
                      src={previewUrl(config.profile.logoDarkUrl)}
                      alt={`${config.profile.name} dark-background logo preview`}
                    />
                  ) : (
                    <span>Optional logo for dark backgrounds</span>
                  )}
                </div>
                <div className="brand-asset-copy">
                  <strong>White / reversed logo</strong>
                  <span>Use a light-colored version for dark backgrounds.</span>
                </div>
                <div className="brand-asset-actions">
                  <button
                    type="button"
                    className="brand-preview-button"
                    onClick={() => setPreviewAsset("logo-dark")}
                  >
                    See in context
                  </button>
                  {canBrand && (
                    <>
                      <label className="brand-upload">
                        {config.profile.logoDarkUrl
                          ? "Replace image"
                          : "Upload image"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={busy || demo}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadAsset("logo-dark", file);
                            event.target.value = "";
                          }}
                        />
                      </label>
                      {config.profile.logoDarkUrl && (
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy || demo}
                          onClick={() => void removeAsset("logo-dark")}
                        >
                          Remove
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="brand-asset square-mark">
                <div className="brand-asset-preview light">
                  {config.profile.logoMarkUrl ? (
                    <img
                      src={previewUrl(config.profile.logoMarkUrl)}
                      alt={`${config.profile.name} square mark preview`}
                    />
                  ) : (
                    <span>Optional square mark</span>
                  )}
                </div>
                <div className="brand-asset-copy">
                  <strong>Square mark</strong>
                  <span>
                    Shown beside the business name in the workspace switcher.
                  </span>
                </div>
                <div className="brand-asset-actions">
                  <button
                    type="button"
                    className="brand-preview-button"
                    onClick={() => setPreviewAsset("logo-mark")}
                  >
                    See in context
                  </button>
                  {canBrand && (
                    <>
                      <label className="brand-upload">
                        {config.profile.logoMarkUrl
                          ? "Replace image"
                          : "Upload image"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={busy || demo}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadAsset("logo-mark", file);
                            event.target.value = "";
                          }}
                        />
                      </label>
                      {config.profile.logoMarkUrl && (
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy || demo}
                          onClick={() => void removeAsset("logo-mark")}
                        >
                          Remove
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="brand-asset banner">
                <div className="brand-asset-preview banner">
                  {config.profile.bannerUrl ? (
                    <img
                      src={previewUrl(config.profile.bannerUrl)}
                      alt={`${config.profile.name} banner preview`}
                    />
                  ) : (
                    <span>No banner uploaded</span>
                  )}
                </div>
                <div className="brand-asset-copy">
                  <strong>Client portal banner</strong>
                  <span>
                    Wide image shown above the portal content. Recommended
                    ratio: 3:1.
                  </span>
                </div>
                <div className="brand-asset-actions">
                  <button
                    type="button"
                    className="brand-preview-button"
                    onClick={() => setPreviewAsset("banner")}
                  >
                    See in context
                  </button>
                  {canBrand && (
                    <>
                      <label className="brand-upload">
                        {config.profile.bannerUrl
                          ? "Replace image"
                          : "Upload image"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={busy || demo}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadAsset("banner", file);
                            event.target.value = "";
                          }}
                        />
                      </label>
                      {config.profile.bannerUrl && (
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy || demo}
                          onClick={() => void removeAsset("banner")}
                        >
                          Remove
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === "details" && (
          <div className="business-settings-content">
            <div className="business-panel-intro">
              <h3>Business details</h3>
              <p>
                These details identify your company across the workspace and
                quotes.
              </p>
            </div>
            <div className="form-grid">
              <label>
                Company name
                <input
                  value={config.profile.name}
                  maxLength={120}
                  disabled={!canBusiness}
                  onChange={(event) =>
                    updateProfile("name", event.target.value)
                  }
                  required
                />
              </label>
              <label>
                Website
                <input
                  type="url"
                  value={config.profile.website}
                  disabled={!canBusiness}
                  onChange={(event) =>
                    updateProfile("website", event.target.value)
                  }
                />
              </label>
              <label>
                Contact email
                <input
                  type="email"
                  value={config.profile.email}
                  disabled={!canBusiness}
                  onChange={(event) =>
                    updateProfile("email", event.target.value)
                  }
                />
              </label>
              <label>
                Phone
                <input
                  value={config.profile.phone}
                  disabled={!canBusiness}
                  onChange={(event) =>
                    updateProfile("phone", event.target.value)
                  }
                />
              </label>
              <label>
                Address suggestions
                <select
                  value={config.profile.addressPriority}
                  disabled={!canBusiness}
                  onChange={(event) =>
                    updateProfile("addressPriority", event.target.value)
                  }
                >
                  <option value="nationwide">Nationwide U.S.</option>
                  <option value="wake">Wake County first</option>
                </select>
              </label>
            </div>
          </div>
        )}
        {activeTab === "modules" && (
          <div className="business-settings-content">
            <div className="business-panel-intro">
              <h3>Business modules</h3>
              <p>
                Turn on only the product areas this organization uses. Role
                access still decides which people can see and manage them.
              </p>
            </div>
            <div className="business-module-grid">
              {moduleOptions.map((module) => (
                <label key={module.id} className="business-module-option">
                  <input
                    type="checkbox"
                    checked={config.modules[module.id]}
                    disabled={!canBusiness}
                    onChange={(event) =>
                      toggleModule(module.id, event.target.checked)
                    }
                  />
                  <span>
                    <strong>{module.label}</strong>
                    <small>{module.description}</small>
                  </span>
                </label>
              ))}
            </div>
            <p className="generation-note">
              Disabling a module hides its workspace entry points. Existing
              records and configuration are retained and return if the module is
              enabled again.
            </p>
          </div>
        )}
        {activeTab === "quotes" && (
          <div className="business-settings-content">
            <div className="business-panel-intro">
              <h3>Quotes & payments</h3>
              <p>Choose which tools appear in the quote workflow.</p>
            </div>
            <div className="form-grid">
              <label className="business-option">
                <input
                  type="checkbox"
                  checked={config.quotePreferences.showPriceBookPicker}
                  disabled={!canBusiness || !config.modules.priceBook}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      quotePreferences: {
                        ...current.quotePreferences,
                        showPriceBookPicker: event.target.checked,
                      },
                    }))
                  }
                />
                Show price-book picker on quotes
              </label>
              <label className="business-option">
                <input
                  type="checkbox"
                  checked={config.quotePreferences.showInternalCosts}
                  disabled={!canBusiness}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      quotePreferences: {
                        ...current.quotePreferences,
                        showInternalCosts: event.target.checked,
                      },
                    }))
                  }
                />
                Show internal costs in quote editor
              </label>
            </div>
            <label>
              Customer quote price detail
              <select
                value={
                  config.quotePreferences.showCustomerLineItemPrices
                    ? "itemized"
                    : "total"
                }
                disabled={!canBusiness}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    quotePreferences: {
                      ...current.quotePreferences,
                      showCustomerLineItemPrices:
                        event.target.value === "itemized",
                    },
                  }))
                }
              >
                <option value="total">Scope and project total only</option>
                <option value="itemized">Itemized line prices</option>
              </select>
              <small className="footnote">
                Controls the client portal and quote PDF. Internal pricing stays
                visible in the workspace.
              </small>
            </label>
            <label>
              Payment method for online links
              <select
                value={config.quotePreferences.paymentProvider}
                disabled={!canBusiness || !config.modules.payments}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    quotePreferences: {
                      ...current.quotePreferences,
                      paymentProvider: event.target.value as
                        "stripe" | "manual",
                    },
                  }))
                }
              >
                <option value="stripe">Stripe</option>
                <option value="manual">Manual payments only</option>
              </select>
            </label>
          </div>
        )}
        {activeTab === "compliance" && (
          <div className="business-settings-content">
            <div className="business-panel-intro">
              <h3>Compliance & region</h3>
              <p>
                Organization-owned legal, messaging, check-payment, and regional
                defaults used throughout this workspace.
              </p>
            </div>
            <div className="settings-field-group">
              <div>
                <strong>Customer communication</strong>
                <span>
                  Used in consent records, HELP responses, and notices.
                </span>
              </div>
              <div className="form-grid">
                <label>
                  Legal business name
                  <input
                    value={config.compliance.legalName}
                    disabled={!canCompliance}
                    onChange={(event) =>
                      updateCompliance("legalName", event.target.value)
                    }
                  />
                </label>
                <label>
                  SMS program name
                  <input
                    value={config.compliance.smsProgramName}
                    disabled={!canCompliance}
                    onChange={(event) =>
                      updateCompliance("smsProgramName", event.target.value)
                    }
                  />
                </label>
                <label>
                  Privacy policy URL
                  <input
                    type="url"
                    value={config.compliance.privacyUrl}
                    disabled={!canCompliance}
                    onChange={(event) =>
                      updateCompliance("privacyUrl", event.target.value)
                    }
                  />
                </label>
                <label>
                  Terms URL
                  <input
                    type="url"
                    value={config.compliance.termsUrl}
                    disabled={!canCompliance}
                    onChange={(event) =>
                      updateCompliance("termsUrl", event.target.value)
                    }
                  />
                </label>
                <label>
                  SMS policy version
                  <input
                    value={config.compliance.smsPolicyVersion}
                    disabled={!canCompliance}
                    onChange={(event) =>
                      updateCompliance("smsPolicyVersion", event.target.value)
                    }
                    placeholder="2026-10-21"
                  />
                </label>
                <label>
                  Compliance help email
                  <input
                    type="email"
                    value={config.compliance.helpEmail}
                    disabled={!canCompliance}
                    onChange={(event) =>
                      updateCompliance("helpEmail", event.target.value)
                    }
                  />
                </label>
                <label>
                  Compliance help phone
                  <input
                    value={config.compliance.helpPhone}
                    disabled={!canCompliance}
                    onChange={(event) =>
                      updateCompliance("helpPhone", event.target.value)
                    }
                  />
                </label>
              </div>
            </div>
            <div className="settings-field-group">
              <div>
                <strong>Checks</strong>
                <span>Default instructions for customers paying offline.</span>
              </div>
              <div className="form-grid">
                <label>
                  Make checks payable to
                  <input
                    value={config.compliance.checkPayee}
                    disabled={!canCompliance}
                    onChange={(event) =>
                      updateCompliance("checkPayee", event.target.value)
                    }
                  />
                </label>
                <label>
                  Check mailing address
                  <input
                    value={config.compliance.checkMailingAddress}
                    disabled={!canCompliance}
                    onChange={(event) =>
                      updateCompliance(
                        "checkMailingAddress",
                        event.target.value,
                      )
                    }
                  />
                </label>
              </div>
            </div>
            <div className="settings-field-group">
              <div>
                <strong>Regional defaults</strong>
                <span>
                  Used for dates, money, scheduling, and service context.
                </span>
              </div>
              <div className="form-grid">
                <label>
                  Country
                  <input value="United States" readOnly />
                </label>
                <label>
                  Currency
                  <input value="USD" readOnly />
                </label>
                <label>
                  Locale
                  <input
                    value={config.regional.locale}
                    disabled={!canBusiness}
                    onChange={(event) =>
                      updateRegional("locale", event.target.value)
                    }
                  />
                </label>
                <label>
                  Time zone
                  <input
                    value={config.regional.timezone}
                    disabled={!canBusiness}
                    onChange={(event) =>
                      updateRegional("timezone", event.target.value)
                    }
                    placeholder="America/New_York"
                  />
                </label>
                <label>
                  Service area
                  <input
                    value={config.regional.serviceArea}
                    disabled={!canBusiness}
                    onChange={(event) =>
                      updateRegional("serviceArea", event.target.value)
                    }
                  />
                </label>
              </div>
            </div>
          </div>
        )}
        {activeTab === "access" && (
          <div className="business-settings-content">
            <div className="business-panel-intro">
              <h3>Tab access by role</h3>
              <p>
                Choose what each role sees in the left navigation and arrange
                the tabs in the order they should appear.
              </p>
            </div>
            <RoleTabAccessEditor
              roleNavigation={config.roleNavigation}
              admin={canPermissions}
              onChange={(roleNavigation) =>
                setConfig((current) => ({
                  ...current,
                  roleNavigation,
                  navigation: navigationFromRoles(roleNavigation),
                }))
              }
            />
          </div>
        )}
        {activeTab === "permissions" && (
          <div className="business-settings-content">
            <div className="business-panel-intro">
              <h3>Permissions by role</h3>
              <p>
                Tab access controls what people see. Permissions control what
                they can configure. Owners always retain full recovery access.
              </p>
            </div>
            <div className="permission-matrix-wrap">
              <table className="permission-matrix">
                <thead>
                  <tr>
                    <th scope="col">Capability</th>
                    {workspaceGroups.map((group) => (
                      <th scope="col" key={group}>
                        {roleLabels[group]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {organizationCapabilities.map((capability) => (
                    <tr key={capability}>
                      <th scope="row">
                        <strong>
                          {organizationCapabilityLabels[capability].label}
                        </strong>
                        <span>
                          {organizationCapabilityLabels[capability].description}
                        </span>
                      </th>
                      {workspaceGroups.map((group) => {
                        const checked =
                          group === "owner" ||
                          config.rolePermissions[group].includes(capability);
                        return (
                          <td key={group}>
                            <input
                              type="checkbox"
                              aria-label={`${roleLabels[group]}: ${organizationCapabilityLabels[capability].label}`}
                              checked={checked}
                              disabled={!canPermissions || group === "owner"}
                              onChange={(event) =>
                                togglePermission(
                                  group,
                                  capability,
                                  event.target.checked,
                                )
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {admin && visibleTabs.length > 0 && (
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save business settings"}
          </button>
        )}
      </form>
      {previewAsset && (
        <BrandAssetPreview
          kind={previewAsset}
          profile={config.profile}
          previewUrl={previewUrl}
          onClose={() => setPreviewAsset(null)}
        />
      )}
    </div>
  );
}
