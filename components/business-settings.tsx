"use client";

import { useState } from "react";
import BrandAssetPreview, {
  type BrandPreviewKind,
} from "./brand-asset-preview";
import type { BusinessConfig } from "@/lib/business-config";
import {
  doorKnockerPages,
  navigationPages,
} from "@/lib/business-config-schema";
import { workspaceGroups, type WorkspaceGroup } from "@/lib/types";

const roleLabels: Record<WorkspaceGroup, string> = {
  owner: "Owner",
  admin: "Admin",
  office: "Office",
  crew: "Crew",
  field: "Field",
  doorknocker: "Door knocker",
};

const labels = {
  priceBook: "Price book",
  payments: "Payment links",
  doorKnocking: "Door knocking",
  imageGeneration: "Image generation",
} as const;

type BusinessTab = "brand" | "details" | "quotes" | "access";
const businessTabs: { id: BusinessTab; label: string }[] = [
  { id: "brand", label: "Brand" },
  { id: "details", label: "Business details" },
  { id: "quotes", label: "Quotes & payments" },
  { id: "access", label: "Navigation & access" },
];

export default function BusinessSettings({
  initial,
  admin,
  demo,
}: {
  initial: BusinessConfig;
  admin: boolean;
  demo: boolean;
}) {
  const [config, setConfig] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedRole, setSelectedRole] = useState<WorkspaceGroup>("admin");
  const [activeTab, setActiveTab] = useState<BusinessTab>("brand");
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
        {businessTabs.map((tab) => (
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
                  {admin && (
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
                  {admin && (
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
                  {admin && (
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
                  {admin && (
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
            <p className="footnote">
              PNG, JPG, or WebP · up to 4 MB. Uploads save immediately.
            </p>
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
                  disabled={!admin}
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
                  disabled={!admin}
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
                  disabled={!admin}
                  onChange={(event) =>
                    updateProfile("email", event.target.value)
                  }
                />
              </label>
              <label>
                Phone
                <input
                  value={config.profile.phone}
                  disabled={!admin}
                  onChange={(event) =>
                    updateProfile("phone", event.target.value)
                  }
                />
              </label>
              <label>
                Address suggestions
                <select
                  value={config.profile.addressPriority}
                  disabled={!admin}
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
        {activeTab === "quotes" && (
          <div className="business-settings-content">
            <div className="business-panel-intro">
              <h3>Quotes & payments</h3>
              <p>Choose which tools appear in the quote workflow.</p>
            </div>
            <div className="form-grid">
              {Object.entries(labels).map(([key, label]) => (
                <label key={key} className="business-option">
                  <input
                    type="checkbox"
                    checked={
                      config.features[key as keyof BusinessConfig["features"]]
                    }
                    disabled={!admin}
                    onChange={(event) =>
                      setConfig((current) => ({
                        ...current,
                        features: {
                          ...current.features,
                          [key]: event.target.checked,
                        },
                      }))
                    }
                  />
                  {label}
                </label>
              ))}
              <label className="business-option">
                <input
                  type="checkbox"
                  checked={config.quotePreferences.showPriceBookPicker}
                  disabled={!admin || !config.features.priceBook}
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
                  disabled={!admin}
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
              Payment method for online links
              <select
                value={config.quotePreferences.paymentProvider}
                disabled={!admin}
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
        {activeTab === "access" && (
          <div className="business-settings-content">
            <div className="business-panel-intro">
              <h3>Navigation & access</h3>
              <p>
                Set the tabs available to your company, then refine access by
                role.
              </p>
            </div>
            <div>
              <strong>Left navigation</strong>
              <p className="footnote">
                Choose the sections available to this company and their order.
                Role access below further limits who sees each section.
              </p>
              <div className="business-navigation-list">
                {navigationPages.map((name) => {
                  const index = config.navigation.indexOf(name);
                  return (
                    <div className="member-row" key={name}>
                      <label className="business-option">
                        <input
                          type="checkbox"
                          checked={index >= 0}
                          disabled={!admin || name === "Settings"}
                          onChange={(event) =>
                            setConfig((current) => ({
                              ...current,
                              navigation: event.target.checked
                                ? [...current.navigation, name]
                                : current.navigation.filter(
                                    (entry) => entry !== name,
                                  ),
                            }))
                          }
                        />
                        {name}
                      </label>
                      {admin && index >= 0 && (
                        <div className="page-heading-actions">
                          <button
                            type="button"
                            className="button secondary"
                            disabled={index === 0}
                            onClick={() =>
                              setConfig((current) => {
                                const navigation = [...current.navigation];
                                [navigation[index - 1], navigation[index]] = [
                                  navigation[index],
                                  navigation[index - 1],
                                ];
                                return { ...current, navigation };
                              })
                            }
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            className="button secondary"
                            disabled={index === config.navigation.length - 1}
                            onClick={() =>
                              setConfig((current) => {
                                const navigation = [...current.navigation];
                                [navigation[index], navigation[index + 1]] = [
                                  navigation[index + 1],
                                  navigation[index],
                                ];
                                return { ...current, navigation };
                              })
                            }
                          >
                            Down
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <strong>Tab access by role</strong>
              <p className="footnote">
                Choose which workspace tabs each role can open. Door knocking is
                assigned to door knockers by default. Settings stays available
                to everyone.
              </p>
              <label>
                Role
                <select
                  value={selectedRole}
                  onChange={(event) =>
                    setSelectedRole(event.target.value as WorkspaceGroup)
                  }
                >
                  {workspaceGroups.map((group) => (
                    <option key={group} value={group}>
                      {roleLabels[group]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="business-navigation-list">
                {navigationPages.map((name) => {
                  const companyEnabled = config.navigation.includes(name);
                  const fieldSupported =
                    selectedRole !== "doorknocker" ||
                    doorKnockerPages.includes(name);
                  return (
                    <div className="member-row" key={name}>
                      <label className="business-option">
                        <input
                          type="checkbox"
                          checked={config.roleNavigation[selectedRole].includes(
                            name,
                          )}
                          disabled={
                            !admin ||
                            name === "Settings" ||
                            !companyEnabled ||
                            !fieldSupported
                          }
                          onChange={(event) =>
                            setConfig((current) => ({
                              ...current,
                              roleNavigation: {
                                ...current.roleNavigation,
                                [selectedRole]: event.target.checked
                                  ? [
                                      ...current.roleNavigation[selectedRole],
                                      name,
                                    ]
                                  : current.roleNavigation[selectedRole].filter(
                                      (page) => page !== name,
                                    ),
                              },
                            }))
                          }
                        />
                        {name}
                      </label>
                      {!companyEnabled && <small>Off for company</small>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {admin && (
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
