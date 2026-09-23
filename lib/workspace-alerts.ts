import type {
  AlertAudience,
  User,
  WorkspaceAlert,
  WorkspaceGroup,
} from "./types";

export const alertAudienceOptions: {
  value: AlertAudience;
  label: string;
  detail: string;
}[] = [
  {
    value: "administrators",
    label: "Administrators",
    detail: "Owners and administrators",
  },
  { value: "office", label: "Office", detail: "Office team members" },
  { value: "crew", label: "Crew", detail: "Crew team members" },
  { value: "field", label: "Field", detail: "Field team members" },
  {
    value: "doorknocker",
    label: "Doorknockers",
    detail: "Door-knocking team members",
  },
];

export function audienceForGroup(group: WorkspaceGroup): AlertAudience {
  return group === "owner" || group === "admin" ? "administrators" : group;
}

export function visibleWorkspaceAlerts(
  alerts: WorkspaceAlert[],
  user: User,
  now = Date.now(),
) {
  const audience = audienceForGroup(user.group);
  return alerts
    .filter(
      (alert) =>
        Date.parse(alert.expiresAt) > now && alert.audiences.includes(audience),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function audienceLabels(audiences: AlertAudience[]) {
  return alertAudienceOptions
    .filter((option) => audiences.includes(option.value))
    .map((option) => option.label)
    .join(", ");
}
