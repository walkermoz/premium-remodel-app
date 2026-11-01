import "server-only";

import { randomUUID } from "node:crypto";
import type { WorkspaceUser } from "../auth";
import { HttpError } from "../auth";
import {
  defaultWebsiteLeadAutomation,
  websiteLeadAutomationSchema,
} from "../automation-config";
import { supabaseAdmin } from "../supabase/server";
import { redactWorkflowValue } from "./redaction";
import { smsComplianceWorkflowSeed, websiteLeadWorkflowSeed } from "./seeds";
import {
  workflowDefinitionSchema,
  workflowObjectTypeSchema,
  type WorkflowDefinition,
  type WorkflowObjectType,
} from "./schema";
import {
  workflowTemplateDefinition,
  type WorkflowTemplateKey,
} from "./templates";
import { workflowCanPublish } from "./validate";

export type WorkflowSummary = {
  id: string;
  key: string;
  name: string;
  description: string;
  primaryObjectType: WorkflowObjectType;
  status: "draft" | "published" | "archived";
  systemControlled: boolean;
  revision: number;
  draftVersionId: string | null;
  publishedVersionId: string | null;
  updatedAt: string;
  tags: string[];
  folder: string;
};

export type WorkflowDetail = WorkflowSummary & {
  draft: WorkflowDefinition;
  published: WorkflowDefinition | null;
  draftVersionNumber: number;
  publishedVersionNumber: number | null;
};

const seedKeys = {
  website: "website-lead-intake",
  sms: "inbound-text-compliance",
} as const;

function definitionFromVersion(row: {
  graph: unknown;
  settings: unknown;
  layout: unknown;
}) {
  return workflowDefinitionSchema.parse({
    graph: row.graph,
    settings: row.settings,
    layout: row.layout,
  });
}

async function legacyWebsiteOptions(organizationId: string) {
  const { data, error } = await supabaseAdmin()
    .from("remodel_automations")
    .select("definition,revision")
    .eq("organization_id", organizationId)
    .eq("automation_key", "website-lead-intake")
    .maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) throw error;
  const parsed = data
    ? websiteLeadAutomationSchema.parse({
        ...data.definition,
        revision: Number(data.revision || 0),
      })
    : defaultWebsiteLeadAutomation();
  return parsed;
}

async function createSeed(input: {
  organizationId: string;
  key: string;
  name: string;
  description: string;
  definition: WorkflowDefinition;
  systemControlled: boolean;
  legacyRevision?: number;
}) {
  const admin = supabaseAdmin();
  const inserted = await admin.from("remodel_workflows").upsert(
    {
      organization_id: input.organizationId,
      workflow_key: input.key,
      name: input.name,
      description: input.description,
      primary_object_type: input.definition.graph.primaryObjectType,
      status: "published",
      system_controlled: input.systemControlled,
      draft_revision: 1,
    },
    { onConflict: "organization_id,workflow_key", ignoreDuplicates: true },
  );
  if (inserted.error) throw inserted.error;
  const workflowResult = await admin
    .from("remodel_workflows")
    .select("id,current_draft_version_id,published_version_id")
    .eq("organization_id", input.organizationId)
    .eq("workflow_key", input.key)
    .single();
  if (workflowResult.error) throw workflowResult.error;
  const workflow = workflowResult.data;
  if (workflow.published_version_id) return;

  const publishedId = randomUUID();
  const draftId = input.systemControlled ? null : randomUUID();
  const versions = [
    {
      id: publishedId,
      organization_id: input.organizationId,
      workflow_id: workflow.id,
      version_number: 1,
      state: "published",
      graph: input.definition.graph,
      settings: input.definition.settings,
      layout: input.definition.layout,
      metadata: {
        seeded: true,
        ...(input.legacyRevision !== undefined
          ? { legacyRevision: input.legacyRevision }
          : {}),
      },
      change_note: "Migrated current production behavior",
      published_at: new Date().toISOString(),
    },
    ...(draftId
      ? [
          {
            id: draftId,
            organization_id: input.organizationId,
            workflow_id: workflow.id,
            version_number: 2,
            state: "draft",
            graph: input.definition.graph,
            settings: input.definition.settings,
            layout: input.definition.layout,
            metadata: { seeded: true },
            change_note: "Draft from migrated production workflow",
            published_at: null,
          },
        ]
      : []),
  ];
  const versionsResult = await admin
    .from("remodel_workflow_versions")
    .upsert(versions, {
      onConflict: "workflow_id,version_number",
      ignoreDuplicates: true,
    });
  if (versionsResult.error) throw versionsResult.error;

  const savedVersions = await admin
    .from("remodel_workflow_versions")
    .select("id,version_number,state")
    .eq("workflow_id", workflow.id)
    .order("version_number");
  if (savedVersions.error) throw savedVersions.error;
  const published = savedVersions.data.find(
    (version) => version.state === "published",
  );
  const draft = savedVersions.data.find((version) => version.state === "draft");
  if (!published)
    throw new Error("Seeded workflow did not create a published version.");
  const update = await admin
    .from("remodel_workflows")
    .update({
      published_version_id: published.id,
      current_draft_version_id: draft?.id || null,
      draft_revision: draft ? 1 : 0,
      status: "published",
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId)
    .eq("id", workflow.id)
    .is("published_version_id", null);
  if (update.error) throw update.error;

  const triggerNodes = input.definition.graph.nodes.filter(
    (node) =>
      node.kind === "trigger" && typeof node.config.eventType === "string",
  );
  if (triggerNodes.length) {
    const subscriptions = await admin
      .from("remodel_workflow_trigger_subscriptions")
      .upsert(
        triggerNodes.map((node) => ({
          organization_id: input.organizationId,
          workflow_id: workflow.id,
          version_id: published.id,
          node_id: node.id,
          event_type: node.config.eventType,
          filter_definition: node.config.filters || null,
          schedule_definition: node.config.schedule || null,
          next_run_at:
            node.config.eventType === "schedule.reached" &&
            node.config.schedule &&
            typeof node.config.schedule === "object"
              ? String(
                  (node.config.schedule as Record<string, unknown>).at ||
                    (node.config.schedule as Record<string, unknown>).startAt ||
                    new Date().toISOString(),
                )
              : null,
        })),
        { onConflict: "version_id,node_id", ignoreDuplicates: true },
      );
    if (subscriptions.error) throw subscriptions.error;
  }
}

export async function ensureSeededWorkflows(organizationId: string) {
  const legacy = await legacyWebsiteOptions(organizationId);
  await createSeed({
    organizationId,
    key: seedKeys.website,
    name: legacy.name,
    description:
      "Capture website inquiries as Contacts and Leads, then follow up with the Contact and team.",
    definition: websiteLeadWorkflowSeed(legacy),
    systemControlled: false,
    legacyRevision: legacy.revision,
  });
  await createSeed({
    organizationId,
    key: seedKeys.sms,
    name: "Inbound text compliance",
    description:
      "Record HELP, STOP, and START while enforcing non-bypassable SMS policy.",
    definition: smsComplianceWorkflowSeed(),
    systemControlled: true,
  });
}

async function versionsById(ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!wanted.length) return new Map<string, never>();
  const result = await supabaseAdmin()
    .from("remodel_workflow_versions")
    .select("id,version_number,graph,settings,layout")
    .in("id", wanted);
  if (result.error) throw result.error;
  return new Map(result.data.map((version) => [version.id, version]));
}

export async function listWorkflows(
  organizationId: string,
): Promise<WorkflowSummary[]> {
  await ensureSeededWorkflows(organizationId);
  const result = await supabaseAdmin()
    .from("remodel_workflows")
    .select(
      "id,workflow_key,name,description,primary_object_type,status,system_controlled,draft_revision,current_draft_version_id,published_version_id,updated_at",
    )
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  if (result.error) throw result.error;
  const versions = await versionsById(
    result.data.flatMap((workflow) => [
      workflow.current_draft_version_id,
      workflow.published_version_id,
    ]),
  );
  return result.data.map((workflow) => {
    const version = versions.get(
      workflow.current_draft_version_id || workflow.published_version_id || "",
    );
    const settings = version?.settings as
      { tags?: unknown; folder?: unknown } | undefined;
    return {
      id: workflow.id,
      key: workflow.workflow_key,
      name: workflow.name,
      description: workflow.description,
      primaryObjectType: workflowObjectTypeSchema.parse(
        workflow.primary_object_type,
      ),
      status: workflow.status,
      systemControlled: workflow.system_controlled,
      revision: Number(workflow.draft_revision),
      draftVersionId: workflow.current_draft_version_id,
      publishedVersionId: workflow.published_version_id,
      updatedAt: workflow.updated_at,
      tags: Array.isArray(settings?.tags)
        ? settings.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      folder: typeof settings?.folder === "string" ? settings.folder : "",
    };
  });
}

export async function getWorkflow(
  organizationId: string,
  workflowId: string,
): Promise<WorkflowDetail> {
  await ensureSeededWorkflows(organizationId);
  const result = await supabaseAdmin()
    .from("remodel_workflows")
    .select(
      "id,workflow_key,name,description,primary_object_type,status,system_controlled,draft_revision,current_draft_version_id,published_version_id,updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("id", workflowId)
    .single();
  if (result.error) {
    if (result.error.code === "PGRST116")
      throw new HttpError(404, "Workflow not found.");
    throw result.error;
  }
  const workflow = result.data;
  const versions = await versionsById([
    workflow.current_draft_version_id,
    workflow.published_version_id,
  ]);
  const draftRow = versions.get(
    workflow.current_draft_version_id || workflow.published_version_id || "",
  );
  if (!draftRow) throw new Error("Workflow definition is missing.");
  const publishedRow = workflow.published_version_id
    ? versions.get(workflow.published_version_id)
    : undefined;
  const draft = definitionFromVersion(draftRow);
  return {
    id: workflow.id,
    key: workflow.workflow_key,
    name: workflow.name,
    description: workflow.description,
    primaryObjectType: workflowObjectTypeSchema.parse(
      workflow.primary_object_type,
    ),
    status: workflow.status,
    systemControlled: workflow.system_controlled,
    revision: Number(workflow.draft_revision),
    draftVersionId: workflow.current_draft_version_id,
    publishedVersionId: workflow.published_version_id,
    updatedAt: workflow.updated_at,
    tags: draft.settings.tags,
    folder: draft.settings.folder,
    draft,
    published: publishedRow ? definitionFromVersion(publishedRow) : null,
    draftVersionNumber: Number(draftRow.version_number),
    publishedVersionNumber: publishedRow
      ? Number(publishedRow.version_number)
      : null,
  };
}

function slug(value: string) {
  const base = value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${base || "workflow"}-${randomUUID().slice(0, 8)}`;
}

export async function createWorkflow(
  user: WorkspaceUser,
  input: {
    name: string;
    description?: string;
    primaryObjectType: WorkflowObjectType;
    template?: WorkflowTemplateKey;
  },
) {
  const definition = workflowTemplateDefinition(
    input.template || "blank",
    input.primaryObjectType,
  );
  const result = await supabaseAdmin().rpc("remodel_create_workflow", {
    p_organization_id: user.organizationId,
    p_actor_id: user.id,
    p_workflow_key: slug(input.name),
    p_name: input.name.trim(),
    p_description: input.description?.trim() || "",
    p_primary_object_type: definition.graph.primaryObjectType,
    p_graph: definition.graph,
    p_settings: definition.settings,
    p_layout: definition.layout,
  });
  if (result.error) throw result.error;
  return getWorkflow(user.organizationId, result.data.workflowId);
}

export async function saveWorkflowDraft(
  user: WorkspaceUser,
  workflowId: string,
  input: {
    revision: number;
    definition: WorkflowDefinition;
    name?: string;
    description?: string;
    changeNote?: string;
  },
) {
  const definition = workflowDefinitionSchema.parse(input.definition);
  const result = await supabaseAdmin().rpc("remodel_save_workflow_draft", {
    p_organization_id: user.organizationId,
    p_actor_id: user.id,
    p_workflow_id: workflowId,
    p_expected_revision: input.revision,
    p_graph: definition.graph,
    p_settings: definition.settings,
    p_layout: definition.layout,
    p_name: input.name || null,
    p_description: input.description ?? null,
    p_change_note: input.changeNote || "",
  });
  if (result.error) throw result.error;
  if (result.data.result === "conflict")
    throw new HttpError(
      409,
      "This workflow changed in another session. Refresh before saving.",
    );
  return getWorkflow(user.organizationId, workflowId);
}

export async function publishWorkflow(
  user: WorkspaceUser,
  workflowId: string,
  input: { revision: number; changeNote?: string },
) {
  const current = await getWorkflow(user.organizationId, workflowId);
  const validation = workflowCanPublish(current.draft);
  if (!validation.valid)
    throw new HttpError(
      400,
      validation.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message)
        .join(" ") || "Workflow validation failed.",
    );
  const result = await supabaseAdmin().rpc("remodel_publish_workflow", {
    p_organization_id: user.organizationId,
    p_actor_id: user.id,
    p_workflow_id: workflowId,
    p_expected_revision: input.revision,
    p_change_note: input.changeNote || "",
  });
  if (result.error) throw result.error;
  if (result.data.result === "conflict")
    throw new HttpError(
      409,
      "This workflow changed in another session. Refresh before publishing.",
    );
  return getWorkflow(user.organizationId, workflowId);
}

export async function restoreWorkflowVersion(
  user: WorkspaceUser,
  workflowId: string,
  input: { versionId: string; revision: number },
) {
  const version = await supabaseAdmin()
    .from("remodel_workflow_versions")
    .select("id,graph,settings,layout,version_number")
    .eq("organization_id", user.organizationId)
    .eq("workflow_id", workflowId)
    .eq("id", input.versionId)
    .single();
  if (version.error) {
    if (version.error.code === "PGRST116")
      throw new HttpError(404, "Workflow version not found.");
    throw version.error;
  }
  return saveWorkflowDraft(user, workflowId, {
    revision: input.revision,
    definition: definitionFromVersion(version.data),
    changeNote: `Restored version ${version.data.version_number} as a new draft`,
  });
}

export async function duplicateWorkflow(
  user: WorkspaceUser,
  workflowId: string,
) {
  const source = await getWorkflow(user.organizationId, workflowId);
  const created = await createWorkflow(user, {
    name: `${source.name} copy`,
    description: source.description,
    primaryObjectType: source.primaryObjectType,
  });
  return saveWorkflowDraft(user, created.id, {
    revision: created.revision,
    definition: source.draft,
    changeNote: `Duplicated from ${source.name}`,
  });
}

export async function archiveWorkflow(user: WorkspaceUser, workflowId: string) {
  const current = await getWorkflow(user.organizationId, workflowId);
  if (current.systemControlled)
    throw new HttpError(400, "System workflows cannot be archived.");
  const admin = supabaseAdmin();
  const subscriptions = await admin
    .from("remodel_workflow_trigger_subscriptions")
    .delete()
    .eq("organization_id", user.organizationId)
    .eq("workflow_id", workflowId);
  if (subscriptions.error) throw subscriptions.error;
  const result = await admin
    .from("remodel_workflows")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("organization_id", user.organizationId)
    .eq("id", workflowId)
    .select("id")
    .single();
  if (result.error) throw result.error;
  return { archived: true, id: result.data.id };
}

export async function listWorkflowVersions(
  organizationId: string,
  workflowId: string,
) {
  const admin = supabaseAdmin();
  const workflowResult = await admin
    .from("remodel_workflows")
    .select("workflow_key")
    .eq("organization_id", organizationId)
    .eq("id", workflowId)
    .single();
  if (workflowResult.error) throw workflowResult.error;
  const result = await admin
    .from("remodel_workflow_versions")
    .select(
      "id,version_number,state,graph,settings,layout,metadata,change_note,created_at,published_at,created_by",
    )
    .eq("organization_id", organizationId)
    .eq("workflow_id", workflowId)
    .order("version_number", { ascending: false })
    .limit(50);
  if (result.error) throw result.error;
  const creatorIds = [
    ...new Set(
      result.data
        .map((version) => version.created_by)
        .filter((id): id is string => typeof id === "string" && Boolean(id)),
    ),
  ];
  const creatorResult = creatorIds.length
    ? await admin.from("profiles").select("id,full_name").in("id", creatorIds)
    : { data: [], error: null };
  if (creatorResult.error) throw creatorResult.error;
  const creatorNames = new Map(
    (creatorResult.data || []).map((profile) => [
      profile.id,
      profile.full_name,
    ]),
  );
  const versions = result.data.map((version) => ({
    id: version.id,
    number: Number(version.version_number),
    state: version.state,
    changeNote: version.change_note,
    createdAt: version.created_at,
    publishedAt: version.published_at,
    createdBy: version.created_by,
    createdByName: version.created_by
      ? creatorNames.get(version.created_by) || "Former workspace member"
      : "System",
    metadata: version.metadata,
    definition: definitionFromVersion(version),
  }));
  if (workflowResult.data.workflow_key === seedKeys.website) {
    const legacy = await admin
      .from("remodel_automation_revisions")
      .select("revision,definition,actor_name,changed_at")
      .eq("organization_id", organizationId)
      .eq("automation_key", "website-lead-intake")
      .order("revision", { ascending: false })
      .limit(25);
    if (legacy.error && !["42P01", "PGRST205"].includes(legacy.error.code))
      throw legacy.error;
    for (const item of legacy.data || []) {
      const legacyDefinition = websiteLeadAutomationSchema.parse({
        ...item.definition,
        revision: Number(item.revision),
      });
      versions.push({
        id: `legacy-${item.revision}`,
        number: Number(item.revision),
        state: "legacy",
        changeNote: `Legacy workflow version by ${item.actor_name}`,
        createdAt: item.changed_at,
        publishedAt: item.changed_at,
        createdBy: null,
        createdByName: item.actor_name || "Legacy editor",
        metadata: { legacy: true, actorName: item.actor_name },
        definition: websiteLeadWorkflowSeed(legacyDefinition),
      });
    }
  }
  return versions;
}

export async function listWorkflowRuns(
  organizationId: string,
  workflowId: string,
  offset = 0,
) {
  const admin = supabaseAdmin();
  const workflowResult = await admin
    .from("remodel_workflows")
    .select("workflow_key")
    .eq("organization_id", organizationId)
    .eq("id", workflowId)
    .single();
  if (workflowResult.error) throw workflowResult.error;
  const runResult = await admin
    .from("remodel_workflow_runs")
    .select(
      "id,version_id,event_id,object_type,object_id,contact_id,status,current_node_id,summary,started_at,last_activity_at,completed_at",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .eq("workflow_id", workflowId)
    .order("started_at", { ascending: false })
    .range(offset, offset + 24);
  if (runResult.error) throw runResult.error;
  const eventIds = runResult.data
    .map((run) => run.event_id)
    .filter((id): id is string => typeof id === "string" && Boolean(id));
  const eventResult = eventIds.length
    ? await admin
        .from("remodel_workflow_events")
        .select("id,event_type,actor,occurred_at,payload")
        .eq("organization_id", organizationId)
        .in("id", eventIds)
    : { data: [], error: null };
  if (eventResult.error) throw eventResult.error;
  const events = new Map(
    (eventResult.data || []).map((event) => [
      event.id,
      {
        type: event.event_type,
        actor: redactWorkflowValue(event.actor),
        occurredAt: event.occurred_at,
        payload: redactWorkflowValue(event.payload),
      },
    ]),
  );
  const ids = runResult.data.map((run) => run.id);
  const stepResult = ids.length
    ? await admin
        .from("remodel_workflow_step_runs")
        .select(
          "id,run_id,node_id,node_type,attempt,status,input_snapshot,output_snapshot,error_code,error_detail,started_at,completed_at,next_attempt_at",
        )
        .eq("organization_id", organizationId)
        .in("run_id", ids)
        .order("started_at")
    : { data: [], error: null };
  if (stepResult.error) throw stepResult.error;
  const waitResult = ids.length
    ? await admin
        .from("remodel_workflow_waits")
        .select(
          "id,run_id,node_id,mode,wake_at,awaited_event_type,timeout_at,status,created_at,resumed_at",
        )
        .eq("organization_id", organizationId)
        .in("run_id", ids)
        .order("created_at")
    : { data: [], error: null };
  if (waitResult.error) throw waitResult.error;
  const steps = new Map<string, typeof stepResult.data>();
  for (const step of stepResult.data || [])
    steps.set(step.run_id, [...(steps.get(step.run_id) || []), step]);
  const waits = new Map<string, typeof waitResult.data>();
  for (const wait of waitResult.data || [])
    waits.set(wait.run_id, [...(waits.get(wait.run_id) || []), wait]);
  const runs = runResult.data.map((run) => ({
    id: run.id,
    versionId: run.version_id,
    eventId: run.event_id,
    triggerEvent: run.event_id ? events.get(run.event_id) || null : null,
    objectType: run.object_type,
    objectId: run.object_id,
    contactId: run.contact_id,
    status: run.status,
    currentNodeId: run.current_node_id,
    summary: run.summary,
    startedAt: run.started_at,
    lastActivityAt: run.last_activity_at,
    completedAt: run.completed_at,
    steps: steps.get(run.id) || [],
    waits: waits.get(run.id) || [],
    legacy: false,
  }));
  if (workflowResult.data.workflow_key === seedKeys.website) {
    const legacy = await admin
      .from("remodel_automation_runs")
      .select("id,lead_id,subject,project,status,steps,started_at,completed_at")
      .eq("organization_id", organizationId)
      .eq("automation_key", "website-lead-intake")
      .order("started_at", { ascending: false })
      .limit(25);
    if (legacy.error && !["42P01", "PGRST205"].includes(legacy.error.code))
      throw legacy.error;
    for (const run of legacy.data || [])
      if (!runs.some((item) => item.id === run.id))
        runs.push({
          id: run.id,
          versionId: null,
          eventId: null,
          triggerEvent: null,
          objectType: "lead",
          objectId: run.lead_id || run.id,
          contactId: null,
          status: run.status,
          currentNodeId: null,
          summary: { subject: run.subject, project: run.project },
          startedAt: run.started_at,
          lastActivityAt: run.completed_at || run.started_at,
          completedAt: run.completed_at,
          steps: run.steps,
          waits: [],
          legacy: true,
        });
  }
  runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return {
    runs: runs.slice(0, 25),
    total: (runResult.count || 0) + runs.filter((run) => run.legacy).length,
  };
}

export async function listObjectWorkflowRuns(
  organizationId: string,
  objectType: WorkflowObjectType,
  objectId: string,
) {
  const admin = supabaseAdmin();
  const runResult = await admin
    .from("remodel_workflow_runs")
    .select(
      "id,workflow_id,version_id,event_id,object_type,object_id,contact_id,status,current_node_id,summary,started_at,last_activity_at,completed_at",
    )
    .eq("organization_id", organizationId)
    .eq("object_type", objectType)
    .eq("object_id", objectId)
    .order("started_at", { ascending: false })
    .limit(50);
  if (runResult.error) throw runResult.error;
  const eventIds = runResult.data
    .map((run) => run.event_id)
    .filter((id): id is string => typeof id === "string" && Boolean(id));
  const eventResult = eventIds.length
    ? await admin
        .from("remodel_workflow_events")
        .select("id,event_type,actor,occurred_at,payload")
        .eq("organization_id", organizationId)
        .in("id", eventIds)
    : { data: [], error: null };
  if (eventResult.error) throw eventResult.error;
  const events = new Map(
    (eventResult.data || []).map((event) => [
      event.id,
      {
        type: event.event_type,
        actor: redactWorkflowValue(event.actor),
        occurredAt: event.occurred_at,
        payload: redactWorkflowValue(event.payload),
      },
    ]),
  );
  const workflowIds = [
    ...new Set(runResult.data.map((run) => run.workflow_id)),
  ];
  const workflowResult = workflowIds.length
    ? await admin
        .from("remodel_workflows")
        .select("id,name")
        .eq("organization_id", organizationId)
        .in("id", workflowIds)
    : { data: [], error: null };
  if (workflowResult.error) throw workflowResult.error;
  const names = new Map(
    (workflowResult.data || []).map((workflow) => [workflow.id, workflow.name]),
  );
  const runIds = runResult.data.map((run) => run.id);
  const stepResult = runIds.length
    ? await admin
        .from("remodel_workflow_step_runs")
        .select(
          "id,run_id,node_id,node_type,attempt,status,input_snapshot,output_snapshot,error_code,error_detail,started_at,completed_at,next_attempt_at",
        )
        .eq("organization_id", organizationId)
        .in("run_id", runIds)
        .order("started_at")
    : { data: [], error: null };
  if (stepResult.error) throw stepResult.error;
  const waitResult = runIds.length
    ? await admin
        .from("remodel_workflow_waits")
        .select(
          "id,run_id,node_id,mode,wake_at,awaited_event_type,timeout_at,status,created_at,resumed_at",
        )
        .eq("organization_id", organizationId)
        .in("run_id", runIds)
        .order("created_at")
    : { data: [], error: null };
  if (waitResult.error) throw waitResult.error;
  const steps = new Map<string, typeof stepResult.data>();
  for (const step of stepResult.data || [])
    steps.set(step.run_id, [...(steps.get(step.run_id) || []), step]);
  const waits = new Map<string, typeof waitResult.data>();
  for (const wait of waitResult.data || [])
    waits.set(wait.run_id, [...(waits.get(wait.run_id) || []), wait]);
  return runResult.data.map((run) => ({
    id: run.id,
    workflowId: run.workflow_id,
    workflowName: names.get(run.workflow_id) || "Workflow",
    versionId: run.version_id,
    eventId: run.event_id,
    triggerEvent: run.event_id ? events.get(run.event_id) || null : null,
    objectType: run.object_type,
    objectId: run.object_id,
    contactId: run.contact_id,
    status: run.status,
    currentNodeId: run.current_node_id,
    summary: run.summary,
    startedAt: run.started_at,
    lastActivityAt: run.last_activity_at,
    completedAt: run.completed_at,
    steps: steps.get(run.id) || [],
    waits: waits.get(run.id) || [],
  }));
}
