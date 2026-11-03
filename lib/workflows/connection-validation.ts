import type {
  OrganizationConnectionCapability,
  OrganizationConnectionId,
  OrganizationConnectionRegistry,
} from "../organization-connections.types";
import type { WorkflowDefinition, WorkflowNode } from "./schema";
import type { WorkflowValidationIssue } from "./validate";

export type WorkflowConnectionRequirement = {
  capabilityId: OrganizationConnectionId;
  label: string;
};

export function workflowNodeConnectionRequirement(
  node: WorkflowNode,
): WorkflowConnectionRequirement | null {
  if (node.config.enabled === false) return null;
  if (node.type === "action.sendEmail")
    return { capabilityId: "google_mail", label: "company email" };
  if (node.type === "action.sendSms")
    return { capabilityId: "twilio_sms", label: "company texting" };
  if (node.type === "action.internalNotification")
    return {
      capabilityId: "team_notifications",
      label: "team notifications",
    };
  if (
    node.type === "action.webhook" &&
    node.config.destination === "discord_lead_webhook"
  )
    return {
      capabilityId: "team_notifications",
      label: "team notifications",
    };
  if (
    node.type === "action.webhook" &&
    (node.config.urlSecretId ||
      Object.values(
        (node.config.secretHeaders || {}) as Record<string, string>,
      ).some(Boolean))
  )
    return { capabilityId: "workflow_secrets", label: "workflow secrets" };
  return null;
}

function missingSecret(
  node: WorkflowNode,
  availableSecretIds: ReadonlySet<string>,
) {
  if (node.type !== "action.webhook") return false;
  const ids = [
    typeof node.config.urlSecretId === "string" ? node.config.urlSecretId : "",
    ...Object.values(
      (node.config.secretHeaders || {}) as Record<string, string>,
    ),
  ].filter(Boolean);
  return ids.some((id) => !availableSecretIds.has(id));
}

export function workflowConnectionCapability(
  node: WorkflowNode,
  registry: OrganizationConnectionRegistry | null | undefined,
) {
  const requirement = workflowNodeConnectionRequirement(node);
  return requirement
    ? registry?.capabilities[requirement.capabilityId] || null
    : null;
}

export function workflowConnectionIssues(
  definition: WorkflowDefinition,
  registry: OrganizationConnectionRegistry | null | undefined,
  availableSecretIds: ReadonlySet<string> = new Set(),
): WorkflowValidationIssue[] {
  if (!registry) return [];
  const issues: WorkflowValidationIssue[] = [];
  for (const node of definition.graph.nodes) {
    const requirement = workflowNodeConnectionRequirement(node);
    if (!requirement) continue;
    const capability: OrganizationConnectionCapability =
      registry.capabilities[requirement.capabilityId];
    const unavailable = capability.state !== "ready";
    const referencesMissingSecret = missingSecret(node, availableSecretIds);
    if (!unavailable && !referencesMissingSecret) continue;
    const optional = node.config.connectionFailureBehavior === "skip";
    const detail = referencesMissingSecret
      ? "One or more selected organization secrets no longer exist."
      : capability.detail;
    issues.push({
      severity: optional ? "warning" : "error",
      code: optional
        ? "optional_connection_unavailable"
        : "connection_unavailable",
      message: optional
        ? `${node.name} will be skipped until ${requirement.label} is available. ${detail}`
        : `${node.name} cannot be published until ${requirement.label} is available. ${detail}`,
      nodeId: node.id,
    });
  }
  return issues;
}
