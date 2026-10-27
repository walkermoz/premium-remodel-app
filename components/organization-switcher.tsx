"use client";

import { useEffect, useState } from "react";

type Organization = { id: string; name: string; role: string };

export default function OrganizationSwitcher({
  currentName,
  demo,
}: {
  currentName: string;
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

  const selected = organizations.find((item) => item.id === activeId);
  if (demo) return <strong>{currentName}</strong>;
  return (
    <div className="organization-switcher">
      <label htmlFor="active-organization" className="sr-only">
        Active organization
      </label>
      <select
        id="active-organization"
        aria-label="Active organization"
        value={activeId}
        disabled={busy || organizations.length < 2}
        title={error || "Switch organization"}
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
      {error && (
        <span role="alert" className="organization-switcher-error">
          {error}
        </span>
      )}
      {selected && (
        <span>
          {selected.role === "owner" || selected.role === "admin"
            ? "Administrator"
            : "Team member"}
        </span>
      )}
    </div>
  );
}
