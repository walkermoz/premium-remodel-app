export const apiKeyScopes = [
  "leads:read",
  "leads:write:notes",
  "leads:write:status",
  "leads:write:disposition",
  "leads:write:next_action",
  "leads:write:draft_reply",
  "leads:write:approval",
] as const;

export type ApiKeyScope = (typeof apiKeyScopes)[number];

export const apiKeyScopeDetails: {
  scope: ApiKeyScope;
  label: string;
  description: string;
}[] = [
  {
    scope: "leads:read",
    label: "Read leads",
    description: "View lead and contact details.",
  },
  {
    scope: "leads:write:notes",
    label: "Edit notes",
    description: "Update lead notes.",
  },
  {
    scope: "leads:write:status",
    label: "Change stage",
    description: "Move leads through pipeline stages.",
  },
  {
    scope: "leads:write:disposition",
    label: "Change disposition",
    description: "Mark leads active, lost, or won.",
  },
  {
    scope: "leads:write:next_action",
    label: "Plan follow-up",
    description: "Set the next action and due date.",
  },
  {
    scope: "leads:write:draft_reply",
    label: "Edit draft reply",
    description: "Save a proposed response.",
  },
  {
    scope: "leads:write:approval",
    label: "Change approval",
    description: "Update the approval state.",
  },
];

export const apiKeyPatchScopes: Record<string, ApiKeyScope> = {
  notes: "leads:write:notes",
  status: "leads:write:status",
  disposition: "leads:write:disposition",
  nextAction: "leads:write:next_action",
  nextActionDue: "leads:write:next_action",
  draftReply: "leads:write:draft_reply",
  approvalState: "leads:write:approval",
};

export function missingApiKeyScopes(
  scopes: readonly string[],
  fields: readonly string[],
) {
  return [
    ...new Set(
      fields
        .map((field) => apiKeyPatchScopes[field])
        .filter((scope) => scope && !scopes.includes(scope)),
    ),
  ];
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdBy: string | null;
  scopes: ApiKeyScope[];
  expiresAt: string | null;
}
