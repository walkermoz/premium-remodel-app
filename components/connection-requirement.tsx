"use client";

import { PlugZap } from "lucide-react";
import Link from "next/link";
import type { OrganizationConnectionCapability } from "@/lib/organization-connections.types";

export default function ConnectionRequirement({
  capability,
  loading = false,
  compact = false,
}: {
  capability: OrganizationConnectionCapability | null;
  loading?: boolean;
  compact?: boolean;
}) {
  if (loading)
    return (
      <p className="connection-requirement is-checking" role="status">
        Checking connection…
      </p>
    );
  if (!capability)
    return (
      <div
        className={`connection-requirement is-degraded${compact ? " is-compact" : ""}`}
        role="status"
      >
        <PlugZap size={16} aria-hidden="true" />
        <span>Connection status could not be verified.</span>
        <Link href="/?view=Settings#connections">Review Settings</Link>
      </div>
    );
  if (capability.state === "ready") return null;
  return (
    <div
      className={`connection-requirement is-${capability.state}${compact ? " is-compact" : ""}`}
      role="status"
    >
      <PlugZap size={16} aria-hidden="true" />
      <span>{capability.detail}</span>
      <Link href={capability.setupHref}>Connect in Settings</Link>
    </div>
  );
}
