"use client";

import { useEffect, useState } from "react";

type Organization = { id: string; name: string; role: string };

export default function OrganizationSwitcher({
  currentName,
  logoMarkUrl,
  demo,
}: {
  currentName: string;
  logoMarkUrl?: string;
  demo: boolean;
}) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeId, setActiveId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (demo) return;
    fetch("/api/organizations", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load organizations.");
        setOrganizations(data.organizations);
        setActiveId(data.activeId || "");
      })
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load organizations.",
        ),
      );
  }, [demo]);

  if (demo || organizations.length < 2) return null;
  return (
    <div className="workspace-switch">
      <span
        className={`workspace-monogram${logoMarkUrl ? " has-logo" : ""}`}
        aria-hidden="true"
      >
        {logoMarkUrl ? <img src={logoMarkUrl} alt="" /> : currentName.charAt(0)}
      </span>
      <div className="organization-switcher">
        <label htmlFor="active-organization" className="sr-only">
          Active organization
        </label>
        <select
          id="active-organization"
          aria-label="Switch business"
          value={activeId}
          disabled={busy}
          title={error || "Switch business"}
          onChange={async (event) => {
            const nextId = event.target.value;
            setBusy(true);
            setError("");
            try {
              const response = await fetch("/api/organizations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ organizationId: nextId }),
              });
              const data = await response.json();
              if (!response.ok)
                throw new Error(data.error || "Could not switch organization.");
              window.location.assign("/");
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not switch organization.",
              );
              setBusy(false);
            }
          }}
        >
          {!activeId && <option value="">{currentName}</option>}
          {organizations.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <span className="organization-switcher-hint">Switch business</span>
        {error && (
          <span role="alert" className="organization-switcher-error">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
