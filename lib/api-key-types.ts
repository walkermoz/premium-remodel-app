export const apiKeyScopes = [
  "leads.read",
  "leads.write.notes",
  "leads.write.stage",
  "leads.write.disposition",
  "leads.write.next_action",
  "leads.write.draft_reply",
  "leads.write.approval",
] as const;

export type ApiKeyScope = (typeof apiKeyScopes)[number];

export const apiKeyScopeLabels: Record<
  ApiKeyScope,
  { label: string; description: string }
> = {
  "leads.read": {
    label: "Read leads",
    description: "List leads and read their Contact details.",
  },
  "leads.write.notes": {
    label: "Edit notes",
    description: "Add or replace internal lead notes.",
  },
  "leads.write.stage": {
    label: "Change stage",
    description: "Move a lead between pipeline stages.",
  },
  "leads.write.disposition": {
    label: "Change disposition",
    description: "Mark a lead active, won, lost, or junk.",
  },
  "leads.write.next_action": {
    label: "Edit next action",
    description: "Set the next action and its due date.",
  },
  "leads.write.draft_reply": {
    label: "Edit draft reply",
    description: "Prepare a draft response without sending it.",
  },
  "leads.write.approval": {
    label: "Change approval",
    description: "Update the lead approval state.",
  },
};

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
