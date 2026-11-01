"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CircleStop,
  Clock3,
  Copy,
  FlaskConical,
  GitBranch,
  GripVertical,
  History,
  LoaderCircle,
  MessageSquareText,
  Maximize2,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Route,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Archive,
  Workflow,
  Webhook,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  smsComplianceWorkflowSeed,
  websiteLeadWorkflowSeed,
} from "@/lib/workflows/seeds";
import {
  simulateWorkflow,
  type WorkflowSimulation,
} from "@/lib/workflows/simulator";
import {
  workflowNodeDefinitions,
  workflowNodeDefinition,
  type WorkflowNodeDefinition,
} from "@/lib/workflows/registry";
import type {
  WorkflowCondition,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowEvent,
  WorkflowNode,
  WorkflowObjectType,
  WorkflowOperand,
} from "@/lib/workflows/schema";
import {
  workflowEventTypes,
  workflowObjectTypes,
} from "@/lib/workflows/schema";
import type { WorkflowDetail, WorkflowSummary } from "@/lib/workflows/store";
import { validateWorkflowDefinition } from "@/lib/workflows/validate";
import type { Lead, User } from "@/lib/types";

type StudioMode = "build" | "test" | "versions" | "runs";
type InsertionPoint = { sourceId: string; edgeId: string };
type TestFixtureSource = "manual" | "recent" | "object";

const MIN_TREE_ZOOM = 0.3;
const MAX_TREE_ZOOM = 1.5;
const TREE_ZOOM_STEP = 0.1;

type SenderOption = { id: string; label: string };

type TestEventOption = {
  id: string;
  type: string;
  objectType: string;
  objectId: string;
  occurredAt: string;
  label: string;
};

type TestObjectOption = { id: string; label: string; updatedAt: string };

type VersionItem = {
  id: string;
  number: number;
  state: string;
  changeNote: string;
  createdAt: string;
  createdBy?: string | null;
  createdByName?: string;
  publishedAt: string | null;
  metadata: Record<string, unknown>;
};

type RunItem = {
  id: string;
  workflowName?: string;
  versionId: string | null;
  eventId: string | null;
  triggerEvent?: {
    type: string;
    actor: unknown;
    occurredAt: string;
    payload: unknown;
  } | null;
  status: string;
  objectType: string;
  objectId: string;
  contactId: string | null;
  summary: Record<string, unknown>;
  startedAt: string;
  lastActivityAt: string;
  completedAt: string | null;
  legacy: boolean;
  steps: Array<Record<string, unknown>>;
  waits: Array<Record<string, unknown>>;
};

const demoIds = {
  website: "00000000-0000-4000-8000-000000000001",
  sms: "00000000-0000-4000-8000-000000000002",
};

const triggerEventByType: Record<string, WorkflowEvent["type"]> = {
  "trigger.websiteFormSubmitted": "website.form.submitted",
  "trigger.contactCreated": "contact.created",
  "trigger.contactUpdated": "contact.updated",
  "trigger.leadCreated": "lead.created",
  "trigger.leadStageChanged": "lead.stage.changed",
  "trigger.leadDispositionChanged": "lead.disposition.changed",
  "trigger.quoteCreated": "quote.created",
  "trigger.quoteSent": "quote.sent",
  "trigger.quoteAccepted": "quote.accepted",
  "trigger.quoteDeclined": "quote.declined",
  "trigger.quoteSigned": "quote.signed",
  "trigger.depositReceived": "payment.deposit.received",
  "trigger.projectCreated": "project.created",
  "trigger.projectStatusChanged": "project.status.changed",
  "trigger.itemCreated": "item.created",
  "trigger.itemAssigned": "item.assigned",
  "trigger.itemCompleted": "item.completed",
  "trigger.inboundSms": "sms.inbound.received",
  "trigger.schedule": "schedule.reached",
  "trigger.manual": "workflow.manual",
  "trigger.inboundWebhook": "webhook.inbound.received",
};

const workflowOperators: Array<
  Extract<WorkflowCondition, { kind: "comparison" }>["operator"]
> = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "isEmpty",
  "isNotEmpty",
  "greaterThan",
  "lessThan",
  "before",
  "after",
  "isOneOf",
  "isNotOneOf",
  "changedFrom",
  "changedTo",
  "matchesRegex",
];

function conditionLabel(operator: string) {
  return operator.replace(/([A-Z])/g, " $1").toLocaleLowerCase();
}

function literalFromInput(value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  const number = Number(value);
  return value.trim() && Number.isFinite(number) ? number : value;
}

function toDateTimeLocal(value: unknown) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function nextWorkflowHourIso() {
  return new Date(Date.now() + 60 * 60 * 1_000).toISOString();
}

function SimpleConditionEditor({
  id,
  condition,
  variables,
  disabled,
  onChange,
}: {
  id: string;
  condition?: WorkflowCondition;
  variables: string[];
  disabled: boolean;
  onChange: (condition: WorkflowCondition) => void;
}) {
  if (condition?.kind === "group") {
    const replaceChild = (index: number, next: WorkflowCondition) =>
      onChange({
        ...condition,
        conditions: condition.conditions.map((item, itemIndex) =>
          itemIndex === index ? next : item,
        ),
      });
    const newRule = (): WorkflowCondition => ({
      kind: "comparison",
      left: { kind: "reference", path: variables[0] || "event.payload.value" },
      operator: "isNotEmpty",
    });
    return (
      <div className="workflow-condition-group">
        <div className="workflow-condition-group-bar">
          <label>
            <span>Match</span>
            <select
              aria-label="Condition group behavior"
              value={condition.combinator}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...condition,
                  combinator: event.target.value as "and" | "or",
                })
              }
            >
              <option value="and">All rules (AND)</option>
              <option value="or">Any rule (OR)</option>
            </select>
          </label>
          <div>
            <button
              type="button"
              disabled={disabled || condition.conditions.length >= 50}
              onClick={() =>
                onChange({
                  ...condition,
                  conditions: [...condition.conditions, newRule()],
                })
              }
            >
              <Plus size={12} /> Rule
            </button>
            <button
              type="button"
              disabled={disabled || condition.conditions.length >= 50}
              onClick={() =>
                onChange({
                  ...condition,
                  conditions: [
                    ...condition.conditions,
                    {
                      kind: "group",
                      combinator: "and",
                      conditions: [newRule()],
                    },
                  ],
                })
              }
            >
              <Plus size={12} /> Group
            </button>
          </div>
        </div>
        <div className="workflow-condition-group-rules">
          {condition.conditions.map((child, index) => (
            <div
              className="workflow-condition-group-rule"
              key={`${id}-${index}`}
            >
              <SimpleConditionEditor
                id={`${id}-${index}`}
                condition={child}
                variables={variables}
                disabled={disabled}
                onChange={(next) => replaceChild(index, next)}
              />
              <button
                type="button"
                aria-label="Remove condition"
                disabled={disabled || condition.conditions.length === 1}
                onClick={() =>
                  onChange({
                    ...condition,
                    conditions: condition.conditions.filter(
                      (_item, itemIndex) => itemIndex !== index,
                    ),
                  })
                }
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const current: Extract<WorkflowCondition, { kind: "comparison" }> =
    condition?.kind === "comparison"
      ? condition
      : {
          kind: "comparison",
          left: {
            kind: "reference",
            path: variables[0] || "event.payload.value",
          },
          operator: "isNotEmpty",
        };
  const needsRight = !["isEmpty", "isNotEmpty"].includes(current.operator);
  const right = current.right || { kind: "literal" as const, value: "" };
  const replace = (
    patch: Partial<Extract<WorkflowCondition, { kind: "comparison" }>>,
  ) => onChange({ ...current, ...patch });
  return (
    <div className="workflow-condition-editor">
      <input
        aria-label="Condition value"
        list={`${id}-variables`}
        value={current.left.path}
        disabled={disabled}
        onChange={(event) =>
          replace({ left: { kind: "reference", path: event.target.value } })
        }
      />
      <datalist id={`${id}-variables`}>
        {variables.map((variable) => (
          <option key={variable} value={variable} />
        ))}
      </datalist>
      <select
        aria-label="Condition operator"
        value={current.operator}
        disabled={disabled}
        onChange={(event) => {
          const operator = event.target.value as typeof current.operator;
          replace({
            operator,
            ...(["isEmpty", "isNotEmpty"].includes(operator)
              ? { right: undefined }
              : { right }),
          });
        }}
      >
        {workflowOperators.map((operator) => (
          <option value={operator} key={operator}>
            {conditionLabel(operator)}
          </option>
        ))}
      </select>
      {needsRight && (
        <>
          <select
            aria-label="Comparison source"
            value={right.kind}
            disabled={disabled}
            onChange={(event) =>
              replace({
                right:
                  event.target.value === "reference"
                    ? {
                        kind: "reference",
                        path: variables[0] || "event.payload.value",
                      }
                    : { kind: "literal", value: "" },
              })
            }
          >
            <option value="literal">Value</option>
            <option value="reference">Another field</option>
          </select>
          <input
            aria-label={
              right.kind === "reference"
                ? "Comparison field"
                : "Comparison value"
            }
            list={right.kind === "reference" ? `${id}-variables` : undefined}
            value={
              right.kind === "reference"
                ? right.path
                : String(right.value ?? "")
            }
            disabled={disabled}
            onChange={(event) =>
              replace({
                right:
                  right.kind === "reference"
                    ? { kind: "reference", path: event.target.value }
                    : {
                        kind: "literal",
                        value: literalFromInput(event.target.value),
                      },
              })
            }
          />
        </>
      )}
      {!disabled && (
        <button
          type="button"
          className="workflow-condition-nest"
          onClick={() =>
            onChange({
              kind: "group",
              combinator: "and",
              conditions: [current],
            })
          }
        >
          <GitBranch size={12} /> Add logic
        </button>
      )}
    </div>
  );
}

function demoDetail(
  id: string,
  key: string,
  name: string,
  description: string,
  definition: WorkflowDefinition,
  systemControlled: boolean,
): WorkflowDetail {
  return {
    id,
    key,
    name,
    description,
    primaryObjectType: definition.graph.primaryObjectType,
    status: "published",
    systemControlled,
    revision: 1,
    draftVersionId: systemControlled ? null : crypto.randomUUID(),
    publishedVersionId: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    tags: definition.settings.tags,
    folder: definition.settings.folder,
    draft: definition,
    published: definition,
    draftVersionNumber: systemControlled ? 1 : 2,
    publishedVersionNumber: 1,
  };
}

function summary(detail: WorkflowDetail): WorkflowSummary {
  const { draft: _draft, published: _published, ...rest } = detail;
  void _draft;
  void _published;
  return rest;
}

function nodeIcon(node: WorkflowNode) {
  if (node.type.startsWith("trigger.")) return Zap;
  if (node.type === "logic.ifElse") return GitBranch;
  if (node.type === "logic.router") return Route;
  if (node.type === "logic.wait") return Clock3;
  if (node.type.startsWith("system.")) return ShieldCheck;
  if (node.type === "control.end") return CircleStop;
  if (node.type === "action.sendSms") return MessageSquareText;
  if (node.type === "action.webhook") return Webhook;
  return Workflow;
}

function nodeSummary(node: WorkflowNode) {
  if (node.kind === "trigger")
    return String(node.config.eventType || "Choose an event").replaceAll(
      ".",
      " · ",
    );
  if (node.type === "logic.ifElse") return "First matching branch continues";
  if (node.type === "logic.router")
    return "Every matching branch continues in order";
  if (node.type === "logic.wait")
    return `Wait by ${String(node.config.mode || "unconfigured")}`;
  if (node.type === "system.smsPolicyGate")
    return "Consent, recipient ownership, DND, and company number";
  if (node.type === "action.sendEmail")
    return String(node.config.subject || "Configure email");
  if (node.type === "action.sendSms")
    return node.config.enabled === false
      ? "Disabled"
      : "Consent-checked Contact text";
  if (node.type === "action.webhook")
    return `${String(node.config.method || "POST")} · ${node.config.destination === "discord_lead_webhook" ? "Connected Discord webhook" : String(node.config.url || "Configure HTTPS URL")}`;
  if (node.type === "action.createLead") return "Create and link a Lead";
  if (node.type === "action.findOrCreateContact")
    return "Match email first, then phone";
  if (node.kind === "terminal")
    return String(node.config.reason || "Path complete");
  return (
    workflowNodeDefinition(node.type)?.description || "Configure this step"
  );
}

function workflowObjectHref(
  objectType: string,
  objectId: string,
  demo: boolean,
) {
  const views: Record<string, string> = {
    contact: "Contacts",
    lead: "Leads",
    quote: "Quotes",
    project: "Projects",
    item: "Upcoming",
  };
  const view = views[objectType];
  if (!view) return "";
  const params = new URLSearchParams({ view });
  params.set(
    objectType === "quote" || objectType === "project" ? "project" : "record",
    objectId,
  );
  return `${demo ? "/demo" : "/"}?${params}`;
}

function affectedObjectFromStep(step: Record<string, unknown>) {
  const snapshot = (step.output_snapshot || {}) as Record<string, unknown>;
  const output = (snapshot.output || {}) as Record<string, unknown>;
  const id = typeof output.id === "string" ? output.id : "";
  if (!id) return null;
  const nodeType = String(step.node_type || "");
  if (!/^action\.(?:create|update)/i.test(nodeType)) return null;
  const match = nodeType.match(/(Contact|Lead|Quote|Project|Item)/i);
  const objectType = match?.[1]?.toLocaleLowerCase();
  return objectType ? { id, objectType } : null;
}

function sortedEdges(edges: WorkflowEdge[]) {
  return [...edges].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
}

function WorkflowTree({
  definition,
  selectedNodeId,
  editable,
  onSelect,
  onInsert,
  onMove,
}: {
  definition: WorkflowDefinition;
  selectedNodeId: string | null;
  editable: boolean;
  onSelect: (id: string) => void;
  onInsert: (point: InsertionPoint) => void;
  onMove: (sourceId: string, targetId: string) => void;
}) {
  const nodes = useMemo(
    () => new Map(definition.graph.nodes.map((node) => [node.id, node])),
    [definition],
  );

  function renderNode(id: string, path: Set<string>): React.ReactNode {
    const node = nodes.get(id);
    if (!node) return null;
    if (path.has(id))
      return (
        <button
          className="workflow-loop-reference"
          type="button"
          onClick={() => onSelect(id)}
        >
          <Route size={14} /> Continue at {node.name}
        </button>
      );
    const nextPath = new Set(path).add(id);
    const Icon = nodeIcon(node);
    const edges = sortedEdges(node.outgoing);
    const collapsed = definition.layout.nodes[node.id]?.collapsed === true;
    return (
      <div
        className="workflow-tree-segment"
        key={`${[...path].join("/")}:${id}`}
      >
        <button
          type="button"
          className={`workflow-tree-node is-${node.kind} ${selectedNodeId === id ? "is-selected" : ""} ${node.type.startsWith("system.") ? "is-system" : ""}`}
          onClick={() => onSelect(id)}
          draggable={
            editable &&
            !["trigger", "decision", "terminal"].includes(node.kind) &&
            !node.type.startsWith("system.")
          }
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/x-workflow-node", node.id);
          }}
          onDragOver={(event) => {
            if (
              editable &&
              event.dataTransfer.types.includes("application/x-workflow-node")
            )
              event.preventDefault();
          }}
          onDrop={(event) => {
            const sourceId = event.dataTransfer.getData(
              "application/x-workflow-node",
            );
            if (sourceId && sourceId !== node.id) {
              event.preventDefault();
              onMove(sourceId, node.id);
            }
          }}
          aria-pressed={selectedNodeId === id}
        >
          <span className="workflow-tree-node-icon">
            <Icon size={18} strokeWidth={1.9} />
          </span>
          <span className="workflow-tree-node-copy">
            <span className="workflow-tree-node-kind">
              {node.type.startsWith("system.")
                ? "SYSTEM POLICY"
                : node.kind.toUpperCase()}
            </span>
            <h2>{node.name}</h2>
            <small>{nodeSummary(node)}</small>
          </span>
          {node.type.startsWith("system.") && (
            <span className="workflow-system-lock">Required</span>
          )}
        </button>

        {node.kind === "decision" && collapsed ? (
          <span className="workflow-collapsed-branches">
            {edges.length} branches collapsed
          </span>
        ) : node.kind === "decision" ? (
          <div className="workflow-tree-branches">
            {edges.map((edge) => (
              <div className="workflow-tree-branch" key={edge.id}>
                <div className="workflow-branch-line" />
                <span className={`workflow-branch-label is-${edge.kind}`}>
                  {edge.label}
                </span>
                {editable && (
                  <button
                    type="button"
                    className="workflow-insert-step"
                    onClick={() =>
                      onInsert({ sourceId: node.id, edgeId: edge.id })
                    }
                    aria-label={`Add step to ${edge.label}`}
                  >
                    <Plus size={14} />
                  </button>
                )}
                {renderNode(edge.to, nextPath)}
              </div>
            ))}
          </div>
        ) : (
          edges.map((edge) => (
            <div className="workflow-tree-next" key={edge.id}>
              <span className="workflow-tree-connector" aria-hidden="true">
                <ArrowDown size={14} />
              </span>
              {editable && node.kind !== "terminal" && (
                <button
                  type="button"
                  className="workflow-insert-step"
                  onClick={() =>
                    onInsert({ sourceId: node.id, edgeId: edge.id })
                  }
                  aria-label={`Add step after ${node.name}`}
                >
                  <Plus size={14} />
                </button>
              )}
              {renderNode(edge.to, nextPath)}
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="workflow-tree" aria-label="Workflow decision tree">
      {definition.graph.entryNodeIds.map((id) => renderNode(id, new Set()))}
    </div>
  );
}

function WorkflowMiniMap({
  definition,
  selectedNodeId,
}: {
  definition: WorkflowDefinition;
  selectedNodeId: string | null;
}) {
  const nodes = new Map(definition.graph.nodes.map((node) => [node.id, node]));
  const depths = new Map<string, number>();
  const queue = definition.graph.entryNodeIds.map((id) => ({ id, depth: 0 }));
  while (queue.length) {
    const current = queue.shift()!;
    const known = depths.get(current.id);
    if (known != null && known <= current.depth) continue;
    depths.set(current.id, current.depth);
    for (const edge of nodes.get(current.id)?.outgoing || [])
      queue.push({ id: edge.to, depth: current.depth + 1 });
  }
  let fallbackDepth = Math.max(0, ...depths.values()) + 1;
  for (const node of definition.graph.nodes)
    if (!depths.has(node.id)) depths.set(node.id, fallbackDepth++);
  const levels = new Map<number, WorkflowNode[]>();
  for (const node of definition.graph.nodes) {
    const depth = depths.get(node.id) || 0;
    levels.set(depth, [...(levels.get(depth) || []), node]);
  }
  const width = 210;
  const height = 132;
  const maxDepth = Math.max(1, ...levels.keys());
  const positions = new Map<string, { x: number; y: number }>();
  for (const [depth, levelNodes] of levels)
    levelNodes.forEach((node, index) =>
      positions.set(node.id, {
        x: ((index + 1) * width) / (levelNodes.length + 1),
        y: 8 + (depth * (height - 16)) / maxDepth,
      }),
    );
  return (
    <div className="workflow-mini-map" aria-label="Workflow mini-map">
      <span>OVERVIEW</span>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Complete workflow shape"
      >
        {definition.graph.nodes.flatMap((node) =>
          node.outgoing.map((edge) => {
            const from = positions.get(node.id);
            const to = positions.get(edge.to);
            return from && to ? (
              <line key={edge.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
            ) : null;
          }),
        )}
        {definition.graph.nodes.map((node) => {
          const point = positions.get(node.id)!;
          return (
            <circle
              key={node.id}
              cx={point.x}
              cy={point.y}
              r={node.id === selectedNodeId ? 4 : 2.6}
              className={`is-${node.kind} ${node.id === selectedNodeId ? "is-selected" : ""}`}
            >
              <title>{node.name}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}

function JsonEditor({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState("");
  function commit() {
    try {
      onChange(JSON.parse(text));
      setError("");
    } catch {
      setError("Use valid JSON before leaving this field.");
    }
  }
  return (
    <label className="workflow-json-editor">
      <span>{label}</span>
      <textarea
        value={text}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
      />
      {error && <small role="alert">{error}</small>}
    </label>
  );
}

function OperandEditor({
  id,
  label,
  value,
  variables,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value?: WorkflowOperand;
  variables: string[];
  disabled: boolean;
  onChange: (value: WorkflowOperand) => void;
}) {
  const operand = value || { kind: "literal", value: "" };
  return (
    <div className="workflow-operand-editor">
      <label className="workflow-field">
        <span>{label}</span>
        <select
          aria-label={`${label} source`}
          value={operand.kind}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              event.target.value === "reference"
                ? { kind: "reference", path: variables[0] || "event.objectId" }
                : { kind: "literal", value: "" },
            )
          }
        >
          <option value="reference">Workflow value</option>
          <option value="literal">Fixed value</option>
        </select>
      </label>
      <label className="workflow-field">
        <span>{operand.kind === "reference" ? "Choose a value" : "Value"}</span>
        <input
          aria-label={label}
          list={operand.kind === "reference" ? `${id}-variables` : undefined}
          value={
            operand.kind === "reference"
              ? operand.path
              : String(operand.value ?? "")
          }
          disabled={disabled}
          placeholder={
            operand.kind === "reference"
              ? "Search available values…"
              : "Enter a value"
          }
          onChange={(event) =>
            onChange(
              operand.kind === "reference"
                ? { kind: "reference", path: event.target.value }
                : {
                    kind: "literal",
                    value: literalFromInput(event.target.value),
                  },
            )
          }
        />
        {operand.kind === "reference" && (
          <datalist id={`${id}-variables`}>
            {variables.map((variable) => (
              <option key={variable} value={variable} />
            ))}
          </datalist>
        )}
      </label>
    </div>
  );
}

function FieldMappingEditor({
  id,
  fields,
  variables,
  disabled,
  onChange,
}: {
  id: string;
  fields: Record<string, WorkflowOperand>;
  variables: string[];
  disabled: boolean;
  onChange: (fields: Record<string, WorkflowOperand>) => void;
}) {
  const entries = Object.entries(fields);
  return (
    <div className="workflow-field-mapping">
      <div className="workflow-inspector-section-title">
        <span>Field mapping</span>
        <button
          type="button"
          disabled={disabled || entries.length >= 100}
          onClick={() => {
            let index = entries.length + 1;
            let key = `field${index}`;
            while (Object.hasOwn(fields, key)) key = `field${++index}`;
            onChange({ ...fields, [key]: { kind: "literal", value: "" } });
          }}
        >
          <Plus size={13} /> Add field
        </button>
      </div>
      {entries.length ? (
        entries.map(([field, operand], index) => (
          <div className="workflow-field-mapping-row" key={`${id}-${index}`}>
            <label className="workflow-field">
              <span>Object field</span>
              <input
                aria-label="Object field"
                value={field}
                disabled={disabled}
                onChange={(event) => {
                  const nextName = event.target.value;
                  if (
                    !nextName ||
                    (nextName !== field && Object.hasOwn(fields, nextName))
                  )
                    return;
                  const ordered: Record<string, WorkflowOperand> = {};
                  entries.forEach(([name, value], itemIndex) => {
                    ordered[itemIndex === index ? nextName : name] =
                      itemIndex === index ? operand : value;
                  });
                  onChange(ordered);
                }}
              />
            </label>
            <OperandEditor
              id={`${id}-${index}`}
              label="Field value"
              value={operand}
              variables={variables}
              disabled={disabled}
              onChange={(value) => onChange({ ...fields, [field]: value })}
            />
            <button
              type="button"
              className="workflow-mapping-remove"
              aria-label={`Remove ${field}`}
              disabled={disabled}
              onClick={() =>
                onChange(
                  Object.fromEntries(
                    entries.filter(([name]) => name !== field),
                  ),
                )
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))
      ) : (
        <p className="workflow-condition-help">
          Add the fields this action should write. Each value can be fixed or
          pulled from the trigger, current object, or an earlier step.
        </p>
      )}
    </div>
  );
}

function starterConfig(type: string): Record<string, unknown> {
  if (type === "logic.wait")
    return { mode: "duration", amount: 1, unit: "days" };
  if (type === "action.sendEmail")
    return {
      enabled: true,
      recipient: { kind: "reference", path: "contact.email" },
      subject: "",
      body: "",
      missingValueBehavior: "skip",
    };
  if (type === "action.sendSms")
    return {
      enabled: true,
      recipient: { kind: "reference", path: "contact.phone" },
      contactId: { kind: "reference", path: "contact.id" },
      body: "",
      category: "appointment",
      missingValueBehavior: "skip",
    };
  if (type === "action.internalNotification")
    return { enabled: true, channel: "connected_team", title: "", body: "" };
  if (type === "action.findContact")
    return {
      matchFields: ["email"],
      email: { kind: "reference", path: "contact.email" },
      multipleMatch: "latest",
    };
  if (type === "action.findOrCreateContact")
    return {
      matchFields: ["email", "phone"],
      email: { kind: "reference", path: "event.payload.email" },
      phone: { kind: "reference", path: "event.payload.phone" },
      multipleMatch: "latest",
      matchExisting: true,
      fields: {},
    };
  if (type === "action.createProjectFromQuote")
    return {
      quoteId: { kind: "reference", path: "quote.id" },
      fields: {},
    };
  if (type === "action.createOrUpdateQuote") return { fields: {} };
  if (type.startsWith("action.create")) return { fields: {} };
  if (type === "action.updateContact")
    return {
      objectType: "contact",
      objectId: { kind: "reference", path: "contact.id" },
      fields: {},
    };
  if (type === "action.updateLead")
    return {
      objectType: "lead",
      objectId: { kind: "reference", path: "lead.id" },
      fields: {},
    };
  if (type === "action.updateObject")
    return {
      objectType: "contact",
      objectId: { kind: "reference", path: "event.objectId" },
      fields: {},
    };
  if (type === "action.assignUser")
    return {
      objectType: "contact",
      objectId: { kind: "reference", path: "event.objectId" },
      userId: { kind: "reference", path: "actor.id" },
    };
  if (type === "action.addNote")
    return {
      objectType: "contact",
      objectId: { kind: "reference", path: "contact.id" },
      body: "",
    };
  if (type === "action.webhook")
    return {
      enabled: true,
      destination: "custom",
      method: "POST",
      url: "https://",
      headers: {},
      bodyType: "json",
      body: "",
      missingValueBehavior: "blank",
      timeoutSeconds: 15,
      saveResponse: false,
    };
  if (type === "action.enrollWorkflow" || type === "action.removeWorkflow")
    return { workflowId: "" };
  if (type === "control.end") return { reason: "Completed" };
  return {};
}

function sampleEvent(detail: WorkflowDetail): WorkflowEvent {
  const trigger = detail.draft.graph.nodes.find(
    (node) =>
      node.kind === "trigger" &&
      detail.draft.graph.entryNodeIds.includes(node.id),
  );
  const type = (trigger?.config.eventType ||
    "workflow.manual") as WorkflowEvent["type"];
  const website = type === "website.form.submitted";
  const inboundSms = type === "sms.inbound.received";
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    type,
    organizationId: "00000000-0000-4000-8000-000000000099",
    actor:
      website || inboundSms
        ? { type: "contact", name: website ? "Taylor Reed" : "SMS Contact" }
        : { type: "user", name: "Workflow tester" },
    objectType: website
      ? "lead"
      : inboundSms
        ? "communication"
        : detail.primaryObjectType,
    objectId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    correlationId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    payload: website
      ? {
          firstName: "Taylor",
          lastName: "Reed",
          name: "Taylor Reed",
          email: "taylor@example.com",
          phone: "+19195550123",
          address: "123 Main Street",
          zip: "27511",
          project: "Kitchen Remodel",
          description: "Cabinets, counters, and lighting",
          smsAppointmentOptIn: true,
          smsMarketingOptIn: false,
        }
      : inboundSms
        ? {
            complianceType: "stop",
            body: "STOP",
            from: "+19195550123",
            to: "+18885010503",
          }
        : {
            recordId: crypto.randomUUID(),
            name: "Example record",
            status: "New",
          },
  };
}

export default function WorkflowAutomationPanel({
  user,
  leads,
  demo,
}: {
  user: User;
  leads: Lead[];
  demo: boolean;
}) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [detail, setDetail] = useState<WorkflowDetail | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [mode, setMode] = useState<StudioMode>("build");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "published" | "draft"
  >("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [insertion, setInsertion] = useState<InsertionPoint | null>(null);
  const [addingTrigger, setAddingTrigger] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [simulation, setSimulation] = useState<WorkflowSimulation | null>(null);
  const [testEvent, setTestEvent] = useState<WorkflowEvent | null>(null);
  const [testContext, setTestContext] = useState<Record<string, unknown>>({
    organization: { name: "Premium Remodel" },
  });
  const [testFixtureSource, setTestFixtureSource] =
    useState<TestFixtureSource>("manual");
  const [recentTestEvents, setRecentTestEvents] = useState<TestEventOption[]>(
    [],
  );
  const [selectedTestEventId, setSelectedTestEventId] = useState("");
  const [testObjectType, setTestObjectType] = useState<
    "contact" | "lead" | "quote" | "project" | "item"
  >("contact");
  const [testObjects, setTestObjects] = useState<TestObjectOption[]>([]);
  const [selectedTestObjectId, setSelectedTestObjectId] = useState("");
  const [testFixtureLoading, setTestFixtureLoading] = useState(false);
  const [externalTestNodeId, setExternalTestNodeId] = useState("");
  const [externalTestConfirmed, setExternalTestConfirmed] = useState(false);
  const [externalTestLoading, setExternalTestLoading] = useState(false);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [objectHistoryType, setObjectHistoryType] =
    useState<WorkflowObjectType>("contact");
  const [objectHistoryId, setObjectHistoryId] = useState("");
  const [objectHistoryRuns, setObjectHistoryRuns] = useState<RunItem[] | null>(
    null,
  );
  const [objectHistoryLoading, setObjectHistoryLoading] = useState(false);
  const [retryingRunId, setRetryingRunId] = useState("");
  const [sideLoading, setSideLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createObject, setCreateObject] =
    useState<WorkflowObjectType>("contact");
  const [createTemplate, setCreateTemplate] = useState<
    "blank" | "lead-follow-up" | "project-item-handoff"
  >("blank");
  const [undoStack, setUndoStack] = useState<WorkflowDefinition[]>([]);
  const [redoStack, setRedoStack] = useState<WorkflowDefinition[]>([]);
  const [treeZoom, setTreeZoom] = useState(1);
  const [webhookState, setWebhookState] = useState({
    workflowId: "",
    configured: false,
    url: "",
  });
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [senderOptions, setSenderOptions] = useState<{
    email: SenderOption[];
    sms: SenderOption[];
    webhook: SenderOption[];
  }>({ email: [], sms: [], webhook: [] });
  const detailRef = useRef<WorkflowDetail | null>(detail);
  const replaceDetail = useCallback((next: WorkflowDetail | null) => {
    detailRef.current = next;
    setDetail(next);
  }, []);
  const treeViewportRef = useRef<HTMLDivElement>(null);
  const treeSurfaceRef = useRef<HTMLDivElement>(null);
  const centerWorkflow = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const viewport = treeViewportRef.current;
      const surface = treeSurfaceRef.current;
      if (!viewport || !surface) return;
      viewport.scrollTo({
        left: Math.max(0, (surface.scrollWidth - viewport.clientWidth) / 2),
        top: 0,
        behavior,
      });
    },
    [],
  );
  const fitWorkflow = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const viewport = treeViewportRef.current;
      const surface = treeSurfaceRef.current;
      const tree = surface?.querySelector<HTMLElement>(".workflow-tree");
      if (!viewport || !surface || !tree) return;

      const availableWidth = Math.max(280, viewport.clientWidth - 64);
      const availableHeight = Math.max(280, viewport.clientHeight - 48);
      const contentWidth = Math.max(1, tree.scrollWidth);
      const contentHeight = Math.max(1, tree.scrollHeight);
      const nextZoom = Math.max(
        MIN_TREE_ZOOM,
        Math.min(
          1,
          availableWidth / contentWidth,
          availableHeight / contentHeight,
        ),
      );

      setTreeZoom(nextZoom);
      requestAnimationFrame(() => centerWorkflow(behavior));
    },
    [centerWorkflow],
  );
  const adjustTreeZoom = useCallback(
    (change: number) => {
      setTreeZoom((zoom) =>
        Math.max(MIN_TREE_ZOOM, Math.min(MAX_TREE_ZOOM, zoom + change)),
      );
      requestAnimationFrame(() => centerWorkflow("auto"));
    },
    [centerWorkflow],
  );
  const editable = !demo && user.role === "admin" && !detail?.systemControlled;

  useEffect(() => {
    if (loading || mode !== "build" || !detail?.id) return;
    const frame = requestAnimationFrame(() => fitWorkflow("auto"));
    return () => cancelAnimationFrame(frame);
  }, [detail?.id, fitWorkflow, loading, mode]);

  const loadDetail = useCallback(
    async (id: string) => {
      setLoading(true);
      setError("");
      try {
        if (demo) {
          const next =
            id === demoIds.sms
              ? demoDetail(
                  demoIds.sms,
                  "inbound-text-compliance",
                  "Inbound text compliance",
                  "Record HELP, STOP, and START while enforcing SMS policy.",
                  smsComplianceWorkflowSeed(),
                  true,
                )
              : demoDetail(
                  demoIds.website,
                  "website-lead-intake",
                  "Website lead intake",
                  "Capture website inquiries as Contacts and Leads.",
                  websiteLeadWorkflowSeed(),
                  false,
                );
          replaceDetail(next);
          setTestEvent(sampleEvent(next));
          setTestContext({ organization: { name: "Premium Remodel" } });
          setSimulation(null);
          setSelectedNodeId(
            next.key === "website-lead-intake" ? "create-lead" : "inbound-sms",
          );
        } else {
          const response = await fetch(`/api/workflows/${id}`, {
            cache: "no-store",
          });
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Could not load workflow.");
          replaceDetail(data);
          setTestEvent(sampleEvent(data));
          setTestContext({ organization: { name: "Premium Remodel" } });
          setSimulation(null);
          setSelectedNodeId(data.draft.graph.entryNodeIds[0] || null);
        }
        setDirty(false);
        setUndoStack([]);
        setRedoStack([]);
        setMessage("");
        setMode("build");
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "Could not load workflow.",
        );
      } finally {
        setLoading(false);
      }
    },
    [demo, replaceDetail],
  );

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        let items: WorkflowSummary[];
        if (demo) {
          const website = demoDetail(
            demoIds.website,
            "website-lead-intake",
            "Website lead intake",
            "Capture website inquiries as Contacts and Leads.",
            websiteLeadWorkflowSeed(),
            false,
          );
          const sms = demoDetail(
            demoIds.sms,
            "inbound-text-compliance",
            "Inbound text compliance",
            "Record HELP, STOP, and START while enforcing SMS policy.",
            smsComplianceWorkflowSeed(),
            true,
          );
          items = [summary(website), summary(sms)];
        } else {
          const response = await fetch("/api/workflows", { cache: "no-store" });
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Could not load workflows.");
          items = data.workflows;
        }
        if (!active) return;
        setWorkflows(items);
        if (items[0]) await loadDetail(items[0].id);
        else setLoading(false);
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load workflows.",
          );
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [demo, loadDetail]);

  useEffect(() => {
    let active = true;
    if (demo)
      return () => {
        active = false;
      };
    void fetch("/api/workflows/connections", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "Could not load workflow sender connections.",
          );
        if (active)
          setSenderOptions({
            email: data.email || [],
            sms: data.sms || [],
            webhook: data.webhook || [],
          });
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load workflow sender connections.",
          );
      });
    return () => {
      active = false;
    };
  }, [demo]);

  const selectedNode = detail?.draft.graph.nodes.find(
    (node) => node.id === selectedNodeId,
  );
  const detailId = detail?.id;
  const webhookConfigured =
    webhookState.workflowId === detail?.id && webhookState.configured;
  const webhookUrl =
    webhookState.workflowId === detail?.id ? webhookState.url : "";
  useEffect(() => {
    let active = true;
    if (demo || !detailId || selectedNode?.type !== "trigger.inboundWebhook") {
      return () => {
        active = false;
      };
    }
    void fetch(`/api/workflows/${detailId}/webhook-token`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load webhook status.");
        if (active)
          setWebhookState({
            workflowId: detailId,
            configured: data.configured === true,
            url: "",
          });
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load webhook status.",
          );
      });
    return () => {
      active = false;
    };
  }, [demo, detailId, selectedNode?.type]);
  const validation = useMemo(
    () => (detail ? validateWorkflowDefinition(detail.draft).issues : []),
    [detail],
  );
  const availableVariables = useMemo(() => {
    const base = [
      "event.type",
      "event.objectId",
      "event.payload.name",
      "event.payload.firstName",
      "event.payload.lastName",
      "event.payload.email",
      "event.payload.phone",
      "event.payload.address",
      "event.payload.zip",
      "event.payload.project",
      "event.payload.description",
      "event.payload.status",
      "event.payload.stage",
      "event.payload.disposition",
      "event.payload.smsAppointmentOptIn",
      "event.payload.smsMarketingOptIn",
      "organization.id",
      "organization.name",
      "contact.id",
      "contact.firstName",
      "contact.lastName",
      "contact.email",
      "contact.phone",
      "lead.id",
      "lead.status",
      "lead.disposition",
      "quote.id",
      "quote.status",
      "quote.total",
      "project.id",
      "project.status",
      "item.id",
      "item.status",
      "actor.id",
      "actor.name",
    ];
    if (!detail) return base;
    const selectedIndex = detail.draft.graph.nodes.findIndex(
      (node) => node.id === selectedNodeId,
    );
    const prior = detail.draft.graph.nodes.slice(
      0,
      selectedIndex < 0 ? detail.draft.graph.nodes.length : selectedIndex,
    );
    for (const node of prior) {
      if (!node.outputAlias) continue;
      const fields = workflowNodeDefinition(node.type)?.outputFields || [];
      for (const field of fields)
        base.push(`outputs.${node.outputAlias}.${field}`);
    }
    return [...new Set(base)].sort();
  }, [detail, selectedNodeId]);
  const draftComparison = useMemo(() => {
    if (!detail?.published) return null;
    const draftNodes = new Map(
      detail.draft.graph.nodes.map((node) => [node.id, node]),
    );
    const publishedNodes = new Map(
      detail.published.graph.nodes.map((node) => [node.id, node]),
    );
    const added = [...draftNodes.keys()].filter(
      (id) => !publishedNodes.has(id),
    ).length;
    const removed = [...publishedNodes.keys()].filter(
      (id) => !draftNodes.has(id),
    ).length;
    const changed = [...draftNodes.entries()].filter(([id, node]) => {
      const published = publishedNodes.get(id);
      return published && JSON.stringify(node) !== JSON.stringify(published);
    }).length;
    return {
      added,
      removed,
      changed,
      settingsChanged:
        JSON.stringify(detail.draft.settings) !==
        JSON.stringify(detail.published.settings),
    };
  }, [detail]);
  const visibleWorkflows = workflows.filter((workflow) => {
    const query = search.trim().toLocaleLowerCase();
    return (
      (statusFilter === "all" || workflow.status === statusFilter) &&
      (folderFilter === "all" || workflow.folder === folderFilter) &&
      (!query ||
        workflow.name.toLocaleLowerCase().includes(query) ||
        workflow.description.toLocaleLowerCase().includes(query) ||
        workflow.folder.toLocaleLowerCase().includes(query) ||
        workflow.tags.some((tag) => tag.toLocaleLowerCase().includes(query)))
    );
  });
  const workflowFolders = [
    ...new Set(workflows.map((workflow) => workflow.folder).filter(Boolean)),
  ].sort((left, right) => left.localeCompare(right));

  function changeDefinition(update: (definition: WorkflowDefinition) => void) {
    const current = detailRef.current;
    if (!current || !editable) return;
    setUndoStack((items) =>
      [...items, structuredClone(current.draft)].slice(-40),
    );
    setRedoStack([]);
    const draft = structuredClone(current.draft);
    update(draft);
    const next = { ...current, draft };
    replaceDetail(next);
    setDirty(true);
    setMessage("");
  }

  function undoDraftChange() {
    const current = detailRef.current;
    if (!current || !undoStack.length || !editable) return;
    const previous = undoStack.at(-1)!;
    setRedoStack((items) =>
      [...items, structuredClone(current.draft)].slice(-40),
    );
    setUndoStack((items) => items.slice(0, -1));
    const next = { ...current, draft: structuredClone(previous) };
    replaceDetail(next);
    setDirty(true);
  }

  function redoDraftChange() {
    const current = detailRef.current;
    if (!current || !redoStack.length || !editable) return;
    const next = redoStack.at(-1)!;
    setUndoStack((items) =>
      [...items, structuredClone(current.draft)].slice(-40),
    );
    setRedoStack((items) => items.slice(0, -1));
    const nextDetail = { ...current, draft: structuredClone(next) };
    replaceDetail(nextDetail);
    setDirty(true);
  }

  function updateNode(patch: Partial<WorkflowNode>) {
    if (!selectedNodeId) return;
    changeDefinition((definition) => {
      const index = definition.graph.nodes.findIndex(
        (node) => node.id === selectedNodeId,
      );
      if (index >= 0)
        definition.graph.nodes[index] = {
          ...definition.graph.nodes[index],
          ...patch,
        };
    });
  }

  function updateSettings(patch: Partial<WorkflowDefinition["settings"]>) {
    changeDefinition((definition) => {
      definition.settings = { ...definition.settings, ...patch };
    });
  }

  const saveDraft = useCallback(
    async (showMessage = true) => {
      if (!detail || !editable || !dirty) return detail;
      setSaving(true);
      setError("");
      try {
        const response = await fetch(`/api/workflows/${detail.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: detail.revision,
            definition: detail.draft,
            name: detail.name,
            description: detail.description,
          }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not save draft.");
        replaceDetail(data);
        setDirty(false);
        if (showMessage) setMessage("Draft saved");
        setWorkflows((items) =>
          items.map((item) => (item.id === data.id ? summary(data) : item)),
        );
        return data as WorkflowDetail;
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "Could not save draft.",
        );
        return null;
      } finally {
        setSaving(false);
      }
    },
    [detail, dirty, editable, replaceDetail],
  );

  useEffect(() => {
    if (!dirty || !editable || saving || publishing) return;
    const timer = window.setTimeout(() => void saveDraft(false), 1_800);
    return () => window.clearTimeout(timer);
  }, [dirty, editable, publishing, saveDraft, saving]);

  async function publish() {
    if (!detail || !editable) return;
    setPublishing(true);
    setError("");
    try {
      const saved = dirty ? await saveDraft(false) : detail;
      if (!saved) return;
      const response = await fetch(`/api/workflows/${saved.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: saved.revision,
          changeNote: "Published from workflow builder",
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not publish workflow.");
      replaceDetail(data);
      setDirty(false);
      setMessage(`Version ${data.publishedVersionNumber} published`);
      setWorkflows((items) =>
        items.map((item) => (item.id === data.id ? summary(data) : item)),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not publish workflow.",
      );
    } finally {
      setPublishing(false);
    }
  }

  function insertNode(definition: WorkflowNodeDefinition) {
    if (!detail || definition.systemControlled) return;
    if (addingTrigger && definition.kind === "trigger") {
      changeDefinition((draft) => {
        const id = `${definition.type.split(".").at(-1) || "trigger"}-${crypto.randomUUID().slice(0, 8)}`;
        const firstEntry = draft.graph.nodes.find(
          (node) => node.id === draft.graph.entryNodeIds[0],
        );
        const target = firstEntry?.outgoing[0]?.to;
        draft.graph.nodes.push({
          id,
          type: definition.type,
          kind: "trigger",
          name: definition.name,
          config:
            definition.type === "trigger.schedule"
              ? {
                  eventType: "schedule.reached",
                  schedule: {
                    mode: "once",
                    at: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
                  },
                }
              : { eventType: triggerEventByType[definition.type] },
          outgoing: target
            ? [
                {
                  id: `${id}-start`,
                  to: target,
                  label: "Continue",
                  order: 0,
                  kind: "default",
                },
              ]
            : [],
        });
        draft.graph.entryNodeIds.push(id);
        setSelectedNodeId(id);
      });
      setAddingTrigger(false);
      setLibrarySearch("");
      return;
    }
    if (!insertion || definition.kind === "trigger") return;
    changeDefinition((draft) => {
      const source = draft.graph.nodes.find(
        (node) => node.id === insertion.sourceId,
      );
      const edge = source?.outgoing.find(
        (item) => item.id === insertion.edgeId,
      );
      if (!source || !edge) return;
      const id = `${definition.type.split(".").at(-1) || "step"}-${crypto.randomUUID().slice(0, 8)}`;
      const originalTarget = edge.to;
      if (definition.type === "action.sendSms") {
        const policyId = `sms-policy-${crypto.randomUUID().slice(0, 8)}`;
        edge.to = policyId;
        draft.graph.nodes.push(
          {
            id: policyId,
            type: "system.smsPolicyGate",
            kind: "action",
            name: "SMS consent and DND policy",
            outputAlias: `smsPolicy_${policyId.replaceAll("-", "_")}`,
            config: {
              category: "appointment",
              recipient: { kind: "reference", path: "contact.phone" },
              contactId: { kind: "reference", path: "contact.id" },
            },
            outgoing: [
              {
                id: `${policyId}-allowed`,
                to: id,
                label: "Allowed",
                order: 0,
                kind: "default",
              },
            ],
          },
          {
            id,
            type: definition.type,
            kind: definition.kind,
            name: definition.name,
            config: starterConfig(definition.type),
            outgoing: [
              {
                id: `${id}-next`,
                to: originalTarget,
                label: "Continue",
                order: 0,
                kind: "default",
              },
            ],
          },
        );
        setSelectedNodeId(id);
        return;
      }
      edge.to = id;
      const outgoing: WorkflowEdge[] =
        definition.type === "logic.ifElse" || definition.type === "logic.router"
          ? [
              {
                id: `${id}-fallback`,
                to: originalTarget,
                label: "Otherwise",
                order: 0,
                kind: "fallback",
              },
            ]
          : [
              {
                id: `${id}-next`,
                to: originalTarget,
                label: "Continue",
                order: 0,
                kind: "default",
              },
            ];
      draft.graph.nodes.push({
        id,
        type: definition.type,
        kind: definition.kind,
        name: definition.name,
        config: starterConfig(definition.type),
        outgoing,
      });
      setSelectedNodeId(id);
    });
    setInsertion(null);
    setLibrarySearch("");
  }

  function deleteSelectedNode() {
    if (!detail || !selectedNode || selectedNode.kind === "terminal") return;
    if (selectedNode.kind === "trigger") {
      if (detail.draft.graph.entryNodeIds.length <= 1) {
        setError("A workflow must keep at least one trigger.");
        return;
      }
      changeDefinition((draft) => {
        draft.graph.entryNodeIds = draft.graph.entryNodeIds.filter(
          (id) => id !== selectedNode.id,
        );
        draft.graph.nodes = draft.graph.nodes.filter(
          (node) => node.id !== selectedNode.id,
        );
      });
      setSelectedNodeId(
        detail.draft.graph.entryNodeIds.find((id) => id !== selectedNode.id) ||
          null,
      );
      return;
    }
    if (selectedNode.outgoing.length !== 1) {
      setError("Remove or reconnect this step's branches before deleting it.");
      return;
    }
    changeDefinition((draft) => {
      const target = selectedNode.outgoing[0].to;
      for (const node of draft.graph.nodes)
        for (const edge of node.outgoing)
          if (edge.to === selectedNode.id) edge.to = target;
      draft.graph.nodes = draft.graph.nodes.filter(
        (node) => node.id !== selectedNode.id,
      );
    });
    setSelectedNodeId(detail.draft.graph.entryNodeIds[0] || null);
  }

  function addBranch() {
    if (!selectedNode || selectedNode.kind !== "decision") return;
    changeDefinition((draft) => {
      const decision = draft.graph.nodes.find(
        (node) => node.id === selectedNode.id,
      )!;
      const endId = `end-${crypto.randomUUID().slice(0, 8)}`;
      const fallbackIndex = decision.outgoing.findIndex(
        (edge) => edge.kind === "fallback",
      );
      const order =
        fallbackIndex >= 0 ? fallbackIndex : decision.outgoing.length;
      decision.outgoing.splice(Math.max(0, fallbackIndex), 0, {
        id: `branch-${crypto.randomUUID().slice(0, 8)}`,
        to: endId,
        label: `Branch ${decision.outgoing.length}`,
        order,
        kind: "branch",
        condition: {
          kind: "comparison",
          left: { kind: "reference", path: "event.payload.value" },
          operator: "isNotEmpty",
        },
      });
      decision.outgoing.forEach((edge, index) => (edge.order = index));
      draft.graph.nodes.push({
        id: endId,
        type: "control.end",
        kind: "terminal",
        name: "End branch",
        config: { reason: "Branch completed" },
        outgoing: [],
      });
    });
  }

  function reorderBranch(from: number, to: number) {
    if (!selectedNode || selectedNode.kind !== "decision" || from === to)
      return;
    changeDefinition((draft) => {
      const decision = draft.graph.nodes.find(
        (node) => node.id === selectedNode.id,
      )!;
      const edges = sortedEdges(decision.outgoing);
      const [moved] = edges.splice(from, 1);
      edges.splice(to, 0, moved);
      const fallback = edges.find((edge) => edge.kind === "fallback");
      decision.outgoing = [
        ...edges.filter((edge) => edge.kind !== "fallback"),
        ...(fallback ? [fallback] : []),
      ].map((edge, index) => ({ ...edge, order: index }));
    });
  }

  function updateBranchCondition(edgeId: string, condition: WorkflowCondition) {
    if (!selectedNode || selectedNode.kind !== "decision") return;
    updateNode({
      outgoing: selectedNode.outgoing.map((edge) =>
        edge.id === edgeId ? { ...edge, condition } : edge,
      ),
    });
  }

  function moveNodeBefore(sourceId: string, targetId: string) {
    if (!detail || sourceId === targetId) return;
    changeDefinition((draft) => {
      const source = draft.graph.nodes.find((node) => node.id === sourceId);
      const target = draft.graph.nodes.find((node) => node.id === targetId);
      if (
        !source ||
        !target ||
        source.outgoing.length !== 1 ||
        ["trigger", "decision", "terminal"].includes(source.kind) ||
        source.type.startsWith("system.")
      )
        return;
      const sourceParent = draft.graph.nodes.find((node) =>
        node.outgoing.some((edge) => edge.to === sourceId),
      );
      const targetParent = draft.graph.nodes.find((node) =>
        node.outgoing.some((edge) => edge.to === targetId),
      );
      const sourceParentEdge = sourceParent?.outgoing.find(
        (edge) => edge.to === sourceId,
      );
      const targetParentEdge = targetParent?.outgoing.find(
        (edge) => edge.to === targetId,
      );
      if (
        !sourceParentEdge ||
        !targetParentEdge ||
        targetParent?.id === source.id
      )
        return;
      const sourceNext = source.outgoing[0].to;
      sourceParentEdge.to = sourceNext;
      targetParentEdge.to = source.id;
      source.outgoing[0].to = target.id;
    });
    setSelectedNodeId(sourceId);
  }

  function moveSelected(direction: "up" | "down") {
    if (!detail || !selectedNode) return;
    if (direction === "up") {
      const parent = detail.draft.graph.nodes.find((node) =>
        node.outgoing.some((edge) => edge.to === selectedNode.id),
      );
      if (parent) moveNodeBefore(selectedNode.id, parent.id);
      return;
    }
    const nextId =
      selectedNode.outgoing.length === 1 ? selectedNode.outgoing[0].to : null;
    if (nextId) moveNodeBefore(nextId, selectedNode.id);
  }

  async function loadRecentTestEvents() {
    if (demo) return;
    setTestFixtureLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workflows/test-fixtures?mode=recent", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load recent workflow events.");
      setRecentTestEvents(data.events || []);
      setSelectedTestEventId(
        (current) => current || data.events?.[0]?.id || "",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load recent workflow events.",
      );
    } finally {
      setTestFixtureLoading(false);
    }
  }

  async function loadTestObjects(
    objectType: "contact" | "lead" | "quote" | "project" | "item",
  ) {
    if (demo) return;
    setTestFixtureLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ mode: "objects", objectType });
      const response = await fetch(`/api/workflows/test-fixtures?${query}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load workflow objects.");
      setTestObjects(data.objects || []);
      setSelectedTestObjectId(data.objects?.[0]?.id || "");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load workflow objects.",
      );
    } finally {
      setTestFixtureLoading(false);
    }
  }

  async function applyStoredTestFixture() {
    if (!detail || demo || testFixtureSource === "manual") return;
    setTestFixtureLoading(true);
    setError("");
    try {
      if (testFixtureSource === "recent") {
        if (!selectedTestEventId) return;
        const query = new URLSearchParams({
          mode: "event",
          id: selectedTestEventId,
        });
        const response = await fetch(`/api/workflows/test-fixtures?${query}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load the selected event.");
        const nextEvent = data.event as WorkflowEvent;
        const nextContext = {
          ...testContext,
          [nextEvent.objectType]: nextEvent.payload,
        };
        setTestEvent(nextEvent);
        setTestContext(nextContext);
        setSimulation(simulateWorkflow(detail.draft, nextEvent, nextContext));
        return;
      }

      if (!selectedTestObjectId) return;
      const query = new URLSearchParams({
        mode: "object",
        objectType: testObjectType,
        id: selectedTestObjectId,
      });
      const response = await fetch(`/api/workflows/test-fixtures?${query}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load the selected object.");
      const object = data.object as {
        id: string;
        objectType: WorkflowObjectType;
        data: Record<string, unknown>;
      };
      const trigger = detail.draft.graph.nodes.find(
        (node) =>
          node.kind === "trigger" &&
          detail.draft.graph.entryNodeIds.includes(node.id),
      );
      const nextEvent: WorkflowEvent = {
        ...(testEvent || sampleEvent(detail)),
        id: crypto.randomUUID(),
        type: (trigger?.config.eventType ||
          "workflow.manual") as WorkflowEvent["type"],
        objectType: object.objectType,
        objectId: object.id,
        occurredAt: new Date().toISOString(),
        correlationId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        payload: object.data,
      };
      const nextContext = { ...testContext, [object.objectType]: object.data };
      setTestEvent(nextEvent);
      setTestContext(nextContext);
      setSimulation(simulateWorkflow(detail.draft, nextEvent, nextContext));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load the selected test fixture.",
      );
    } finally {
      setTestFixtureLoading(false);
    }
  }

  function runTest() {
    if (!detail || !testEvent) return;
    setSimulation(simulateWorkflow(detail.draft, testEvent, testContext));
    setMode("test");
  }

  async function runExternalActionTest() {
    if (
      !detail ||
      !testEvent ||
      !externalTestNodeId ||
      !externalTestConfirmed ||
      demo
    )
      return;
    setExternalTestLoading(true);
    setError("");
    try {
      const saved = dirty ? await saveDraft(false) : detail;
      if (!saved) return;
      const response = await fetch(`/api/workflows/${saved.id}/test-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId: crypto.randomUUID(),
          nodeId: externalTestNodeId,
          confirmation: "RUN EXTERNAL TEST",
          event: testEvent,
          context: testContext,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "The external action test failed.");
      setMessage(data.summary || "External action test completed.");
      setExternalTestNodeId("");
      setExternalTestConfirmed(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The external action test failed.",
      );
    } finally {
      setExternalTestLoading(false);
    }
  }

  async function loadMode(next: StudioMode) {
    setMode(next);
    if (!detail || demo || next === "build" || next === "test") return;
    setSideLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/workflows/${detail.id}/${next}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || `Could not load ${next}.`);
      if (next === "versions") setVersions(data.versions);
      if (next === "runs") setRuns(data.runs);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : `Could not load ${next}.`,
      );
    } finally {
      setSideLoading(false);
    }
  }

  async function retryRun(runId: string) {
    if (!detail || demo) return;
    setRetryingRunId(runId);
    setError("");
    try {
      const response = await fetch(
        `/api/workflows/${detail.id}/runs/${runId}/retry`,
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not retry this workflow action.");
      setMessage(
        data.status === "completed"
          ? "The failed action and remaining path completed."
          : "The retry was accepted and the run is continuing.",
      );
      await loadMode("runs");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not retry this workflow action.",
      );
    } finally {
      setRetryingRunId("");
    }
  }

  async function loadObjectHistory() {
    if (!objectHistoryId.trim() || demo) return;
    setObjectHistoryLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        objectType: objectHistoryType,
        objectId: objectHistoryId.trim(),
      });
      const response = await fetch(`/api/workflows/history?${query}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "Could not load object workflow history.",
        );
      setObjectHistoryRuns(
        (data.runs || []).map((run: Partial<RunItem>) => ({
          ...run,
          steps: run.steps || [],
          waits: run.waits || [],
          summary: run.summary || {},
          legacy: run.legacy === true,
        })) as RunItem[],
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load object workflow history.",
      );
    } finally {
      setObjectHistoryLoading(false);
    }
  }

  async function createWorkflow() {
    if (!createName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          primaryObjectType: createObject,
          template: createTemplate,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not create workflow.");
      setWorkflows((items) => [summary(data), ...items]);
      setCreateOpen(false);
      setCreateName("");
      setCreateTemplate("blank");
      await loadDetail(data.id);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create workflow.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function duplicateCurrentWorkflow() {
    if (!detail || demo || user.role !== "admin") return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/workflows/${detail.id}/duplicate`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not duplicate workflow.");
      setWorkflows((items) => [summary(data), ...items]);
      await loadDetail(data.id);
      setMessage("Workflow duplicated as a new draft");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not duplicate workflow.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function archiveCurrentWorkflow() {
    if (!detail || !editable) return;
    if (
      !window.confirm(
        `Archive “${detail.name}”? Its versions and run history will be retained.`,
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/workflows/${detail.id}/archive`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not archive workflow.");
      const remaining = workflows.filter(
        (workflow) => workflow.id !== detail.id,
      );
      setWorkflows(remaining);
      replaceDetail(null);
      setSelectedNodeId(null);
      if (remaining[0]) await loadDetail(remaining[0].id);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not archive workflow.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function restoreVersion(versionId: string) {
    if (!detail || !editable) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/workflows/${detail.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, revision: detail.revision }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not restore version.");
      replaceDetail(data);
      setDirty(false);
      setMode("build");
      setSelectedNodeId(data.draft.graph.entryNodeIds[0] || null);
      setMessage("Version restored as a new draft");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not restore version.",
      );
    } finally {
      setSaving(false);
    }
  }

  const library = workflowNodeDefinitions.filter((definition) => {
    const query = librarySearch.trim().toLocaleLowerCase();
    return (
      (addingTrigger
        ? definition.kind === "trigger"
        : definition.kind !== "trigger") &&
      !definition.systemControlled &&
      definition.type !== "control.end" &&
      (!query ||
        definition.name.toLocaleLowerCase().includes(query) ||
        definition.description.toLocaleLowerCase().includes(query) ||
        definition.category.toLocaleLowerCase().includes(query))
    );
  });
  const selectedSchedule =
    selectedNode?.type === "trigger.schedule"
      ? ((selectedNode.config.schedule || {
          mode: "once",
          at: "",
        }) as Record<string, unknown>)
      : null;
  const selectedScheduleMode =
    selectedSchedule?.mode === "interval" ? "interval" : "once";

  return (
    <section className="workflow-studio-shell">
      <header className="workflow-studio-heading">
        <div>
          <span className="eyebrow">WORKSPACE LOGIC</span>
          <h1>
            Automation<span className="heading-dot">.</span>
          </h1>
          <p>
            Build decision trees around Contacts, Leads, Quotes, Projects, and
            Items.
          </p>
        </div>
        <div className="workflow-studio-actions">
          {detail?.systemControlled && (
            <span className="workflow-policy-badge">
              <ShieldCheck size={15} /> System controlled
            </span>
          )}
          {editable && (
            <>
              <button
                type="button"
                className="button secondary"
                disabled={!dirty || saving}
                onClick={() => void saveDraft()}
              >
                {saving ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Save size={15} />
                )}
                Save draft
              </button>
              <button
                type="button"
                className="button primary"
                disabled={
                  publishing ||
                  validation.some((issue) => issue.severity === "error")
                }
                onClick={() => void publish()}
              >
                {publishing ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Play size={15} />
                )}
                Publish
              </button>
            </>
          )}
          {!demo && detail && user.role === "admin" && (
            <button
              type="button"
              className="button secondary"
              disabled={saving}
              onClick={() => void duplicateCurrentWorkflow()}
            >
              <Copy size={15} /> Duplicate
            </button>
          )}
          {editable && (
            <button
              type="button"
              className="button secondary"
              disabled={saving}
              onClick={() => void archiveCurrentWorkflow()}
            >
              <Archive size={15} /> Archive
            </button>
          )}
        </div>
      </header>

      {(error || message) && (
        <div
          className={`workflow-studio-notice ${error ? "is-error" : "is-success"}`}
        >
          {error ? <AlertCircle size={16} /> : <Check size={16} />}
          <span>{error || message}</span>
          <button
            type="button"
            onClick={() => (error ? setError("") : setMessage(""))}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="workflow-studio">
        <aside className="workflow-studio-nav" aria-label="Workflows">
          <div className="workflow-nav-title">
            <div>
              <span>Workflows</span>
              <strong>{workflows.length}</strong>
            </div>
            {!demo && user.role === "admin" && (
              <button
                type="button"
                aria-label="Create workflow"
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={16} />
              </button>
            )}
          </div>
          <label className="workflow-search">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search workflows"
            />
          </label>
          <div className="workflow-status-filter">
            {(["all", "published", "draft"] as const).map((status) => (
              <button
                type="button"
                className={statusFilter === status ? "is-active" : ""}
                onClick={() => setStatusFilter(status)}
                key={status}
              >
                {status === "all" ? "All" : status}
              </button>
            ))}
          </div>
          {workflowFolders.length > 0 && (
            <label className="workflow-folder-filter">
              <span>Folder</span>
              <select
                value={folderFilter}
                onChange={(event) => setFolderFilter(event.target.value)}
              >
                <option value="all">All folders</option>
                {workflowFolders.map((folder) => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="workflow-list">
            {visibleWorkflows.map((workflow) => (
              <button
                type="button"
                className={`workflow-list-item ${detail?.id === workflow.id ? "is-selected" : ""}`}
                onClick={() => void loadDetail(workflow.id)}
                key={workflow.id}
              >
                <span className="workflow-list-icon">
                  {workflow.systemControlled ? (
                    <ShieldCheck size={17} />
                  ) : (
                    <Workflow size={17} />
                  )}
                </span>
                <span>
                  <strong>{workflow.name}</strong>
                  <small>
                    {workflow.folder || workflow.primaryObjectType} ·{" "}
                    {workflow.status}
                  </small>
                </span>
                <i className={`is-${workflow.status}`} />
              </button>
            ))}
          </div>
        </aside>

        <main className="workflow-studio-main">
          {loading || !detail ? (
            <div className="workflow-studio-loading">
              <LoaderCircle className="spin" size={22} /> Loading workflow…
            </div>
          ) : (
            <>
              <div className="workflow-canvas-bar">
                <div>
                  <span>{detail.folder || "Workflow"}</span>
                  <strong>{detail.name}</strong>
                  <small>
                    {detail.status === "published"
                      ? `Published v${detail.publishedVersionNumber}`
                      : "Draft only"}
                    {dirty ? " · Unsaved changes" : ""}
                  </small>
                </div>
                <nav aria-label="Workflow views">
                  {editable && mode === "build" && (
                    <>
                      <button
                        type="button"
                        disabled={!undoStack.length}
                        onClick={undoDraftChange}
                        aria-label="Undo workflow change"
                      >
                        <ArrowLeft size={14} /> Undo
                      </button>
                      <button
                        type="button"
                        disabled={!redoStack.length}
                        onClick={redoDraftChange}
                        aria-label="Redo workflow change"
                      >
                        <ArrowRight size={14} /> Redo
                      </button>
                    </>
                  )}
                  {editable && mode === "build" && (
                    <button
                      type="button"
                      onClick={() => {
                        setAddingTrigger(true);
                        setInsertion(null);
                        setLibrarySearch("");
                      }}
                    >
                      <Plus size={14} /> Trigger
                    </button>
                  )}
                  <button
                    type="button"
                    className={mode === "build" ? "is-active" : ""}
                    onClick={() => void loadMode("build")}
                  >
                    <Workflow size={14} /> Build
                  </button>
                  <button
                    type="button"
                    className={mode === "test" ? "is-active" : ""}
                    onClick={runTest}
                  >
                    <FlaskConical size={14} /> Test
                  </button>
                  <button
                    type="button"
                    className={mode === "versions" ? "is-active" : ""}
                    onClick={() => void loadMode("versions")}
                  >
                    <History size={14} /> Versions
                  </button>
                  <button
                    type="button"
                    className={mode === "runs" ? "is-active" : ""}
                    onClick={() => void loadMode("runs")}
                  >
                    <Clock3 size={14} /> Runs
                  </button>
                </nav>
              </div>

              {mode === "build" && (
                <div className="workflow-canvas">
                  {validation.length > 0 && (
                    <details
                      className="workflow-publish-validation"
                      open={validation.some(
                        (issue) => issue.severity === "error",
                      )}
                    >
                      <summary>
                        <AlertCircle size={15} />
                        <span>
                          Publish check ·{" "}
                          {
                            validation.filter(
                              (issue) => issue.severity === "error",
                            ).length
                          }{" "}
                          errors ·{" "}
                          {
                            validation.filter(
                              (issue) => issue.severity === "warning",
                            ).length
                          }{" "}
                          warnings
                        </span>
                      </summary>
                      <div>
                        {validation.map((issue, index) => (
                          <button
                            type="button"
                            className={`is-${issue.severity}`}
                            key={`${issue.code}-${issue.nodeId || "workflow"}-${index}`}
                            onClick={() =>
                              issue.nodeId && setSelectedNodeId(issue.nodeId)
                            }
                          >
                            <strong>{issue.severity}</strong>
                            <span>{issue.message}</span>
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                  {detail.systemControlled && (
                    <section className="workflow-system-policy-note">
                      <ShieldCheck size={18} />
                      <div>
                        <span>BEFORE ANY CONTACT TEXT</span>
                        <h2>Check the website consent category</h2>
                        <p>
                          Appointment and project messages require appointment
                          consent; promotions require marketing consent. A new
                          lead form cannot override it.
                        </p>
                      </div>
                    </section>
                  )}
                  <div
                    className="workflow-tree-tools"
                    aria-label="Workflow zoom controls"
                  >
                    <button
                      type="button"
                      onClick={() => adjustTreeZoom(-TREE_ZOOM_STEP)}
                      aria-label="Zoom out"
                    >
                      <ZoomOut size={15} />
                    </button>
                    <span aria-live="polite">{Math.round(treeZoom * 100)}%</span>
                    <button
                      type="button"
                      onClick={() => adjustTreeZoom(TREE_ZOOM_STEP)}
                      aria-label="Zoom in"
                    >
                      <ZoomIn size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => fitWorkflow()}
                    >
                      <Maximize2 size={14} /> Fit workflow
                    </button>
                  </div>
                  <div
                    className="workflow-tree-viewport"
                    ref={treeViewportRef}
                    onWheel={(event) => {
                      if (!event.ctrlKey && !event.metaKey) return;
                      event.preventDefault();
                      adjustTreeZoom(
                        event.deltaY > 0
                          ? -TREE_ZOOM_STEP
                          : TREE_ZOOM_STEP,
                      );
                    }}
                    aria-label="Workflow canvas. Hold Control and scroll to zoom."
                  >
                    <div
                      className="workflow-tree-surface"
                      ref={treeSurfaceRef}
                      style={{ transform: `scale(${treeZoom})` }}
                    >
                      <WorkflowTree
                        definition={detail.draft}
                        selectedNodeId={selectedNodeId}
                        editable={editable}
                        onSelect={setSelectedNodeId}
                        onInsert={setInsertion}
                        onMove={moveNodeBefore}
                      />
                    </div>
                  </div>
                  {detail.draft.graph.nodes.length >= 15 && (
                    <WorkflowMiniMap
                      definition={detail.draft}
                      selectedNodeId={selectedNodeId}
                    />
                  )}
                </div>
              )}

              {mode === "test" && (
                <div className="workflow-test-view">
                  <div className="workflow-mode-intro">
                    <div>
                      <span>DRY RUN</span>
                      <h2>No messages or records will be sent</h2>
                      <p>
                        Test the current draft with a realistic event and
                        inspect every decision.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={runTest}
                    >
                      <RefreshCw size={15} /> Run again
                    </button>
                  </div>
                  {testEvent && (
                    <section className="workflow-test-fixture">
                      <div className="workflow-inspector-section-title">
                        <span>TEST INPUT</span>
                        <small>Dry run only</small>
                      </div>
                      <p>
                        Use a captured event, a real workspace object, or a
                        fixture you build manually. Nothing here sends a
                        message, changes a record, or calls a webhook.
                      </p>
                      <label className="workflow-field">
                        <span>Fixture source</span>
                        <select
                          aria-label="Test fixture source"
                          value={testFixtureSource}
                          onChange={(event) => {
                            const source = event.target
                              .value as TestFixtureSource;
                            setTestFixtureSource(source);
                            setSimulation(null);
                            if (source === "recent" && !recentTestEvents.length)
                              void loadRecentTestEvents();
                            if (source === "object" && !testObjects.length)
                              void loadTestObjects(testObjectType);
                          }}
                        >
                          <option value="manual">Build a manual fixture</option>
                          <option value="recent" disabled={demo}>
                            Use a recent captured event
                          </option>
                          <option value="object" disabled={demo}>
                            Use a real workspace object
                          </option>
                        </select>
                      </label>
                      {testFixtureSource === "recent" && (
                        <label className="workflow-field">
                          <span>Recent event</span>
                          <select
                            value={selectedTestEventId}
                            disabled={
                              testFixtureLoading || !recentTestEvents.length
                            }
                            onChange={(event) =>
                              setSelectedTestEventId(event.target.value)
                            }
                          >
                            {!recentTestEvents.length && (
                              <option value="">No captured events</option>
                            )}
                            {recentTestEvents.map((event) => (
                              <option key={event.id} value={event.id}>
                                {event.label} · {event.type} ·{" "}
                                {new Date(event.occurredAt).toLocaleString()}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {testFixtureSource === "object" && (
                        <div className="workflow-setting-pair">
                          <label className="workflow-field">
                            <span>Object type</span>
                            <select
                              value={testObjectType}
                              disabled={testFixtureLoading}
                              onChange={(event) => {
                                const objectType = event.target
                                  .value as typeof testObjectType;
                                setTestObjectType(objectType);
                                void loadTestObjects(objectType);
                              }}
                            >
                              {(
                                [
                                  "contact",
                                  "lead",
                                  "quote",
                                  "project",
                                  "item",
                                ] as const
                              ).map((objectType) => (
                                <option key={objectType} value={objectType}>
                                  {objectType[0].toUpperCase() +
                                    objectType.slice(1)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="workflow-field">
                            <span>Workspace object</span>
                            <select
                              value={selectedTestObjectId}
                              disabled={
                                testFixtureLoading || !testObjects.length
                              }
                              onChange={(event) =>
                                setSelectedTestObjectId(event.target.value)
                              }
                            >
                              {!testObjects.length && (
                                <option value="">No objects found</option>
                              )}
                              {testObjects.map((object) => (
                                <option key={object.id} value={object.id}>
                                  {object.label} · {object.id}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}
                      {testFixtureSource === "manual" && (
                        <>
                          <div className="workflow-setting-pair">
                            <label className="workflow-field">
                              <span>Event type</span>
                              <select
                                value={testEvent.type}
                                onChange={(event) =>
                                  setTestEvent({
                                    ...testEvent,
                                    type: event.target
                                      .value as WorkflowEvent["type"],
                                  })
                                }
                              >
                                {workflowEventTypes.map((type) => (
                                  <option value={type} key={type}>
                                    {type}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="workflow-field">
                              <span>Primary object</span>
                              <select
                                value={testEvent.objectType}
                                onChange={(event) =>
                                  setTestEvent({
                                    ...testEvent,
                                    objectType: event.target
                                      .value as WorkflowEvent["objectType"],
                                  })
                                }
                              >
                                {workflowObjectTypes.map((type) => (
                                  <option value={type} key={type}>
                                    {type}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <label className="workflow-field">
                            <span>Object ID</span>
                            <input
                              value={testEvent.objectId}
                              onChange={(event) =>
                                setTestEvent({
                                  ...testEvent,
                                  objectId: event.target.value,
                                })
                              }
                            />
                          </label>
                          <JsonEditor
                            key={`fixture-${detail.id}`}
                            label="Event payload"
                            value={testEvent.payload}
                            disabled={false}
                            onChange={(payload) => {
                              if (
                                payload &&
                                typeof payload === "object" &&
                                !Array.isArray(payload)
                              )
                                setTestEvent({
                                  ...testEvent,
                                  payload: payload as Record<string, unknown>,
                                });
                            }}
                          />
                          <details className="workflow-advanced-editor">
                            <summary>Related object context</summary>
                            <JsonEditor
                              key={`fixture-context-${detail.id}`}
                              label="Context"
                              value={testContext}
                              disabled={false}
                              onChange={(context) => {
                                if (
                                  context &&
                                  typeof context === "object" &&
                                  !Array.isArray(context)
                                )
                                  setTestContext(
                                    context as Record<string, unknown>,
                                  );
                              }}
                            />
                          </details>
                        </>
                      )}
                      <button
                        type="button"
                        className="button"
                        disabled={
                          testFixtureLoading ||
                          (testFixtureSource === "recent" &&
                            !selectedTestEventId) ||
                          (testFixtureSource === "object" &&
                            !selectedTestObjectId)
                        }
                        onClick={() =>
                          testFixtureSource === "manual"
                            ? runTest()
                            : void applyStoredTestFixture()
                        }
                      >
                        {testFixtureLoading ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : (
                          <Play size={15} />
                        )}
                        {testFixtureLoading
                          ? "Loading fixture…"
                          : "Run dry test"}
                      </button>
                    </section>
                  )}
                  {simulation?.steps.map((step) => (
                    <article
                      className={`workflow-trace-step is-${step.status}`}
                      key={`${step.sequence}-${step.nodeId}`}
                    >
                      <span>{step.sequence}</span>
                      <div>
                        <small>{step.status.toUpperCase()}</small>
                        <strong>{step.name}</strong>
                        <p>{step.summary}</p>
                        {step.conditions?.map((condition, index) => (
                          <code key={index}>{condition.reason}</code>
                        ))}
                        {step.preview && (
                          <pre>{JSON.stringify(step.preview, null, 2)}</pre>
                        )}
                        {!demo &&
                          user.role === "admin" &&
                          step.status === "planned" &&
                          workflowNodeDefinition(step.nodeType)?.connection && (
                            <button
                              type="button"
                              className="button secondary workflow-test-external"
                              onClick={() => {
                                setExternalTestNodeId(step.nodeId);
                                setExternalTestConfirmed(false);
                              }}
                            >
                              Test only this external action
                            </button>
                          )}
                      </div>
                    </article>
                  ))}
                  {externalTestNodeId && (
                    <section
                      className="workflow-external-confirmation"
                      role="alertdialog"
                      aria-labelledby="external-test-title"
                    >
                      <div>
                        <span>LIVE EXTERNAL TEST</span>
                        <h3 id="external-test-title">
                          {detail.draft.graph.nodes.find(
                            (node) => node.id === externalTestNodeId,
                          )?.name || "External action"}
                        </h3>
                        <p>
                          This is not a dry run. It will execute this one action
                          and may send a real email, text, team notification, or
                          webhook. No other workflow step will run.
                        </p>
                      </div>
                      <label className="workflow-setting-toggle">
                        <input
                          type="checkbox"
                          checked={externalTestConfirmed}
                          disabled={externalTestLoading}
                          onChange={(event) =>
                            setExternalTestConfirmed(event.target.checked)
                          }
                        />
                        <span>
                          <strong>
                            I understand this action reaches an external service
                          </strong>
                          <small>
                            SMS consent and Do Not Disturb rules still apply.
                          </small>
                        </span>
                      </label>
                      <div className="workflow-external-confirmation-actions">
                        <button
                          type="button"
                          className="button"
                          disabled={externalTestLoading}
                          onClick={() => {
                            setExternalTestNodeId("");
                            setExternalTestConfirmed(false);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="button primary"
                          disabled={
                            !externalTestConfirmed || externalTestLoading
                          }
                          onClick={() => void runExternalActionTest()}
                        >
                          {externalTestLoading ? (
                            <LoaderCircle className="spin" size={14} />
                          ) : (
                            <Play size={14} />
                          )}
                          {externalTestLoading
                            ? "Running…"
                            : "Run this one action"}
                        </button>
                      </div>
                    </section>
                  )}
                </div>
              )}

              {mode === "versions" && (
                <div className="workflow-history-view">
                  <div className="workflow-mode-intro">
                    <div>
                      <span>VERSION HISTORY</span>
                      <h2>Published builds and saved drafts</h2>
                      <p>
                        Live runs stay pinned to the version they started with.
                      </p>
                    </div>
                  </div>
                  {draftComparison && (
                    <section className="workflow-version-compare">
                      <span>DRAFT COMPARED WITH PUBLISHED</span>
                      <strong>
                        {draftComparison.added} added ·{" "}
                        {draftComparison.changed} changed ·{" "}
                        {draftComparison.removed} removed
                      </strong>
                      <small>
                        {draftComparison.settingsChanged
                          ? "Workflow settings also changed."
                          : "Workflow settings match the published version."}
                      </small>
                    </section>
                  )}
                  {sideLoading ? (
                    <div className="workflow-studio-loading">
                      <LoaderCircle className="spin" size={20} /> Loading
                      versions…
                    </div>
                  ) : demo ? (
                    <p className="workflow-empty-mode">
                      Version history is available in a signed-in workspace.
                    </p>
                  ) : (
                    versions.map((version) => (
                      <article
                        className="workflow-version-row"
                        key={version.id}
                      >
                        <span className={`is-${version.state}`}>
                          v{version.number}
                        </span>
                        <div>
                          <strong>
                            {version.state === "published"
                              ? "Published"
                              : version.state === "legacy"
                                ? "Legacy version"
                                : "Saved draft"}
                          </strong>
                          <p>{version.changeNote || "No change note"}</p>
                          <small>
                            Edited by {version.createdByName || "System"}
                          </small>
                        </div>
                        <time>
                          {new Date(version.createdAt).toLocaleString()}
                        </time>
                        {editable && version.state !== "legacy" && (
                          <button
                            type="button"
                            onClick={() => void restoreVersion(version.id)}
                          >
                            <RefreshCw size={13} /> Restore as draft
                          </button>
                        )}
                      </article>
                    ))
                  )}
                </div>
              )}

              {mode === "runs" && (
                <div className="workflow-runs-view">
                  <div className="workflow-mode-intro">
                    <div>
                      <span>EXECUTION HISTORY</span>
                      <h2>Every object and action is traceable</h2>
                      <p>
                        Open a run to see its version, path, skips, retries, and
                        errors.
                      </p>
                    </div>
                  </div>
                  <section
                    className="workflow-object-history-search"
                    aria-label="Object workflow history"
                  >
                    <div>
                      <span>OBJECT HISTORY</span>
                      <strong>Find every workflow run for one record</strong>
                    </div>
                    <label className="workflow-field">
                      <span>Object type</span>
                      <select
                        value={objectHistoryType}
                        disabled={demo || objectHistoryLoading}
                        onChange={(event) => {
                          setObjectHistoryType(
                            event.target.value as WorkflowObjectType,
                          );
                          setObjectHistoryRuns(null);
                        }}
                      >
                        {workflowObjectTypes.map((objectType) => (
                          <option key={objectType} value={objectType}>
                            {objectType}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="workflow-field">
                      <span>Object ID</span>
                      <input
                        value={objectHistoryId}
                        disabled={demo || objectHistoryLoading}
                        placeholder="Paste a Contact, Lead, Quote, Project, or Item ID"
                        onChange={(event) => {
                          setObjectHistoryId(event.target.value);
                          setObjectHistoryRuns(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void loadObjectHistory();
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={
                        demo || objectHistoryLoading || !objectHistoryId.trim()
                      }
                      onClick={() => void loadObjectHistory()}
                    >
                      {objectHistoryLoading ? (
                        <LoaderCircle className="spin" size={14} />
                      ) : (
                        <Search size={14} />
                      )}
                      {objectHistoryLoading ? "Loading…" : "Find runs"}
                    </button>
                    {objectHistoryRuns && (
                      <button
                        type="button"
                        className="button"
                        onClick={() => {
                          setObjectHistoryRuns(null);
                          setObjectHistoryId("");
                        }}
                      >
                        Show this workflow
                      </button>
                    )}
                  </section>
                  {sideLoading ? (
                    <div className="workflow-studio-loading">
                      <LoaderCircle className="spin" size={20} /> Loading runs…
                    </div>
                  ) : demo ? (
                    leads.slice(0, 4).map((lead) => (
                      <article className="workflow-run-row" key={lead.id}>
                        <span className="is-completed">
                          <Check size={14} />
                        </span>
                        <div>
                          <strong>{lead.name}</strong>
                          <p>{lead.project}</p>
                        </div>
                        <time>
                          {new Date(lead.submittedAt).toLocaleDateString()}
                        </time>
                      </article>
                    ))
                  ) : (objectHistoryRuns || runs).length ? (
                    (objectHistoryRuns || runs).map((run) => (
                      <details className="workflow-run-row" key={run.id}>
                        <summary>
                          <span className={`is-${run.status}`}>
                            {run.status === "completed" ? (
                              <Check size={14} />
                            ) : (
                              <MoreHorizontal size={14} />
                            )}
                          </span>
                          <div>
                            <strong>
                              {String(
                                run.workflowName ||
                                  run.summary.subject ||
                                  run.objectType,
                              )}
                            </strong>
                            <p>{String(run.summary.project || run.objectId)}</p>
                          </div>
                          <time>
                            {new Date(run.startedAt).toLocaleString()}
                          </time>
                        </summary>
                        <div className="workflow-run-detail">
                          <dl>
                            <div>
                              <dt>Workflow version</dt>
                              <dd>{run.versionId || "Legacy"}</dd>
                            </div>
                            <div>
                              <dt>Enrollment object</dt>
                              <dd>
                                {workflowObjectHref(
                                  run.objectType,
                                  run.objectId,
                                  demo,
                                ) ? (
                                  <a
                                    href={workflowObjectHref(
                                      run.objectType,
                                      run.objectId,
                                      demo,
                                    )}
                                  >
                                    Open {run.objectType} · {run.objectId}
                                  </a>
                                ) : (
                                  <>
                                    {run.objectType} · {run.objectId}
                                  </>
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>Triggering event</dt>
                              <dd>
                                {run.triggerEvent
                                  ? `${run.triggerEvent.type} · ${new Date(run.triggerEvent.occurredAt).toLocaleString()}`
                                  : run.eventId || "Legacy run"}
                              </dd>
                            </div>
                            <div>
                              <dt>Duration</dt>
                              <dd>
                                {run.completedAt
                                  ? `${Math.max(0, new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime())} ms`
                                  : "In progress"}
                              </dd>
                            </div>
                          </dl>
                          {run.triggerEvent && (
                            <details className="workflow-run-snapshots">
                              <summary>Trigger actor and safe payload</summary>
                              <pre>
                                {JSON.stringify(
                                  {
                                    actor: run.triggerEvent.actor,
                                    payload: run.triggerEvent.payload,
                                  },
                                  null,
                                  2,
                                )}
                              </pre>
                            </details>
                          )}
                          {run.status === "needs_attention" && editable && (
                            <button
                              type="button"
                              className="button secondary"
                              disabled={retryingRunId === run.id}
                              onClick={() => void retryRun(run.id)}
                            >
                              <RefreshCw size={14} />
                              {retryingRunId === run.id
                                ? "Retrying…"
                                : "Retry failed action"}
                            </button>
                          )}
                          <div className="workflow-run-path">
                            {run.steps.map((step, index) => {
                              const snapshot = (step.output_snapshot ||
                                {}) as Record<string, unknown>;
                              const output = (snapshot.output || {}) as Record<
                                string,
                                unknown
                              >;
                              const branches = Array.isArray(output.branches)
                                ? (output.branches as Array<
                                    Record<string, unknown>
                                  >)
                                : [];
                              const affectedObject =
                                affectedObjectFromStep(step);
                              return (
                                <article
                                  key={String(step.id || `${run.id}-${index}`)}
                                >
                                  <span>{index + 1}</span>
                                  <div>
                                    <small>
                                      {String(step.status || "unknown")}
                                    </small>
                                    <strong>
                                      {String(
                                        step.node_type ||
                                          step.label ||
                                          step.key ||
                                          "Workflow step",
                                      )}
                                    </strong>
                                    <p>
                                      {String(
                                        snapshot.summary ||
                                          step.error_detail ||
                                          step.detail ||
                                          "Recorded",
                                      )}
                                    </p>
                                    {affectedObject && (
                                      <a
                                        className="workflow-run-object-link"
                                        href={workflowObjectHref(
                                          affectedObject.objectType,
                                          affectedObject.id,
                                          demo,
                                        )}
                                      >
                                        Open affected{" "}
                                        {affectedObject.objectType}
                                        <ArrowRight size={11} />
                                      </a>
                                    )}
                                    {branches.length > 0 && (
                                      <ul className="workflow-run-branches">
                                        {branches.map((branch, branchIndex) => (
                                          <li
                                            className={
                                              branch.selected
                                                ? "is-selected"
                                                : "is-skipped"
                                            }
                                            key={String(
                                              branch.edgeId ||
                                                `${step.id}-${branchIndex}`,
                                            )}
                                          >
                                            <strong>
                                              {String(branch.label || "Branch")}
                                            </strong>
                                            <span>
                                              {branch.selected
                                                ? "Selected"
                                                : "Skipped"}
                                            </span>
                                            <small>
                                              {String(
                                                branch.reason ||
                                                  "No reason recorded",
                                              )}
                                            </small>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                    {Number(step.attempt || 1) > 1 && (
                                      <small>
                                        Attempt {String(step.attempt)}
                                      </small>
                                    )}
                                    {Boolean(step.error_code) && (
                                      <small>
                                        Error {String(step.error_code)} ·{" "}
                                        {String(
                                          step.error_detail ||
                                            "No additional detail",
                                        )}
                                      </small>
                                    )}
                                    {Boolean(step.next_attempt_at) && (
                                      <small>
                                        Next retry{" "}
                                        {new Date(
                                          String(step.next_attempt_at),
                                        ).toLocaleString()}
                                      </small>
                                    )}
                                    {!run.legacy &&
                                      (Boolean(step.input_snapshot) ||
                                        Boolean(step.output_snapshot)) && (
                                        <details className="workflow-run-snapshots">
                                          <summary>
                                            Safe input and output
                                          </summary>
                                          <pre>
                                            {JSON.stringify(
                                              {
                                                input:
                                                  step.input_snapshot || {},
                                                output:
                                                  step.output_snapshot || {},
                                              },
                                              null,
                                              2,
                                            )}
                                          </pre>
                                        </details>
                                      )}
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                          {run.waits.length > 0 && (
                            <div className="workflow-run-waits">
                              <strong>Durable waits</strong>
                              {run.waits.map((wait) => (
                                <p key={String(wait.id)}>
                                  {String(wait.status)} · {String(wait.mode)}
                                  {wait.wake_at
                                    ? ` · resumes ${new Date(String(wait.wake_at)).toLocaleString()}`
                                    : ""}
                                  {wait.awaited_event_type
                                    ? ` · waiting for ${String(wait.awaited_event_type)}`
                                    : ""}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </details>
                    ))
                  ) : (
                    <p className="workflow-empty-mode">
                      {objectHistoryRuns
                        ? "No workflow runs were recorded for this object."
                        : "No runs have been recorded yet."}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </main>

        {detail && mode === "build" && (
          <aside className="workflow-inspector" aria-label="Workflow inspector">
            <div className="workflow-inspector-title">
              <div>
                <span>{selectedNode ? "SELECTED STEP" : "WORKFLOW"}</span>
                <strong>{selectedNode?.name || detail.name}</strong>
              </div>
              <button
                type="button"
                aria-label="Workflow settings"
                className={!selectedNode ? "is-active" : ""}
                onClick={() => setSelectedNodeId(null)}
              >
                <Settings2 size={17} />
              </button>
            </div>
            <label className="workflow-field">
              <span>Workflow name</span>
              <input
                value={detail.name}
                disabled={!editable}
                aria-label="Workflow name"
                onChange={(event) => {
                  replaceDetail({ ...detail, name: event.target.value });
                  setDirty(true);
                }}
              />
            </label>
            {!selectedNode && (
              <label className="workflow-field">
                <span>Description</span>
                <textarea
                  value={detail.description}
                  disabled={!editable}
                  onChange={(event) => {
                    replaceDetail({
                      ...detail,
                      description: event.target.value,
                    });
                    setDirty(true);
                  }}
                />
              </label>
            )}
            {selectedNode ? (
              <>
                <label className="workflow-field">
                  <span>Step name</span>
                  <input
                    value={selectedNode.name}
                    disabled={
                      !editable || selectedNode.type.startsWith("system.")
                    }
                    onChange={(event) =>
                      updateNode({ name: event.target.value })
                    }
                  />
                </label>
                <div className="workflow-inspector-type">
                  <span>
                    {workflowNodeDefinition(selectedNode.type)?.category}
                  </span>
                  <strong>
                    {workflowNodeDefinition(selectedNode.type)?.name}
                  </strong>
                  <p>
                    {workflowNodeDefinition(selectedNode.type)?.description}
                  </p>
                </div>
                {selectedSchedule && (
                  <div className="workflow-schedule-editor">
                    <label className="workflow-field">
                      <span>Schedule type</span>
                      <select
                        value={selectedScheduleMode}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              schedule:
                                event.target.value === "interval"
                                  ? {
                                      mode: "interval",
                                      amount: 1,
                                      unit: "days",
                                      startAt: nextWorkflowHourIso(),
                                    }
                                  : {
                                      mode: "once",
                                      at: nextWorkflowHourIso(),
                                    },
                            },
                          })
                        }
                      >
                        <option value="once">One time</option>
                        <option value="interval">Repeating interval</option>
                      </select>
                    </label>
                    <label className="workflow-field">
                      <span>
                        {selectedScheduleMode === "once"
                          ? "Run at"
                          : "Start at"}
                      </span>
                      <input
                        type="datetime-local"
                        value={toDateTimeLocal(
                          selectedScheduleMode === "once"
                            ? selectedSchedule.at
                            : selectedSchedule.startAt,
                        )}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              schedule: {
                                ...selectedSchedule,
                                [selectedScheduleMode === "once"
                                  ? "at"
                                  : "startAt"]: fromDateTimeLocal(
                                  event.target.value,
                                ),
                              },
                            },
                          })
                        }
                      />
                    </label>
                    {selectedScheduleMode === "interval" && (
                      <div className="workflow-schedule-interval">
                        <label className="workflow-field">
                          <span>Every</span>
                          <input
                            type="number"
                            min={1}
                            value={Number(selectedSchedule.amount || 1)}
                            disabled={!editable}
                            onChange={(event) =>
                              updateNode({
                                config: {
                                  ...selectedNode.config,
                                  schedule: {
                                    ...selectedSchedule,
                                    amount: Math.max(
                                      1,
                                      Number(event.target.value) || 1,
                                    ),
                                  },
                                },
                              })
                            }
                          />
                        </label>
                        <label className="workflow-field">
                          <span>Unit</span>
                          <select
                            value={String(selectedSchedule.unit || "days")}
                            disabled={!editable}
                            onChange={(event) =>
                              updateNode({
                                config: {
                                  ...selectedNode.config,
                                  schedule: {
                                    ...selectedSchedule,
                                    unit: event.target.value,
                                  },
                                },
                              })
                            }
                          >
                            <option value="minutes">Minutes</option>
                            <option value="hours">Hours</option>
                            <option value="days">Days</option>
                          </select>
                        </label>
                      </div>
                    )}
                    <p className="workflow-condition-help">
                      Runs are claimed by the durable workflow scheduler.
                      Publishing a new version does not change runs already
                      queued by an older version.
                    </p>
                  </div>
                )}
                {selectedNode.type === "trigger.inboundWebhook" && (
                  <div className="workflow-schedule-editor">
                    <div className="workflow-inspector-section-title">
                      <span>Secure webhook URL</span>
                      {webhookConfigured && <small>Configured</small>}
                    </div>
                    <p className="workflow-condition-help">
                      Send JSON with a unique <code>Idempotency-Key</code>{" "}
                      header. The secret URL is shown only when generated or
                      rotated.
                    </p>
                    {webhookUrl && (
                      <label className="workflow-field">
                        <span>Copy this URL now</span>
                        <input
                          value={webhookUrl}
                          readOnly
                          onFocus={(event) => event.currentTarget.select()}
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      className="button secondary"
                      disabled={!editable || webhookLoading || demo}
                      onClick={async () => {
                        if (!detail) return;
                        setWebhookLoading(true);
                        setError("");
                        try {
                          const response = await fetch(
                            `/api/workflows/${detail.id}/webhook-token`,
                            { method: "POST" },
                          );
                          const data = await response.json();
                          if (!response.ok)
                            throw new Error(
                              data.error || "Could not rotate webhook URL.",
                            );
                          setWebhookState({
                            workflowId: detail.id,
                            configured: true,
                            url: data.url,
                          });
                        } catch (reason) {
                          setError(
                            reason instanceof Error
                              ? reason.message
                              : "Could not rotate webhook URL.",
                          );
                        } finally {
                          setWebhookLoading(false);
                        }
                      }}
                    >
                      {webhookLoading
                        ? "Generating…"
                        : webhookConfigured
                          ? "Rotate secret URL"
                          : "Generate secret URL"}
                    </button>
                  </div>
                )}
                {selectedNode.type === "logic.wait" &&
                  (() => {
                    const config = selectedNode.config;
                    const waitMode = String(config.mode || "duration");
                    const replaceWait = (next: Record<string, unknown>) =>
                      // This helper is only invoked by the form event handlers below.
                      // eslint-disable-next-line react-hooks/refs
                      updateNode({ config: next });
                    const timeoutFields = (includePoll = false) => (
                      <>
                        <label className="workflow-field">
                          <span>Timeout (seconds, optional)</span>
                          <input
                            type="number"
                            min={1}
                            value={
                              config.timeoutSeconds == null
                                ? ""
                                : Number(config.timeoutSeconds)
                            }
                            disabled={!editable}
                            placeholder="No timeout"
                            onChange={(event) => {
                              const value = event.target.value;
                              updateNode({
                                config: {
                                  ...config,
                                  ...(value
                                    ? {
                                        timeoutSeconds: Math.max(
                                          1,
                                          Number(value) || 1,
                                        ),
                                      }
                                    : {}),
                                  ...(!value
                                    ? { timeoutSeconds: undefined }
                                    : {}),
                                },
                              });
                            }}
                          />
                        </label>
                        {includePoll && (
                          <label className="workflow-field">
                            <span>Check every (seconds)</span>
                            <input
                              type="number"
                              min={60}
                              value={Number(config.pollSeconds || 900)}
                              disabled={!editable}
                              onChange={(event) =>
                                updateNode({
                                  config: {
                                    ...config,
                                    pollSeconds: Math.max(
                                      60,
                                      Number(event.target.value) || 60,
                                    ),
                                  },
                                })
                              }
                            />
                          </label>
                        )}
                        <label className="workflow-field">
                          <span>If the timeout is reached</span>
                          <select
                            value={String(config.timeoutBehavior || "continue")}
                            disabled={!editable}
                            onChange={(event) =>
                              updateNode({
                                config: {
                                  ...config,
                                  timeoutBehavior: event.target.value,
                                },
                              })
                            }
                          >
                            <option value="continue">
                              Continue to the next step
                            </option>
                            <option value="exit">
                              End this workflow branch
                            </option>
                          </select>
                        </label>
                      </>
                    );
                    const dateOperand = (key: "timestamp" | "date") => {
                      const operand = (config[key] || {
                        kind: "literal",
                        value: new Date(Date.now() + 86_400_000).toISOString(),
                      }) as { kind?: string; value?: unknown; path?: string };
                      const source =
                        operand.kind === "reference" ? "reference" : "literal";
                      return (
                        <>
                          <label className="workflow-field">
                            <span>Date source</span>
                            <select
                              value={source}
                              disabled={!editable}
                              onChange={(event) =>
                                updateNode({
                                  config: {
                                    ...config,
                                    [key]:
                                      event.target.value === "reference"
                                        ? {
                                            kind: "reference",
                                            path:
                                              availableVariables[0] ||
                                              "event.payload.scheduledAt",
                                          }
                                        : {
                                            kind: "literal",
                                            value: new Date(
                                              Date.now() + 86_400_000,
                                            ).toISOString(),
                                          },
                                  },
                                })
                              }
                            >
                              <option value="literal">
                                Choose a date and time
                              </option>
                              <option value="reference">
                                Use a workflow value
                              </option>
                            </select>
                          </label>
                          {source === "reference" ? (
                            <label className="workflow-field">
                              <span>Workflow value</span>
                              <select
                                value={String(operand.path || "")}
                                disabled={!editable}
                                onChange={(event) =>
                                  updateNode({
                                    config: {
                                      ...config,
                                      [key]: {
                                        kind: "reference",
                                        path: event.target.value,
                                      },
                                    },
                                  })
                                }
                              >
                                {availableVariables.map((variable) => (
                                  <option key={variable} value={variable}>
                                    {variable}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <label className="workflow-field">
                              <span>Date and time</span>
                              <input
                                type="datetime-local"
                                value={toDateTimeLocal(operand.value)}
                                disabled={!editable}
                                onChange={(event) =>
                                  updateNode({
                                    config: {
                                      ...config,
                                      [key]: {
                                        kind: "literal",
                                        value: fromDateTimeLocal(
                                          event.target.value,
                                        ),
                                      },
                                    },
                                  })
                                }
                              />
                            </label>
                          )}
                        </>
                      );
                    };
                    return (
                      <div className="workflow-schedule-editor">
                        <label className="workflow-field">
                          <span>Wait for</span>
                          <select
                            value={waitMode}
                            disabled={!editable}
                            onChange={(event) => {
                              const mode = event.target.value;
                              if (mode === "duration")
                                replaceWait({ mode, amount: 1, unit: "days" });
                              else if (mode === "timestamp")
                                replaceWait({
                                  mode,
                                  timestamp: {
                                    kind: "literal",
                                    value: new Date(
                                      Date.now() + 86_400_000,
                                    ).toISOString(),
                                  },
                                  pastBehavior: "continue",
                                });
                              else if (mode === "relative")
                                replaceWait({
                                  mode,
                                  date: {
                                    kind: "reference",
                                    path:
                                      availableVariables[0] ||
                                      "event.payload.scheduledAt",
                                  },
                                  direction: "before",
                                  amount: 1,
                                  unit: "days",
                                });
                              else if (mode === "event")
                                replaceWait({
                                  mode,
                                  eventType: "contact.updated",
                                  timeoutBehavior: "continue",
                                });
                              else
                                replaceWait({
                                  mode: "condition",
                                  condition: {
                                    kind: "comparison",
                                    left: {
                                      kind: "reference",
                                      path:
                                        availableVariables[0] ||
                                        "event.payload.value",
                                    },
                                    operator: "isNotEmpty",
                                  },
                                  pollSeconds: 900,
                                  timeoutBehavior: "continue",
                                });
                            }}
                          >
                            <option value="duration">A length of time</option>
                            <option value="timestamp">
                              A specific date and time
                            </option>
                            <option value="relative">
                              Before or after a workflow date
                            </option>
                            <option value="event">Another event happens</option>
                            <option value="condition">
                              A condition becomes true
                            </option>
                          </select>
                        </label>
                        {waitMode === "duration" && (
                          <div className="workflow-schedule-interval">
                            <label className="workflow-field">
                              <span>Amount</span>
                              <input
                                type="number"
                                min={1}
                                value={Number(config.amount || 1)}
                                disabled={!editable}
                                onChange={(event) =>
                                  updateNode({
                                    config: {
                                      ...config,
                                      amount: Math.max(
                                        1,
                                        Number(event.target.value) || 1,
                                      ),
                                    },
                                  })
                                }
                              />
                            </label>
                            <label className="workflow-field">
                              <span>Unit</span>
                              <select
                                value={String(config.unit || "days")}
                                disabled={!editable}
                                onChange={(event) =>
                                  updateNode({
                                    config: {
                                      ...config,
                                      unit: event.target.value,
                                    },
                                  })
                                }
                              >
                                <option value="seconds">Seconds</option>
                                <option value="minutes">Minutes</option>
                                <option value="hours">Hours</option>
                                <option value="days">Days</option>
                              </select>
                            </label>
                          </div>
                        )}
                        {waitMode === "timestamp" && (
                          <>
                            {dateOperand("timestamp")}
                            <label className="workflow-field">
                              <span>If the date is already past</span>
                              <select
                                value={String(
                                  config.pastBehavior || "continue",
                                )}
                                disabled={!editable}
                                onChange={(event) =>
                                  updateNode({
                                    config: {
                                      ...config,
                                      pastBehavior: event.target.value,
                                    },
                                  })
                                }
                              >
                                <option value="continue">
                                  Continue immediately
                                </option>
                                <option value="exit">
                                  End this workflow branch
                                </option>
                                <option value="skip_communications">
                                  Continue, but skip messages and notifications
                                </option>
                              </select>
                            </label>
                          </>
                        )}
                        {waitMode === "relative" && (
                          <>
                            {dateOperand("date")}
                            <div className="workflow-schedule-interval">
                              <label className="workflow-field">
                                <span>Direction</span>
                                <select
                                  value={String(config.direction || "before")}
                                  disabled={!editable}
                                  onChange={(event) =>
                                    updateNode({
                                      config: {
                                        ...config,
                                        direction: event.target.value,
                                      },
                                    })
                                  }
                                >
                                  <option value="before">Before</option>
                                  <option value="after">After</option>
                                </select>
                              </label>
                              <label className="workflow-field">
                                <span>Amount</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={Number(config.amount || 1)}
                                  disabled={!editable}
                                  onChange={(event) =>
                                    updateNode({
                                      config: {
                                        ...config,
                                        amount: Math.max(
                                          1,
                                          Number(event.target.value) || 1,
                                        ),
                                      },
                                    })
                                  }
                                />
                              </label>
                            </div>
                            <label className="workflow-field">
                              <span>Unit</span>
                              <select
                                value={String(config.unit || "days")}
                                disabled={!editable}
                                onChange={(event) =>
                                  updateNode({
                                    config: {
                                      ...config,
                                      unit: event.target.value,
                                    },
                                  })
                                }
                              >
                                <option value="minutes">Minutes</option>
                                <option value="hours">Hours</option>
                                <option value="days">Days</option>
                              </select>
                            </label>
                          </>
                        )}
                        {waitMode === "event" && (
                          <>
                            <label className="workflow-field">
                              <span>Event</span>
                              <select
                                value={String(
                                  config.eventType || "contact.updated",
                                )}
                                disabled={!editable}
                                onChange={(event) =>
                                  updateNode({
                                    config: {
                                      ...config,
                                      eventType: event.target.value,
                                    },
                                  })
                                }
                              >
                                {workflowEventTypes.map((eventType) => (
                                  <option key={eventType} value={eventType}>
                                    {eventType}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div className="workflow-inspector-section-title">
                              <span>Optional event filter</span>
                              <button
                                type="button"
                                disabled={!editable}
                                onClick={() =>
                                  updateNode({
                                    config: config.condition
                                      ? { ...config, condition: undefined }
                                      : {
                                          ...config,
                                          condition: {
                                            kind: "comparison",
                                            left: {
                                              kind: "reference",
                                              path: "event.payload.value",
                                            },
                                            operator: "isNotEmpty",
                                          },
                                        },
                                  })
                                }
                              >
                                {config.condition ? "Remove" : "Add filter"}
                              </button>
                            </div>
                            {config.condition && (
                              <SimpleConditionEditor
                                id={`wait-event-${selectedNode.id}`}
                                condition={
                                  config.condition as WorkflowCondition
                                }
                                variables={availableVariables}
                                disabled={!editable}
                                onChange={(condition) =>
                                  updateNode({
                                    config: { ...config, condition },
                                  })
                                }
                              />
                            )}
                            {timeoutFields()}
                          </>
                        )}
                        {waitMode === "condition" && (
                          <>
                            <SimpleConditionEditor
                              id={`wait-condition-${selectedNode.id}`}
                              condition={config.condition as WorkflowCondition}
                              variables={availableVariables}
                              disabled={!editable}
                              onChange={(condition) =>
                                updateNode({ config: { ...config, condition } })
                              }
                            />
                            {timeoutFields(true)}
                          </>
                        )}
                        <p className="workflow-condition-help">
                          Waiting is durable. Publishing edits later does not
                          change runs already paused on an older version.
                        </p>
                      </div>
                    );
                  })()}
                {selectedNode.kind === "trigger" && (
                  <div className="workflow-trigger-filter">
                    <div className="workflow-inspector-section-title">
                      <span>Trigger filter</span>
                      {selectedNode.config.filters
                        ? editable && (
                            <button
                              type="button"
                              onClick={() => {
                                const { filters: _filters, ...config } =
                                  selectedNode.config;
                                void _filters;
                                updateNode({ config });
                              }}
                            >
                              <X size={13} /> Remove
                            </button>
                          )
                        : editable && (
                            <button
                              type="button"
                              onClick={() =>
                                updateNode({
                                  config: {
                                    ...selectedNode.config,
                                    filters: {
                                      kind: "comparison",
                                      left: {
                                        kind: "reference",
                                        path: "event.payload.value",
                                      },
                                      operator: "isNotEmpty",
                                    },
                                  },
                                })
                              }
                            >
                              <Plus size={13} /> Add
                            </button>
                          )}
                    </div>
                    {selectedNode.config.filters ? (
                      <SimpleConditionEditor
                        id={`trigger-${selectedNode.id}`}
                        condition={
                          selectedNode.config.filters as WorkflowCondition
                        }
                        variables={availableVariables.filter((path) =>
                          ["event.", "actor.", "organization."].some((root) =>
                            path.startsWith(root),
                          ),
                        )}
                        disabled={!editable}
                        onChange={(filters) =>
                          updateNode({
                            config: { ...selectedNode.config, filters },
                          })
                        }
                      />
                    ) : (
                      <p className="workflow-condition-help">
                        No filter—every matching event starts the workflow.
                      </p>
                    )}
                  </div>
                )}
                {[
                  "action.createContact",
                  "action.createLead",
                  "action.createItem",
                  "action.createProjectFromQuote",
                  "action.createOrUpdateQuote",
                  "action.updateContact",
                  "action.updateLead",
                  "action.updateObject",
                  "action.findOrCreateContact",
                ].includes(selectedNode.type) && (
                  <div className="workflow-schedule-editor">
                    {[
                      "action.updateContact",
                      "action.updateLead",
                      "action.updateObject",
                    ].includes(selectedNode.type) && (
                      <>
                        <label className="workflow-field">
                          <span>Object type</span>
                          <select
                            value={String(
                              selectedNode.config.objectType || "contact",
                            )}
                            disabled={!editable}
                            onChange={(event) =>
                              updateNode({
                                config: {
                                  ...selectedNode.config,
                                  objectType: event.target.value,
                                },
                              })
                            }
                          >
                            {workflowObjectTypes.map((objectType) => (
                              <option key={objectType} value={objectType}>
                                {objectType}
                              </option>
                            ))}
                          </select>
                        </label>
                        <OperandEditor
                          id={`object-${selectedNode.id}`}
                          label="Object ID"
                          value={
                            selectedNode.config.objectId as WorkflowOperand
                          }
                          variables={availableVariables}
                          disabled={!editable}
                          onChange={(objectId) =>
                            updateNode({
                              config: { ...selectedNode.config, objectId },
                            })
                          }
                        />
                      </>
                    )}
                    {selectedNode.type === "action.createProjectFromQuote" && (
                      <OperandEditor
                        id={`quote-${selectedNode.id}`}
                        label="Quote ID"
                        value={selectedNode.config.quoteId as WorkflowOperand}
                        variables={availableVariables}
                        disabled={!editable}
                        onChange={(quoteId) =>
                          updateNode({
                            config: { ...selectedNode.config, quoteId },
                          })
                        }
                      />
                    )}
                    {selectedNode.type === "action.createOrUpdateQuote" && (
                      <div className="workflow-trigger-filter">
                        <div className="workflow-inspector-section-title">
                          <span>Existing Quote</span>
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => {
                              const { objectId: _objectId, ...rest } =
                                selectedNode.config;
                              void _objectId;
                              updateNode({
                                config: selectedNode.config.objectId
                                  ? rest
                                  : {
                                      ...selectedNode.config,
                                      objectId: {
                                        kind: "reference",
                                        path: "quote.id",
                                      },
                                    },
                              });
                            }}
                          >
                            {selectedNode.config.objectId
                              ? "Create new instead"
                              : "Update existing"}
                          </button>
                        </div>
                        {Boolean(selectedNode.config.objectId) && (
                          <OperandEditor
                            id={`quote-upsert-${selectedNode.id}`}
                            label="Quote ID"
                            value={
                              selectedNode.config.objectId as WorkflowOperand
                            }
                            variables={availableVariables}
                            disabled={!editable}
                            onChange={(objectId) =>
                              updateNode({
                                config: { ...selectedNode.config, objectId },
                              })
                            }
                          />
                        )}
                      </div>
                    )}
                    <FieldMappingEditor
                      id={`fields-${selectedNode.id}`}
                      fields={
                        (selectedNode.config.fields as Record<
                          string,
                          WorkflowOperand
                        >) || {}
                      }
                      variables={availableVariables}
                      disabled={!editable}
                      onChange={(fields) =>
                        updateNode({
                          config: { ...selectedNode.config, fields },
                        })
                      }
                    />
                  </div>
                )}
                {(selectedNode.type === "action.sendEmail" ||
                  selectedNode.type === "action.sendSms") && (
                  <div className="workflow-schedule-editor">
                    <label className="workflow-checkbox-row">
                      <input
                        type="checkbox"
                        checked={selectedNode.config.enabled !== false}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              enabled: event.target.checked,
                            },
                          })
                        }
                      />
                      <span>Action enabled</span>
                    </label>
                    <OperandEditor
                      id={`recipient-${selectedNode.id}`}
                      label="Recipient"
                      value={selectedNode.config.recipient as WorkflowOperand}
                      variables={availableVariables}
                      disabled={!editable}
                      onChange={(recipient) =>
                        updateNode({
                          config: { ...selectedNode.config, recipient },
                        })
                      }
                    />
                    {selectedNode.type === "action.sendEmail" && (
                      <label className="workflow-field">
                        <span>Subject</span>
                        <input
                          value={String(selectedNode.config.subject || "")}
                          disabled={!editable}
                          placeholder="You can use {{contact.firstName}}"
                          onChange={(event) =>
                            updateNode({
                              config: {
                                ...selectedNode.config,
                                subject: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    )}
                    {selectedNode.type === "action.sendSms" && (
                      <label className="workflow-field">
                        <span>Message category</span>
                        <select
                          value={String(
                            selectedNode.config.category || "appointment",
                          )}
                          disabled={!editable}
                          onChange={(event) =>
                            updateNode({
                              config: {
                                ...selectedNode.config,
                                category: event.target.value,
                              },
                            })
                          }
                        >
                          <option value="appointment">
                            Appointment / project
                          </option>
                          <option value="marketing">Marketing</option>
                        </select>
                      </label>
                    )}
                    <label className="workflow-field">
                      <span>
                        {selectedNode.type === "action.sendEmail"
                          ? "Email body"
                          : "Message"}
                      </span>
                      <textarea
                        value={String(selectedNode.config.body || "")}
                        disabled={!editable}
                        placeholder="Use {{contact.firstName}} to insert workflow values."
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              body: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                    <label className="workflow-field">
                      <span>If a value is missing</span>
                      <select
                        value={String(
                          selectedNode.config.missingValueBehavior || "skip",
                        )}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              missingValueBehavior: event.target.value,
                            },
                          })
                        }
                      >
                        <option value="blank">Leave it blank</option>
                        <option value="fallback">Use a fallback value</option>
                        <option value="skip">Skip this action</option>
                        <option value="error">Stop with an error</option>
                      </select>
                    </label>
                    {selectedNode.config.missingValueBehavior ===
                      "fallback" && (
                      <label className="workflow-field">
                        <span>Fallback value</span>
                        <input
                          value={String(
                            selectedNode.config.fallbackValue || "",
                          )}
                          disabled={!editable}
                          onChange={(event) =>
                            updateNode({
                              config: {
                                ...selectedNode.config,
                                fallbackValue: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    )}
                    <p className="workflow-condition-help">
                      Preview this action in Test mode before publishing. SMS
                      always passes through the system consent and Do Not
                      Disturb policy gate.
                    </p>
                  </div>
                )}
                {selectedNode.type === "action.internalNotification" && (
                  <div className="workflow-schedule-editor">
                    <label className="workflow-checkbox-row">
                      <input
                        type="checkbox"
                        checked={selectedNode.config.enabled !== false}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              enabled: event.target.checked,
                            },
                          })
                        }
                      />
                      <span>Action enabled</span>
                    </label>
                    <label className="workflow-field">
                      <span>Send to</span>
                      <select
                        value={String(
                          selectedNode.config.channel || "connected_team",
                        )}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              channel: event.target.value,
                            },
                          })
                        }
                      >
                        <option value="connected_team">
                          Connected team channel
                        </option>
                        <option value="user">Workspace user</option>
                      </select>
                    </label>
                    {selectedNode.config.channel === "user" && (
                      <OperandEditor
                        id={`notification-recipient-${selectedNode.id}`}
                        label="Workspace user ID"
                        value={selectedNode.config.recipient as WorkflowOperand}
                        variables={availableVariables}
                        disabled={!editable}
                        onChange={(recipient) =>
                          updateNode({
                            config: { ...selectedNode.config, recipient },
                          })
                        }
                      />
                    )}
                    <label className="workflow-field">
                      <span>Title</span>
                      <input
                        value={String(selectedNode.config.title || "")}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              title: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                    <label className="workflow-field">
                      <span>Message</span>
                      <textarea
                        value={String(selectedNode.config.body || "")}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              body: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                )}
                {(selectedNode.type === "action.findContact" ||
                  selectedNode.type === "action.findOrCreateContact") && (
                  <div className="workflow-schedule-editor">
                    {selectedNode.type === "action.findOrCreateContact" && (
                      <label className="workflow-checkbox-row">
                        <input
                          type="checkbox"
                          checked={selectedNode.config.matchExisting !== false}
                          disabled={!editable}
                          onChange={(event) =>
                            updateNode({
                              config: {
                                ...selectedNode.config,
                                matchExisting: event.target.checked,
                              },
                            })
                          }
                        />
                        <span>Reuse an existing matching Contact</span>
                      </label>
                    )}
                    <div className="workflow-inspector-section-title">
                      <span>Match Contact by</span>
                    </div>
                    {(["email", "phone", "id"] as const).map((matchField) => {
                      const matchFields =
                        (selectedNode.config.matchFields as string[]) || [];
                      const enabled = matchFields.includes(matchField);
                      return (
                        <div
                          className="workflow-trigger-filter"
                          key={matchField}
                        >
                          <label className="workflow-checkbox-row">
                            <input
                              type="checkbox"
                              checked={enabled}
                              disabled={
                                !editable ||
                                (enabled && matchFields.length === 1)
                              }
                              onChange={(event) =>
                                updateNode({
                                  config: {
                                    ...selectedNode.config,
                                    matchFields: event.target.checked
                                      ? [...matchFields, matchField]
                                      : matchFields.filter(
                                          (field) => field !== matchField,
                                        ),
                                    ...(event.target.checked
                                      ? {
                                          [matchField]: {
                                            kind: "reference",
                                            path:
                                              matchField === "id"
                                                ? "contact.id"
                                                : `event.payload.${matchField}`,
                                          },
                                        }
                                      : { [matchField]: undefined }),
                                  },
                                })
                              }
                            />
                            <span>
                              {matchField === "id"
                                ? "Contact ID"
                                : matchField[0].toUpperCase() +
                                  matchField.slice(1)}
                            </span>
                          </label>
                          {enabled && (
                            <OperandEditor
                              id={`find-${selectedNode.id}-${matchField}`}
                              label={`${matchField === "id" ? "Contact ID" : matchField} value`}
                              value={
                                selectedNode.config[
                                  matchField
                                ] as WorkflowOperand
                              }
                              variables={availableVariables}
                              disabled={!editable}
                              onChange={(value) =>
                                updateNode({
                                  config: {
                                    ...selectedNode.config,
                                    [matchField]: value,
                                  },
                                })
                              }
                            />
                          )}
                        </div>
                      );
                    })}
                    <label className="workflow-field">
                      <span>If more than one Contact matches</span>
                      <select
                        value={String(
                          selectedNode.config.multipleMatch || "latest",
                        )}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              multipleMatch: event.target.value,
                            },
                          })
                        }
                      >
                        <option value="latest">
                          Use the most recently updated
                        </option>
                        <option value="earliest">
                          Use the earliest created
                        </option>
                        <option value="fail">Stop and require review</option>
                      </select>
                    </label>
                  </div>
                )}
                {selectedNode.type === "action.assignUser" && (
                  <div className="workflow-schedule-editor">
                    <label className="workflow-field">
                      <span>Object type</span>
                      <select
                        value={String(
                          selectedNode.config.objectType || "contact",
                        )}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              objectType: event.target.value,
                            },
                          })
                        }
                      >
                        {workflowObjectTypes.map((objectType) => (
                          <option key={objectType} value={objectType}>
                            {objectType}
                          </option>
                        ))}
                      </select>
                    </label>
                    <OperandEditor
                      id={`assign-object-${selectedNode.id}`}
                      label="Object ID"
                      value={selectedNode.config.objectId as WorkflowOperand}
                      variables={availableVariables}
                      disabled={!editable}
                      onChange={(objectId) =>
                        updateNode({
                          config: { ...selectedNode.config, objectId },
                        })
                      }
                    />
                    <OperandEditor
                      id={`assign-user-${selectedNode.id}`}
                      label="User ID"
                      value={selectedNode.config.userId as WorkflowOperand}
                      variables={availableVariables}
                      disabled={!editable}
                      onChange={(userId) =>
                        updateNode({
                          config: { ...selectedNode.config, userId },
                        })
                      }
                    />
                  </div>
                )}
                {selectedNode.type === "action.addNote" && (
                  <div className="workflow-schedule-editor">
                    <label className="workflow-field">
                      <span>Object type</span>
                      <select
                        value={String(
                          selectedNode.config.objectType || "contact",
                        )}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              objectType: event.target.value,
                            },
                          })
                        }
                      >
                        {workflowObjectTypes.map((objectType) => (
                          <option key={objectType} value={objectType}>
                            {objectType}
                          </option>
                        ))}
                      </select>
                    </label>
                    <OperandEditor
                      id={`note-object-${selectedNode.id}`}
                      label="Object ID"
                      value={selectedNode.config.objectId as WorkflowOperand}
                      variables={availableVariables}
                      disabled={!editable}
                      onChange={(objectId) =>
                        updateNode({
                          config: { ...selectedNode.config, objectId },
                        })
                      }
                    />
                    <label className="workflow-field">
                      <span>Note</span>
                      <textarea
                        value={String(selectedNode.config.body || "")}
                        disabled={!editable}
                        placeholder="Use {{contact.firstName}} to insert workflow values."
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              body: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                )}
                {selectedNode.type === "action.webhook" && (
                  <div className="workflow-schedule-editor">
                    <label className="workflow-checkbox-row">
                      <input
                        type="checkbox"
                        checked={selectedNode.config.enabled !== false}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              enabled: event.target.checked,
                            },
                          })
                        }
                      />
                      <span>Request enabled</span>
                    </label>
                    <label className="workflow-field">
                      <span>Destination</span>
                      <select
                        value={String(
                          selectedNode.config.destination || "custom",
                        )}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              destination: event.target.value,
                            },
                          })
                        }
                      >
                        <option value="custom">Custom HTTPS URL</option>
                        <option value="discord_lead_webhook">
                          Connected Discord lead webhook
                        </option>
                      </select>
                      {selectedNode.config.destination ===
                        "discord_lead_webhook" && (
                        <small>
                          {demo || senderOptions.webhook.length
                            ? "The secret URL is stored securely and never exposed in the workflow."
                            : "Discord is not connected. Add the webhook in secure server settings before publishing."}
                        </small>
                      )}
                    </label>
                    <div className="workflow-schedule-interval">
                      <label className="workflow-field">
                        <span>Method</span>
                        <select
                          value={String(selectedNode.config.method || "POST")}
                          disabled={!editable}
                          onChange={(event) =>
                            updateNode({
                              config: {
                                ...selectedNode.config,
                                method: event.target.value,
                              },
                            })
                          }
                        >
                          {(
                            ["GET", "POST", "PUT", "PATCH", "DELETE"] as const
                          ).map((method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="workflow-field">
                        <span>Public HTTPS URL</span>
                        <input
                          type="url"
                          value={
                            selectedNode.config.destination ===
                            "discord_lead_webhook"
                              ? "https://discord.com/api/webhooks/••••••••"
                              : String(selectedNode.config.url || "")
                          }
                          disabled={
                            !editable ||
                            selectedNode.config.destination ===
                              "discord_lead_webhook"
                          }
                          onChange={(event) =>
                            updateNode({
                              config: {
                                ...selectedNode.config,
                                url: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="workflow-inspector-section-title">
                      <span>Headers</span>
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => {
                          const headers = {
                            ...((selectedNode.config.headers || {}) as Record<
                              string,
                              string
                            >),
                          };
                          let index = Object.keys(headers).length + 1;
                          let name = `X-Custom-Header-${index}`;
                          while (name in headers)
                            name = `X-Custom-Header-${++index}`;
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              headers: { ...headers, [name]: "" },
                            },
                          });
                        }}
                      >
                        <Plus size={13} /> Add header
                      </button>
                    </div>
                    {Object.entries(
                      (selectedNode.config.headers || {}) as Record<
                        string,
                        string
                      >,
                    ).map(([name, value]) => (
                      <div className="workflow-request-header" key={name}>
                        <input
                          aria-label="Header name"
                          value={name}
                          disabled={!editable}
                          onChange={(event) => {
                            const headers = Object.fromEntries(
                              Object.entries(
                                (selectedNode.config.headers || {}) as Record<
                                  string,
                                  string
                                >,
                              ).map(([currentName, currentValue]) => [
                                currentName === name
                                  ? event.target.value
                                  : currentName,
                                currentValue,
                              ]),
                            );
                            updateNode({
                              config: { ...selectedNode.config, headers },
                            });
                          }}
                        />
                        <input
                          aria-label={`${name} header value`}
                          value={value}
                          disabled={!editable}
                          onChange={(event) =>
                            updateNode({
                              config: {
                                ...selectedNode.config,
                                headers: {
                                  ...((selectedNode.config.headers || {}) as Record<
                                    string,
                                    string
                                  >),
                                  [name]: event.target.value,
                                },
                              },
                            })
                          }
                        />
                        <button
                          type="button"
                          aria-label={`Remove ${name} header`}
                          disabled={!editable}
                          onClick={() =>
                            updateNode({
                              config: {
                                ...selectedNode.config,
                                headers: Object.fromEntries(
                                  Object.entries(
                                    (selectedNode.config.headers || {}) as Record<
                                      string,
                                      string
                                    >,
                                  ).filter(
                                    ([currentName]) => currentName !== name,
                                  ),
                                ),
                              },
                            })
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    <label className="workflow-field">
                      <span>Body format</span>
                      <select
                        value={String(selectedNode.config.bodyType || "json")}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              bodyType: event.target.value,
                            },
                          })
                        }
                      >
                        <option value="json">JSON</option>
                        <option value="text">Plain text</option>
                      </select>
                    </label>
                    <label className="workflow-field">
                      <span>Request body</span>
                      <textarea
                        className="workflow-request-body"
                        value={String(selectedNode.config.body || "")}
                        disabled={!editable}
                        placeholder='{"contactId":"{{contact.id}}"}'
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              body: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                    <div className="workflow-setting-pair">
                      <label className="workflow-field">
                        <span>If a value is missing</span>
                        <select
                          value={String(
                            selectedNode.config.missingValueBehavior ||
                              "blank",
                          )}
                          disabled={!editable}
                          onChange={(event) =>
                            updateNode({
                              config: {
                                ...selectedNode.config,
                                missingValueBehavior: event.target.value,
                              },
                            })
                          }
                        >
                          <option value="blank">Leave it blank</option>
                          <option value="fallback">Use fallback</option>
                          <option value="skip">Skip request</option>
                          <option value="error">Stop with an error</option>
                        </select>
                      </label>
                      <label className="workflow-field">
                        <span>Timeout in seconds</span>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={Number(
                            selectedNode.config.timeoutSeconds || 15,
                          )}
                          disabled={!editable}
                          onChange={(event) =>
                            updateNode({
                              config: {
                                ...selectedNode.config,
                                timeoutSeconds: Math.min(
                                  30,
                                  Math.max(
                                    1,
                                    Number(event.target.value) || 15,
                                  ),
                                ),
                              },
                            })
                          }
                        />
                      </label>
                    </div>
                    {selectedNode.config.missingValueBehavior ===
                      "fallback" && (
                      <label className="workflow-field">
                        <span>Fallback value</span>
                        <input
                          value={String(
                            selectedNode.config.fallbackValue || "",
                          )}
                          disabled={!editable}
                          onChange={(event) =>
                            updateNode({
                              config: {
                                ...selectedNode.config,
                                fallbackValue: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    )}
                    <label className="workflow-checkbox-row">
                      <input
                        type="checkbox"
                        checked={selectedNode.config.saveResponse === true}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              saveResponse: event.target.checked,
                            },
                          })
                        }
                      />
                      <span>Expose the response to later steps</span>
                    </label>
                    <p className="workflow-condition-help">
                      Requests are limited to public HTTPS destinations.
                      Private networks, redirects, embedded credentials, and
                      secret headers are blocked. Use a managed connection for
                      credentials.
                    </p>
                  </div>
                )}
                {(selectedNode.type === "action.enrollWorkflow" ||
                  selectedNode.type === "action.removeWorkflow") && (
                  <div className="workflow-schedule-editor">
                    <label className="workflow-field">
                      <span>Workflow</span>
                      <select
                        value={String(selectedNode.config.workflowId || "")}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            config: {
                              ...selectedNode.config,
                              workflowId: event.target.value,
                            },
                          })
                        }
                      >
                        <option value="">Choose a workflow</option>
                        {workflows
                          .filter((workflow) => workflow.id !== detail.id)
                          .map((workflow) => (
                            <option key={workflow.id} value={workflow.id}>
                              {workflow.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <OperandEditor
                      id={`enroll-object-${selectedNode.id}`}
                      label="Enrollment object ID (optional)"
                      value={selectedNode.config.objectId as WorkflowOperand}
                      variables={availableVariables}
                      disabled={!editable}
                      onChange={(objectId) =>
                        updateNode({
                          config: { ...selectedNode.config, objectId },
                        })
                      }
                    />
                  </div>
                )}
                {selectedNode.type === "control.goto" && (
                  <div className="workflow-schedule-editor">
                    <label className="workflow-field">
                      <span>Continue at</span>
                      <select
                        value={selectedNode.outgoing[0]?.to || ""}
                        disabled={!editable}
                        onChange={(event) =>
                          updateNode({
                            outgoing: selectedNode.outgoing.length
                              ? selectedNode.outgoing.map((edge, index) =>
                                  index === 0
                                    ? { ...edge, to: event.target.value }
                                    : edge,
                                )
                              : [
                                  {
                                    id: `${selectedNode.id}-target`,
                                    to: event.target.value,
                                    label: "Go to",
                                    order: 0,
                                    kind: "default",
                                  },
                                ],
                          })
                        }
                      >
                        {detail.draft.graph.nodes
                          .filter(
                            (node) =>
                              node.id !== selectedNode.id &&
                              node.kind !== "trigger",
                          )
                          .map((node) => (
                            <option key={node.id} value={node.id}>
                              {node.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <p className="workflow-condition-help">
                      Go To must be the final step in a branch. Loop limits
                      prevent a workflow from running forever.
                    </p>
                  </div>
                )}
                {selectedNode.type === "action.createLead" && (
                  <label className="workflow-field">
                    <span>Lead source</span>
                    <input
                      aria-label="Lead source"
                      value={
                        (
                          selectedNode.config.fields as
                            Record<string, { value?: string }> | undefined
                        )?.source?.value || ""
                      }
                      disabled={!editable}
                      onChange={(event) => {
                        const fields = structuredClone(
                          (selectedNode.config.fields as Record<
                            string,
                            unknown
                          >) || {},
                        );
                        fields.source = {
                          kind: "literal",
                          value: event.target.value,
                        };
                        updateNode({
                          config: { ...selectedNode.config, fields },
                        });
                      }}
                    />
                  </label>
                )}
                {selectedNode.kind === "decision" && (
                  <div className="workflow-branch-editor">
                    <div className="workflow-inspector-section-title">
                      <span>Branches</span>
                      <div>
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() =>
                            changeDefinition((definition) => {
                              const current = definition.layout.nodes[
                                selectedNode.id
                              ] || { x: 0, y: 0 };
                              definition.layout.nodes[selectedNode.id] = {
                                ...current,
                                collapsed: !current.collapsed,
                              };
                            })
                          }
                        >
                          {detail.draft.layout.nodes[selectedNode.id]?.collapsed
                            ? "Expand"
                            : "Collapse"}
                        </button>
                        {editable && (
                          <button type="button" onClick={addBranch}>
                            <Plus size={14} /> Add
                          </button>
                        )}
                      </div>
                    </div>
                    {sortedEdges(selectedNode.outgoing).map((edge, index) => (
                      <div
                        className="workflow-branch-editor-row"
                        key={edge.id}
                        draggable={editable && edge.kind !== "fallback"}
                        onDragStart={(event) =>
                          event.dataTransfer.setData(
                            "text/plain",
                            String(index),
                          )
                        }
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          reorderBranch(
                            Number(event.dataTransfer.getData("text/plain")),
                            index,
                          );
                        }}
                      >
                        <GripVertical size={15} />
                        <div>
                          <input
                            value={edge.label}
                            disabled={!editable}
                            onChange={(event) => {
                              const outgoing = selectedNode.outgoing.map(
                                (item) =>
                                  item.id === edge.id
                                    ? { ...item, label: event.target.value }
                                    : item,
                              );
                              updateNode({ outgoing });
                            }}
                          />
                          {selectedNode.type === "logic.router" &&
                            edge.kind !== "fallback" && (
                              <select
                                aria-label="Router branch behavior"
                                value={
                                  edge.kind === "always" ? "always" : "branch"
                                }
                                disabled={!editable}
                                onChange={(event) => {
                                  const kind = event.target.value as
                                    "always" | "branch";
                                  updateNode({
                                    outgoing: selectedNode.outgoing.map(
                                      (item) =>
                                        item.id === edge.id
                                          ? {
                                              ...item,
                                              kind,
                                              condition:
                                                kind === "always"
                                                  ? undefined
                                                  : item.condition || {
                                                      kind: "comparison",
                                                      left: {
                                                        kind: "reference",
                                                        path: "event.payload.value",
                                                      },
                                                      operator: "isNotEmpty",
                                                    },
                                            }
                                          : item,
                                    ),
                                  });
                                }}
                              >
                                <option value="branch">Custom rule</option>
                                <option value="always">Always run</option>
                              </select>
                            )}
                          <small>
                            {edge.kind === "fallback"
                              ? "Fallback—runs when no rule matches"
                              : edge.kind === "always"
                                ? "Always runs"
                                : selectedNode.type === "logic.ifElse"
                                  ? "First matching branch wins"
                                  : "Every matching branch runs"}
                          </small>
                          {edge.kind !== "fallback" &&
                            edge.kind !== "always" && (
                              <SimpleConditionEditor
                                id={`branch-${edge.id}`}
                                condition={edge.condition}
                                variables={availableVariables}
                                disabled={!editable}
                                onChange={(condition) =>
                                  updateBranchCondition(edge.id, condition)
                                }
                              />
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <details className="workflow-advanced-editor">
                  <summary>Advanced configuration</summary>
                  <JsonEditor
                    key={`config-${selectedNode.id}`}
                    label="Configuration JSON"
                    value={selectedNode.config}
                    disabled={
                      !editable || selectedNode.type.startsWith("system.")
                    }
                    onChange={(config) =>
                      updateNode({ config: config as Record<string, unknown> })
                    }
                  />
                </details>
                {selectedNode.kind === "decision" && (
                  <details className="workflow-advanced-editor">
                    <summary>Advanced branch rules</summary>
                    <JsonEditor
                      key={`branches-${selectedNode.id}`}
                      label="Branch rule JSON"
                      value={selectedNode.outgoing.map((edge) => ({
                        id: edge.id,
                        label: edge.label,
                        kind: edge.kind,
                        condition: edge.condition,
                      }))}
                      disabled={!editable}
                      onChange={(value) => {
                        if (!Array.isArray(value)) return;
                        const changes = new Map(
                          value
                            .filter((entry): entry is Record<string, unknown> =>
                              Boolean(entry && typeof entry === "object"),
                            )
                            .map((entry) => [String(entry.id), entry]),
                        );
                        updateNode({
                          outgoing: selectedNode.outgoing.map((edge) => {
                            const change = changes.get(edge.id);
                            if (!change) return edge;
                            return {
                              ...edge,
                              label:
                                typeof change.label === "string"
                                  ? change.label
                                  : edge.label,
                              kind: [
                                "default",
                                "branch",
                                "always",
                                "fallback",
                              ].includes(String(change.kind))
                                ? (change.kind as WorkflowEdge["kind"])
                                : edge.kind,
                              condition: change.condition as
                                WorkflowCondition | undefined,
                            };
                          }),
                        });
                      }}
                    />
                  </details>
                )}
                {validation
                  .filter((issue) => issue.nodeId === selectedNode.id)
                  .map((issue) => (
                    <div
                      className={`workflow-validation is-${issue.severity}`}
                      key={`${issue.code}-${issue.edgeId || "node"}`}
                    >
                      <AlertCircle size={14} /> {issue.message}
                    </div>
                  ))}
                {editable &&
                  !["trigger", "decision", "terminal"].includes(
                    selectedNode.kind,
                  ) &&
                  !selectedNode.type.startsWith("system.") && (
                    <div
                      className="workflow-keyboard-move"
                      aria-label="Move selected step"
                    >
                      <button type="button" onClick={() => moveSelected("up")}>
                        <ArrowUp size={14} /> Move earlier
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSelected("down")}
                      >
                        <ArrowDown size={14} /> Move later
                      </button>
                    </div>
                  )}
                {editable &&
                  selectedNode.kind !== "terminal" &&
                  !selectedNode.type.startsWith("system.") && (
                    <button
                      type="button"
                      className="workflow-delete-step"
                      onClick={deleteSelectedNode}
                    >
                      <Trash2 size={15} /> Remove step
                    </button>
                  )}
              </>
            ) : (
              <div className="workflow-settings-editor">
                <div className="workflow-inspector-type">
                  <span>VERSIONED SETTINGS</span>
                  <strong>Enrollment and execution</strong>
                  <p>These controls are pinned to each published version.</p>
                </div>
                <label className="workflow-field">
                  <span>Folder</span>
                  <input
                    value={detail.draft.settings.folder}
                    disabled={!editable}
                    onChange={(event) =>
                      updateSettings({ folder: event.target.value })
                    }
                  />
                </label>
                <label className="workflow-field">
                  <span>Tags</span>
                  <input
                    value={detail.draft.settings.tags.join(", ")}
                    disabled={!editable}
                    placeholder="Lead intake, Follow-up"
                    onChange={(event) =>
                      updateSettings({
                        tags: event.target.value
                          .split(",")
                          .map((tag) => tag.trim())
                          .filter(Boolean)
                          .slice(0, 30),
                      })
                    }
                  />
                </label>
                <label className="workflow-setting-toggle">
                  <input
                    type="checkbox"
                    checked={detail.draft.settings.allowReentry}
                    disabled={!editable}
                    onChange={(event) =>
                      updateSettings({ allowReentry: event.target.checked })
                    }
                  />
                  <span>
                    <strong>Allow re-entry</strong>
                    <small>The same object may enroll again.</small>
                  </span>
                </label>
                {detail.draft.settings.allowReentry && (
                  <label className="workflow-field">
                    <span>Re-entry cooldown (seconds)</span>
                    <input
                      type="number"
                      min={0}
                      value={detail.draft.settings.reentryCooldownSeconds}
                      disabled={!editable}
                      onChange={(event) =>
                        updateSettings({
                          reentryCooldownSeconds:
                            Number(event.target.value) || 0,
                        })
                      }
                    />
                  </label>
                )}
                <label className="workflow-field">
                  <span>Concurrency scope</span>
                  <select
                    value={detail.draft.settings.concurrencyScope}
                    disabled={!editable}
                    onChange={(event) =>
                      updateSettings({
                        concurrencyScope: event.target
                          .value as WorkflowDefinition["settings"]["concurrencyScope"],
                      })
                    }
                  >
                    {(
                      [
                        "contact",
                        "lead",
                        "quote",
                        "project",
                        "item",
                        "event",
                      ] as const
                    ).map((scope) => (
                      <option value={scope} key={scope}>
                        {scope[0].toUpperCase() + scope.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="workflow-field">
                  <span>Duplicate events</span>
                  <select
                    value={detail.draft.settings.duplicateEventPolicy}
                    disabled={!editable}
                    onChange={(event) =>
                      updateSettings({
                        duplicateEventPolicy: event.target
                          .value as WorkflowDefinition["settings"]["duplicateEventPolicy"],
                      })
                    }
                  >
                    <option value="ignore">Ignore</option>
                    <option value="restart">Restart</option>
                    <option value="parallel">Run in parallel</option>
                  </select>
                </label>
                <label className="workflow-setting-toggle">
                  <input
                    type="checkbox"
                    checked={detail.draft.settings.stopOnContactResponse}
                    disabled={!editable}
                    onChange={(event) =>
                      updateSettings({
                        stopOnContactResponse: event.target.checked,
                      })
                    }
                  />
                  <span>
                    <strong>Stop on Contact response</strong>
                    <small>Cancel future steps after a reply.</small>
                  </span>
                </label>
                <label className="workflow-field">
                  <span>Timezone</span>
                  <input
                    value={detail.draft.settings.timezone}
                    disabled={!editable}
                    onChange={(event) =>
                      updateSettings({ timezone: event.target.value })
                    }
                  />
                </label>
                <label className="workflow-setting-toggle">
                  <input
                    type="checkbox"
                    checked={detail.draft.settings.communicationWindow.enabled}
                    disabled={!editable}
                    onChange={(event) =>
                      updateSettings({
                        communicationWindow: {
                          ...detail.draft.settings.communicationWindow,
                          enabled: event.target.checked,
                        },
                      })
                    }
                  />
                  <span>
                    <strong>Communication window</strong>
                    <small>Hold messages outside allowed hours.</small>
                  </span>
                </label>
                {detail.draft.settings.communicationWindow.enabled && (
                  <>
                    <div className="workflow-setting-pair">
                      <label className="workflow-field">
                        <span>Start</span>
                        <input
                          type="time"
                          value={
                            detail.draft.settings.communicationWindow.start
                          }
                          disabled={!editable}
                          onChange={(event) =>
                            updateSettings({
                              communicationWindow: {
                                ...detail.draft.settings.communicationWindow,
                                start: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      <label className="workflow-field">
                        <span>End</span>
                        <input
                          type="time"
                          value={detail.draft.settings.communicationWindow.end}
                          disabled={!editable}
                          onChange={(event) =>
                            updateSettings({
                              communicationWindow: {
                                ...detail.draft.settings.communicationWindow,
                                end: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    </div>
                    <fieldset
                      className="workflow-weekdays"
                      disabled={!editable}
                    >
                      <legend>Allowed days</legend>
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                        (day, index) => (
                          <label key={day}>
                            <input
                              type="checkbox"
                              checked={detail.draft.settings.communicationWindow.days.includes(
                                index,
                              )}
                              onChange={(event) => {
                                const days = event.target.checked
                                  ? [
                                      ...detail.draft.settings
                                        .communicationWindow.days,
                                      index,
                                    ]
                                  : detail.draft.settings.communicationWindow.days.filter(
                                      (value) => value !== index,
                                    );
                                updateSettings({
                                  communicationWindow: {
                                    ...detail.draft.settings
                                      .communicationWindow,
                                    days: [...new Set(days)].sort(),
                                  },
                                });
                              }}
                            />
                            <span>{day}</span>
                          </label>
                        ),
                      )}
                    </fieldset>
                  </>
                )}
                <div className="workflow-inspector-section-title">
                  <span>Sender defaults</span>
                </div>
                <p className="workflow-condition-help">
                  Communication steps inherit these connections unless a step
                  explicitly overrides them.
                </p>
                <label className="workflow-field">
                  <span>Email sender</span>
                  <select
                    aria-label="Workflow email sender"
                    value={
                      detail.draft.settings.senderDefaults.emailConnectionId ||
                      ""
                    }
                    disabled={!editable}
                    onChange={(event) =>
                      updateSettings({
                        senderDefaults: {
                          ...detail.draft.settings.senderDefaults,
                          emailConnectionId: event.target.value || undefined,
                        },
                      })
                    }
                  >
                    <option value="">Organization default</option>
                    {senderOptions.email.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {!senderOptions.email.length && !demo && (
                    <small>
                      Connect a company mailbox in Settings to choose it here.
                    </small>
                  )}
                </label>
                <label className="workflow-field">
                  <span>Text sender</span>
                  <select
                    aria-label="Workflow text sender"
                    value={
                      detail.draft.settings.senderDefaults.smsConnectionId || ""
                    }
                    disabled={!editable}
                    onChange={(event) =>
                      updateSettings({
                        senderDefaults: {
                          ...detail.draft.settings.senderDefaults,
                          smsConnectionId: event.target.value || undefined,
                        },
                      })
                    }
                  >
                    <option value="">Organization default</option>
                    {senderOptions.sms.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {!senderOptions.sms.length && !demo && (
                    <small>
                      Connect company texting in Settings to choose it here.
                    </small>
                  )}
                </label>
                <div className="workflow-inspector-section-title">
                  <span>Safety limits</span>
                </div>
                <label className="workflow-field">
                  <span>Maximum runtime (seconds)</span>
                  <input
                    type="number"
                    min={60}
                    value={detail.draft.settings.maximumRuntimeSeconds}
                    disabled={!editable}
                    onChange={(event) =>
                      updateSettings({
                        maximumRuntimeSeconds: Math.max(
                          60,
                          Number(event.target.value) || 60,
                        ),
                      })
                    }
                  />
                </label>
                <label className="workflow-field">
                  <span>Maximum executed steps</span>
                  <input
                    type="number"
                    min={1}
                    value={detail.draft.settings.maximumSteps}
                    disabled={!editable}
                    onChange={(event) =>
                      updateSettings({
                        maximumSteps: Math.max(
                          1,
                          Number(event.target.value) || 1,
                        ),
                      })
                    }
                  />
                </label>
                <label className="workflow-field">
                  <span>Maximum visits per node</span>
                  <input
                    type="number"
                    min={1}
                    value={detail.draft.settings.maximumVisitsPerNode}
                    disabled={!editable}
                    onChange={(event) =>
                      updateSettings({
                        maximumVisitsPerNode: Math.max(
                          1,
                          Number(event.target.value) || 1,
                        ),
                      })
                    }
                  />
                </label>
                <label className="workflow-field">
                  <span>When a step exhausts retries</span>
                  <select
                    value={detail.draft.settings.failureBehavior}
                    disabled={!editable}
                    onChange={(event) =>
                      updateSettings({
                        failureBehavior: event.target
                          .value as WorkflowDefinition["settings"]["failureBehavior"],
                      })
                    }
                  >
                    <option value="needs_attention">Needs attention</option>
                    <option value="stop">Stop the run</option>
                    <option value="continue">Continue</option>
                  </select>
                </label>
                <div className="workflow-setting-pair">
                  <label className="workflow-field">
                    <span>Retry attempts</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={detail.draft.settings.retry.maxAttempts}
                      disabled={!editable}
                      onChange={(event) =>
                        updateSettings({
                          retry: {
                            ...detail.draft.settings.retry,
                            maxAttempts: Math.min(
                              10,
                              Math.max(1, Number(event.target.value) || 1),
                            ),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="workflow-field">
                    <span>Initial delay</span>
                    <input
                      type="number"
                      min={1}
                      value={detail.draft.settings.retry.initialDelaySeconds}
                      disabled={!editable}
                      onChange={(event) =>
                        updateSettings({
                          retry: {
                            ...detail.draft.settings.retry,
                            initialDelaySeconds: Math.max(
                              1,
                              Number(event.target.value) || 1,
                            ),
                          },
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {(insertion || addingTrigger) && (
        <div
          className="workflow-drawer-backdrop"
          role="presentation"
          onMouseDown={() => {
            setInsertion(null);
            setAddingTrigger(false);
          }}
        >
          <aside
            className="workflow-node-library"
            role="dialog"
            aria-modal="true"
            aria-label="Add workflow step"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="workflow-node-library-title">
              <div>
                <span>{addingTrigger ? "ADD TRIGGER" : "ADD STEP"}</span>
                <strong>
                  {addingTrigger
                    ? "Choose what starts this workflow"
                    : "Choose an action or decision"}
                </strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInsertion(null);
                  setAddingTrigger(false);
                }}
              >
                <X size={17} />
              </button>
            </div>
            <label className="workflow-search">
              <Search size={15} />
              <input
                autoFocus
                value={librarySearch}
                onChange={(event) => setLibrarySearch(event.target.value)}
                placeholder={
                  addingTrigger ? "Search triggers" : "Search actions"
                }
              />
            </label>
            <div className="workflow-node-library-list">
              {Object.entries(
                Object.groupBy(library, (item) => item.category),
              ).map(([category, items]) => (
                <section key={category}>
                  <h3>{category}</h3>
                  {items?.map((definition) => (
                    <button
                      type="button"
                      key={definition.type}
                      onClick={() => insertNode(definition)}
                    >
                      <span>
                        {definition.kind === "trigger" ? (
                          <Zap size={17} />
                        ) : definition.kind === "decision" ? (
                          <GitBranch size={17} />
                        ) : definition.kind === "wait" ? (
                          <Clock3 size={17} />
                        ) : (
                          <Plus size={17} />
                        )}
                      </span>
                      <div>
                        <strong>{definition.name}</strong>
                        <small>{definition.description}</small>
                      </div>
                    </button>
                  ))}
                </section>
              ))}
            </div>
          </aside>
        </div>
      )}

      {createOpen && (
        <div
          className="workflow-drawer-backdrop"
          role="presentation"
          onMouseDown={() => setCreateOpen(false)}
        >
          <form
            className="workflow-create-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              void createWorkflow();
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="workflow-node-library-title">
              <div>
                <span>NEW WORKFLOW</span>
                <strong>Start with a clean decision tree</strong>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)}>
                <X size={17} />
              </button>
            </div>
            <label className="workflow-field">
              <span>Name</span>
              <input
                autoFocus
                required
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
              />
            </label>
            <label className="workflow-field">
              <span>Starting point</span>
              <select
                value={createTemplate}
                onChange={(event) => {
                  const template = event.target.value as typeof createTemplate;
                  setCreateTemplate(template);
                  if (template === "lead-follow-up") setCreateObject("lead");
                  if (template === "project-item-handoff")
                    setCreateObject("project");
                }}
              >
                <option value="blank">Blank workflow</option>
                <option value="lead-follow-up">Lead follow-up template</option>
                <option value="project-item-handoff">
                  Project Item handoff template
                </option>
              </select>
            </label>
            <label className="workflow-field">
              <span>Primary object</span>
              <select
                disabled={createTemplate !== "blank"}
                value={createObject}
                onChange={(event) =>
                  setCreateObject(event.target.value as WorkflowObjectType)
                }
              >
                {(
                  [
                    "contact",
                    "lead",
                    "quote",
                    "project",
                    "item",
                    "communication",
                    "appointment",
                    "payment",
                  ] as WorkflowObjectType[]
                ).map((item) => (
                  <option key={item} value={item}>
                    {item[0].toUpperCase() + item.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <p>
              {createTemplate === "blank"
                ? "The first draft starts with Manual enrollment and End workflow."
                : "Templates create an editable draft. Nothing runs until you review and publish it."}
            </p>
            <button
              className="button primary"
              type="submit"
              disabled={saving || !createName.trim()}
            >
              {saving ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <Sparkles size={15} />
              )}{" "}
              Create workflow
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
