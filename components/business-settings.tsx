"use client";

import { useState } from "react";
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

  function updateProfile(key: keyof BusinessConfig["profile"], value: string) {
    setConfig((current) => ({
      ...current,
      profile: { ...current.profile, [key]: value },
    }));
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
    <div className="settings-section">
      <div className="settings-title">
        <div>
          <h2>Business setup</h2>
          <p>
            Branding, modules, quote tools, and navigation for this
            organization.
          </p>
        </div>
      </div>
      <form className="settings-form" onSubmit={save}>
        <div className="form-grid">
          <label>
            Company name
            <input
              value={config.profile.name}
              maxLength={120}
              disabled={!admin}
              onChange={(event) => updateProfile("name", event.target.value)}
              required
            />
          </label>
          <label>
            Website
            <input
              type="url"
              value={config.profile.website}
              disabled={!admin}
              onChange={(event) => updateProfile("website", event.target.value)}
            />
          </label>
          <label>
            Contact email
            <input
              type="email"
              value={config.profile.email}
              disabled={!admin}
              onChange={(event) => updateProfile("email", event.target.value)}
            />
          </label>
          <label>
            Phone
            <input
              value={config.profile.phone}
              disabled={!admin}
              onChange={(event) => updateProfile("phone", event.target.value)}
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
          <label>
            Logo URL
            <input
              value={config.profile.logoUrl}
              disabled={!admin}
              onChange={(event) => updateProfile("logoUrl", event.target.value)}
              placeholder="/images/logo.png or https://…"
            />
          </label>
          {admin && (
            <label>
              Upload logo (PNG, JPG, WebP)
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy || demo}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  setError("");
                  try {
                    const form = new FormData();
                    form.set("logo", file);
                    const response = await fetch("/api/business-logo", {
                      method: "POST",
                      body: form,
                    });
                    const body = await response.json();
                    if (!response.ok)
                      throw new Error(body.error || "Could not upload logo.");
                    updateProfile("logoUrl", body.logoUrl);
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Could not upload logo.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
          )}
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
                  paymentProvider: event.target.value as "stripe" | "manual",
                },
              }))
            }
          >
            <option value="stripe">Stripe</option>
            <option value="manual">Manual payments only</option>
          </select>
        </label>
        <div>
          <strong>Left navigation</strong>
          <p className="footnote">
            Choose the sections available to this company and their order. Role
            access below further limits who sees each section.
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
            assigned to door knockers by default. Settings stays available to
            everyone.
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
                              ? [...current.roleNavigation[selectedRole], name]
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
    </div>
  );
}
