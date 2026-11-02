"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
  Copy,
  Eye,
  GripVertical,
  MonitorSmartphone,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  createQuoteFlowBlock,
  createQuoteFlowStage,
  defaultQuoteFlowDefinition,
  quoteFlowAudiences,
  quoteFlowBlockRegistry,
  quoteFlowBlockTypes,
  quoteFlowConditionFields,
  quoteFlowConditionOperators,
  quoteFlowDefinitionSchema,
  premiumRemodelQuoteFlowDefinition,
  quoteFlowStageRegistry,
  quoteFlowStageTypes,
  type QuoteFlowAudience,
  type QuoteFlowBlock,
  type QuoteFlowCondition,
  type QuoteFlowDefinition,
  type QuoteFlowStage,
} from "@/lib/quote-flow-schema";
import QuoteFlowRenderer from "./quote-flow-renderer";
import styles from "./quote-flow-templates-settings.module.css";

type Template = {
  id: string;
  name: string;
  description: string;
  status: "draft" | "published" | "archived";
  revision: number;
  currentVersion: number;
  publishedVersion: number | null;
  definition: QuoteFlowDefinition;
  isDefault: boolean;
  locked: boolean;
  updatedAt: string;
  versions?: Array<{
    id: string;
    version: number;
    changeNote: string;
    publishedAt: string;
  }>;
};

type Selection = { stageId: string; blockId?: string } | null;
type PreviewMode = "staff" | "customer" | "device";
type AgreementResource = {
  id: string;
  templateKey: string | null;
  name: string;
  sourceType: string;
  publishedVersion: number | null;
};

function demoTemplate(): Template {
  return {
    id: "00000000-0000-4000-8000-000000000101",
    name: "Premium Remodel quote to project",
    description:
      "An editable local preview of the current Premium Remodel process.",
    status: "published",
    revision: 0,
    currentVersion: 1,
    publishedVersion: 1,
    definition: structuredClone(premiumRemodelQuoteFlowDefinition),
    isDefault: true,
    locked: false,
    updatedAt: new Date().toISOString(),
    versions: [],
  };
}

const audienceLabels: Record<QuoteFlowAudience, string> = {
  staff: "Staff only",
  customer: "Customer only",
  both: "Staff & customer",
};

function reorder<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function cloneStage(stage: QuoteFlowStage): QuoteFlowStage {
  const suffix = crypto.randomUUID().slice(0, 8);
  return {
    ...structuredClone(stage),
    id: `${stage.type}_${suffix}`,
    title: `${stage.title} copy`,
    blocks: stage.blocks.map((block) => ({
      ...block,
      id: `${block.type}_${crypto.randomUUID().slice(0, 8)}`,
    })),
  };
}

function newCondition(): QuoteFlowCondition {
  return {
    id: `condition_${crypto.randomUUID().slice(0, 8)}`,
    field: "quote.total",
    fieldKey: null,
    operator: "greater_than_or_equal",
    value: 0,
  };
}

export default function QuoteFlowTemplatesSettings({
  demo,
  canPublish = true,
}: {
  demo: boolean;
  canPublish?: boolean;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [agreementResources, setAgreementResources] = useState<
    AgreementResource[]
  >([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Template | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("staff");
  const [previewStageId, setPreviewStageId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [addStage, setAddStage] = useState("");
  const [addBlock, setAddBlock] = useState("");

  async function load(preferredId?: string) {
    setLoading(true);
    setError("");
    try {
      const [response, resourceResponse] = await Promise.all([
        fetch("/api/quote-flow-templates?includeArchived=true", {
          cache: "no-store",
        }),
        fetch("/api/quote-flow-templates/resources", { cache: "no-store" }),
      ]);
      const [body, resources] = await Promise.all([
        response.json(),
        resourceResponse.json().catch(() => ({ agreements: [] })),
      ]);
      if (!response.ok)
        throw new Error(body.error || "Could not load quote flows.");
      const next = body.templates as Template[];
      if (resourceResponse.ok)
        setAgreementResources(resources.agreements as AgreementResource[]);
      setTemplates(next);
      const id = preferredId || selectedId || next[0]?.id || "";
      if (id) await selectTemplate(id, next);
      else setDraft(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load quote flows.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function selectTemplate(id: string, source = templates) {
    if (dirty && !window.confirm("Discard your unsaved flow changes?")) return;
    setSelectedId(id);
    setError("");
    try {
      const response = await fetch(`/api/quote-flow-templates/${id}`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not load this quote flow.");
      const full = body as Template;
      setDraft(structuredClone(full));
      setSelection({ stageId: full.definition.stages[0]?.id || "" });
      setPreviewStageId(full.definition.stages[0]?.id || "");
      setDirty(false);
      setMessage("");
      if (!source.some((template) => template.id === id))
        setTemplates((items) => [full, ...items]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load this quote flow.",
      );
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (demo) {
        const template = demoTemplate();
        setTemplates([template]);
        setAgreementResources([
          {
            id: "00000000-0000-4000-8000-000000000201",
            templateKey: "premium_remodel_master_services_agreement",
            name: "Master services agreement",
            sourceType: "legacy_premium_msa",
            publishedVersion: 1,
          },
        ]);
        setSelectedId(template.id);
        setDraft(template);
        setSelection({ stageId: template.definition.stages[0].id });
        setPreviewStageId(template.definition.stages[0].id);
        setLoading(false);
      } else void load();
    }, 0);
    return () => window.clearTimeout(timer);
    // Initial load only. Switching is explicit and protects unsaved changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  const selectedStage = useMemo(
    () =>
      draft?.definition.stages.find((stage) => stage.id === selection?.stageId),
    [draft, selection],
  );
  const selectedBlock = useMemo(
    () =>
      selectedStage?.blocks.find((block) => block.id === selection?.blockId),
    [selectedStage, selection],
  );
  const validation = draft
    ? quoteFlowDefinitionSchema.safeParse(draft.definition)
    : null;
  const validationErrors = validation?.success
    ? []
    : validation?.error.issues.map((issue) => issue.message) || [];

  function mutate(change: (template: Template) => Template) {
    if (!draft || draft.locked || draft.status === "archived") return;
    setDraft(change(structuredClone(draft)));
    setDirty(true);
    setMessage("");
  }

  function updateStage(change: Partial<QuoteFlowStage>) {
    if (!selectedStage) return;
    mutate((template) => {
      const stage = template.definition.stages.find(
        (item) => item.id === selectedStage.id,
      );
      if (stage) Object.assign(stage, change);
      return template;
    });
  }

  function updateBlock(change: Partial<QuoteFlowBlock>) {
    if (!selectedStage || !selectedBlock) return;
    mutate((template) => {
      const block = template.definition.stages
        .find((item) => item.id === selectedStage.id)
        ?.blocks.find((item) => item.id === selectedBlock.id);
      if (block) Object.assign(block, change);
      return template;
    });
  }

  function updateConditions(conditions: QuoteFlowStage["conditions"]) {
    if (selectedBlock) updateBlock({ conditions });
    else updateStage({ conditions });
  }

  async function createTemplate() {
    if (demo) {
      const created: Template = {
        ...demoTemplate(),
        id: crypto.randomUUID(),
        name: "New quote flow",
        status: "draft",
        currentVersion: 0,
        publishedVersion: null,
        definition: structuredClone(defaultQuoteFlowDefinition),
        isDefault: false,
      };
      setTemplates((items) => [created, ...items]);
      setSelectedId(created.id);
      setDraft(created);
      setSelection({ stageId: created.definition.stages[0].id });
      setPreviewStageId(created.definition.stages[0].id);
      setDirty(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/quote-flow-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New quote flow",
          description:
            "Configure the stages used from quote through project creation.",
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not create the flow.");
      await load(body.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create the flow.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function duplicateTemplate() {
    if (!draft) return;
    if (demo) {
      const copy: Template = {
        ...structuredClone(draft),
        id: crypto.randomUUID(),
        name: `${draft.name} copy`,
        status: "draft",
        revision: 0,
        currentVersion: 0,
        publishedVersion: null,
        isDefault: false,
      };
      setTemplates((items) => [copy, ...items]);
      setSelectedId(copy.id);
      setDraft(copy);
      setSelection({ stageId: copy.definition.stages[0].id });
      setPreviewStageId(copy.definition.stages[0].id);
      setDirty(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/quote-flow-templates/${draft.id}/duplicate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${draft.name} copy` }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not duplicate the flow.");
      await load(body.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not duplicate the flow.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft || draft.locked || !validation?.success) return;
    if (demo) {
      setDirty(false);
      setMessage("Demo draft saved in this browser session.");
      setTemplates((items) =>
        items.map((item) => (item.id === draft.id ? draft : item)),
      );
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/quote-flow-templates/${draft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: draft.revision,
          name: draft.name,
          description: draft.description,
          definition: draft.definition,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not save the flow.");
      setDraft((current) => current && { ...current, ...body });
      setDirty(false);
      setMessage("Draft saved.");
      setTemplates((items) =>
        items.map((item) =>
          item.id === body.id ? { ...item, ...body } : item,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the flow.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!draft || draft.locked || !validation?.success) return;
    if (demo) {
      const published = {
        ...draft,
        status: "published" as const,
        publishedVersion: (draft.publishedVersion || 0) + 1,
        currentVersion: (draft.currentVersion || 0) + 1,
        revision: draft.revision + 1,
        isDefault: true,
      };
      setDraft(published);
      setTemplates((items) =>
        items.map((item) => ({
          ...(item.id === draft.id ? published : item),
          isDefault: item.id === draft.id,
        })),
      );
      setDirty(false);
      setMessage(
        `Demo version ${published.publishedVersion} published as the default.`,
      );
      return;
    }
    if (dirty) await save();
    setBusy(true);
    setError("");
    try {
      const latestResponse = await fetch(
        `/api/quote-flow-templates/${draft.id}`,
        { cache: "no-store" },
      );
      const latest = await latestResponse.json();
      if (!latestResponse.ok)
        throw new Error(latest.error || "Could not reload the flow.");
      const response = await fetch(
        `/api/quote-flow-templates/${draft.id}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: latest.revision,
            changeNote: `Published from the visual flow builder`,
            makeDefault: true,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not publish the flow.");
      setMessage(
        `Published version ${body.publishedVersion} as the organization default.`,
      );
      await load(body.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not publish the flow.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchived() {
    if (!draft || draft.locked || draft.isDefault) return;
    const archived = draft.status !== "archived";
    if (
      archived &&
      !window.confirm(
        "Archive this flow? Existing quotes keep their pinned version.",
      )
    )
      return;
    if (demo) {
      const next = {
        ...draft,
        status: archived
          ? ("archived" as const)
          : draft.publishedVersion
            ? ("published" as const)
            : ("draft" as const),
      };
      setDraft(next);
      setTemplates((items) =>
        items.map((item) => (item.id === next.id ? next : item)),
      );
      setMessage(archived ? "Flow archived." : "Flow restored.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/quote-flow-templates/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not update this flow.");
      await load(body.id);
      setMessage(archived ? "Flow archived." : "Flow restored.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update this flow.",
      );
    } finally {
      setBusy(false);
    }
  }

  function addStageToFlow() {
    if (!addStage) return;
    const stage = createQuoteFlowStage(
      addStage as (typeof quoteFlowStageTypes)[number],
    );
    mutate((template) => {
      template.definition.stages.push(stage);
      return template;
    });
    setSelection({ stageId: stage.id });
    setPreviewStageId(stage.id);
    setAddStage("");
  }

  function addBlockToStage() {
    if (!selectedStage || !addBlock) return;
    const block = createQuoteFlowBlock(
      addBlock as (typeof quoteFlowBlockTypes)[number],
    );
    mutate((template) => {
      template.definition.stages
        .find((stage) => stage.id === selectedStage.id)
        ?.blocks.push(block);
      return template;
    });
    setSelection({ stageId: selectedStage.id, blockId: block.id });
    setAddBlock("");
  }

  return (
    <section className={styles.section} aria-label="Quote and agreement flows">
      <header className={styles.heading}>
        <div>
          <span>QUOTE & AGREEMENT FLOWS</span>
          <h2>Build the process around the quote.</h2>
          <p>
            Arrange staff work, customer forms, documents, signatures, payment,
            and project creation without changing code.
          </p>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={() => void createTemplate()}
          disabled={busy}
        >
          <Plus size={15} /> New flow
        </button>
      </header>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="success-note" role="status">
          {message}
        </div>
      )}
      {loading ? (
        <p className={styles.loading}>Loading quote flows…</p>
      ) : !draft ? (
        <div className={styles.blank}>
          <p>No quote flow templates yet.</p>
          <button
            className="button primary"
            onClick={() => void createTemplate()}
          >
            Create the first flow
          </button>
        </div>
      ) : (
        <div className={styles.builder}>
          <aside className={styles.library}>
            <div className={styles.panelHeading}>
              <strong>Flows</strong>
              <span>{templates.length}</span>
            </div>
            <div className={styles.templateList}>
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={
                    template.id === selectedId ? styles.selectedTemplate : ""
                  }
                  onClick={() => void selectTemplate(template.id)}
                >
                  <strong>{template.name}</strong>
                  <span>
                    {template.isDefault ? "Default · " : ""}
                    {template.status}
                    {template.publishedVersion
                      ? ` · v${template.publishedVersion}`
                      : ""}
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.panelHeading}>
              <strong>Stages</strong>
              <span>{draft.definition.stages.length}</span>
            </div>
            <ol className={styles.stageList}>
              {draft.definition.stages.map((stage, index) => (
                <li
                  key={stage.id}
                  draggable={!draft.locked}
                  onDragStart={(event) =>
                    event.dataTransfer.setData(
                      "application/x-servicebuddy-stage",
                      String(index),
                    )
                  }
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    const from = Number(
                      event.dataTransfer.getData(
                        "application/x-servicebuddy-stage",
                      ),
                    );
                    if (!Number.isInteger(from) || from === index) return;
                    mutate((template) => ({
                      ...template,
                      definition: {
                        ...template.definition,
                        stages: reorder(
                          template.definition.stages,
                          from,
                          index,
                        ),
                      },
                    }));
                  }}
                >
                  <button
                    type="button"
                    className={
                      selection?.stageId === stage.id && !selection.blockId
                        ? styles.selectedRow
                        : ""
                    }
                    onClick={() => {
                      setSelection({ stageId: stage.id });
                      setPreviewStageId(stage.id);
                    }}
                  >
                    <GripVertical size={14} />
                    <span>{index + 1}</span>
                    <p>
                      <strong>{stage.title}</strong>
                      <small>{quoteFlowStageRegistry[stage.type].label}</small>
                    </p>
                    {!stage.enabled && <em>Off</em>}
                  </button>
                  {stage.blocks.map((block, blockIndex) => (
                    <button
                      key={block.id}
                      type="button"
                      draggable={!draft.locked}
                      className={
                        selection?.blockId === block.id
                          ? styles.selectedBlockRow
                          : styles.blockRow
                      }
                      onClick={() => {
                        setSelection({ stageId: stage.id, blockId: block.id });
                        setPreviewStageId(stage.id);
                      }}
                      onDragStart={(event) => {
                        event.stopPropagation();
                        event.dataTransfer.setData(
                          "application/x-servicebuddy-block",
                          JSON.stringify({
                            stageId: stage.id,
                            index: blockIndex,
                          }),
                        );
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.stopPropagation();
                        const raw = event.dataTransfer.getData(
                          "application/x-servicebuddy-block",
                        );
                        if (!raw) return;
                        const source = JSON.parse(raw) as {
                          stageId: string;
                          index: number;
                        };
                        mutate((template) => {
                          const sourceStage = template.definition.stages.find(
                            (item) => item.id === source.stageId,
                          );
                          const targetStage = template.definition.stages.find(
                            (item) => item.id === stage.id,
                          );
                          if (!sourceStage || !targetStage) return template;
                          const [moving] = sourceStage.blocks.splice(
                            source.index,
                            1,
                          );
                          targetStage.blocks.splice(blockIndex, 0, moving);
                          return template;
                        });
                      }}
                    >
                      <GripVertical size={12} />
                      <span>{block.label}</span>
                      {block.required && <em>Required</em>}
                    </button>
                  ))}
                </li>
              ))}
            </ol>
            {!draft.locked && (
              <div className={styles.addRow}>
                <select
                  aria-label="Stage type"
                  value={addStage}
                  onChange={(event) => setAddStage(event.target.value)}
                >
                  <option value="">Add stage…</option>
                  {quoteFlowStageTypes.map((type) => (
                    <option key={type} value={type}>
                      {quoteFlowStageRegistry[type].label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addStageToFlow}
                  disabled={!addStage}
                  aria-label="Add selected stage"
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
          </aside>

          <main className={styles.workspace}>
            <header className={styles.workspaceHeader}>
              <div>
                <input
                  aria-label="Flow name"
                  value={draft.name}
                  readOnly={draft.locked}
                  onChange={(event) =>
                    mutate((template) => ({
                      ...template,
                      name: event.target.value,
                    }))
                  }
                />
                <span>
                  {dirty
                    ? "Unsaved draft"
                    : draft.isDefault
                      ? "Organization default"
                      : draft.status}
                </span>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => void duplicateTemplate()}
                  disabled={busy}
                >
                  <Copy size={14} /> Duplicate
                </button>
                {!draft.locked && draft.status !== "archived" && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => void save()}
                    disabled={busy || !dirty || validationErrors.length > 0}
                  >
                    <Save size={14} /> Save draft
                  </button>
                )}
                {!draft.locked && draft.status !== "archived" && canPublish && (
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => void publish()}
                    disabled={busy || validationErrors.length > 0}
                  >
                    <Send size={14} /> Publish
                  </button>
                )}
                {!draft.locked && !draft.isDefault && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => void toggleArchived()}
                    disabled={busy}
                  >
                    {draft.status === "archived" ? (
                      <>
                        <RotateCcw size={14} /> Restore
                      </>
                    ) : (
                      <>
                        <Archive size={14} /> Archive
                      </>
                    )}
                  </button>
                )}
              </div>
            </header>
            {draft.locked && (
              <div className={styles.lockedNote}>
                <Check size={14} /> This is the unchanged Premium Remodel
                compatibility flow. Duplicate it to create an editable version.
              </div>
            )}
            {draft.versions && draft.versions.length > 0 && (
              <details className={styles.versionHistory}>
                <summary>
                  Version history · {draft.versions.length} published
                </summary>
                {draft.versions.map((version) => (
                  <div key={version.id}>
                    <strong>Version {version.version}</strong>
                    <span>{version.changeNote || "Published flow"}</span>
                    <time dateTime={version.publishedAt}>
                      {new Date(version.publishedAt).toLocaleString()}
                    </time>
                  </div>
                ))}
              </details>
            )}
            {validationErrors.length > 0 && (
              <div className={styles.validation}>
                <strong>Fix before publishing</strong>
                {[...new Set(validationErrors)].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            )}
            <div className={styles.previewBar}>
              <span>
                <Eye size={14} /> Preview
              </span>
              <button
                className={previewMode === "staff" ? styles.activePreview : ""}
                onClick={() => setPreviewMode("staff")}
              >
                <UsersRound size={14} /> Staff
              </button>
              <button
                className={
                  previewMode === "customer" ? styles.activePreview : ""
                }
                onClick={() => setPreviewMode("customer")}
              >
                <UserRound size={14} /> Customer portal
              </button>
              <button
                className={previewMode === "device" ? styles.activePreview : ""}
                onClick={() => setPreviewMode("device")}
              >
                <MonitorSmartphone size={14} /> On device
              </button>
            </div>
            <QuoteFlowRenderer
              definition={draft.definition}
              audience={previewMode === "staff" ? "staff" : "customer"}
              mode={
                previewMode === "staff"
                  ? "staff"
                  : previewMode === "customer"
                    ? "portal"
                    : "device"
              }
              activeStageId={previewStageId}
            />
          </main>

          <aside className={styles.inspector}>
            <div className={styles.panelHeading}>
              <strong>
                {selectedBlock ? "Block settings" : "Stage settings"}
              </strong>
              <ChevronDown size={14} />
            </div>
            {selectedStage ? (
              <div className={styles.inspectorForm}>
                <label>
                  Label
                  <input
                    value={selectedBlock?.label || selectedStage.title}
                    readOnly={draft.locked}
                    onChange={(event) =>
                      selectedBlock
                        ? updateBlock({ label: event.target.value })
                        : updateStage({ title: event.target.value })
                    }
                  />
                </label>
                <label>
                  Description
                  <textarea
                    value={
                      selectedBlock?.description || selectedStage.description
                    }
                    readOnly={draft.locked}
                    onChange={(event) =>
                      selectedBlock
                        ? updateBlock({ description: event.target.value })
                        : updateStage({ description: event.target.value })
                    }
                  />
                </label>
                <label>
                  Visible to
                  <select
                    value={selectedBlock?.audience || selectedStage.audience}
                    disabled={draft.locked}
                    onChange={(event) =>
                      selectedBlock
                        ? updateBlock({
                            audience: event.target.value as QuoteFlowAudience,
                          })
                        : updateStage({
                            audience: event.target.value as QuoteFlowAudience,
                          })
                    }
                  >
                    {quoteFlowAudiences.map((audience) => (
                      <option key={audience} value={audience}>
                        {audienceLabels[audience]}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedBlock && (
                  <label>
                    Data binding
                    <input
                      value={selectedBlock.bindingKey || ""}
                      readOnly={draft.locked}
                      placeholder="custom.field_name"
                      onChange={(event) =>
                        updateBlock({ bindingKey: event.target.value || null })
                      }
                    />
                  </label>
                )}
                <div className={styles.toggles}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedBlock?.enabled ?? selectedStage.enabled}
                      disabled={draft.locked}
                      onChange={(event) =>
                        selectedBlock
                          ? updateBlock({ enabled: event.target.checked })
                          : updateStage({ enabled: event.target.checked })
                      }
                    />{" "}
                    Enabled
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={
                        selectedBlock?.required ?? selectedStage.required
                      }
                      disabled={draft.locked}
                      onChange={(event) =>
                        selectedBlock
                          ? updateBlock({ required: event.target.checked })
                          : updateStage({ required: event.target.checked })
                      }
                    />{" "}
                    Required
                  </label>
                </div>
                {selectedBlock &&
                  ["custom_select", "custom_multiselect"].includes(
                    selectedBlock.type,
                  ) && (
                    <label>
                      Options
                      <textarea
                        value={
                          Array.isArray(selectedBlock.config.options)
                            ? selectedBlock.config.options.join("\n")
                            : ""
                        }
                        readOnly={draft.locked}
                        placeholder={"Option one\nOption two"}
                        onChange={(event) =>
                          updateBlock({
                            config: {
                              ...selectedBlock.config,
                              options: event.target.value
                                .split("\n")
                                .map((item) => item.trim())
                                .filter(Boolean),
                            },
                          })
                        }
                      />
                    </label>
                  )}
                {selectedBlock &&
                  ["uploaded_pdf", "generated_document"].includes(
                    selectedBlock.type,
                  ) && (
                    <label>
                      Agreement template
                      <select
                        value={String(
                          selectedBlock.config.templateId ||
                            agreementResources.find(
                              (item) =>
                                item.templateKey ===
                                selectedBlock.config.templateKey,
                            )?.id ||
                            "",
                        )}
                        disabled={draft.locked}
                        onChange={(event) => {
                          const resource = agreementResources.find(
                            (item) => item.id === event.target.value,
                          );
                          updateBlock({
                            config: {
                              ...selectedBlock.config,
                              templateId: resource?.id || null,
                              templateKey: resource?.templateKey || null,
                              templateVersion:
                                resource?.publishedVersion || null,
                            },
                          });
                        }}
                      >
                        <option value="">Choose a published agreement…</option>
                        {agreementResources.map((resource) => (
                          <option key={resource.id} value={resource.id}>
                            {resource.name} · v{resource.publishedVersion}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                {selectedBlock?.type === "internal_approval" && (
                  <fieldset className={styles.signingMethods}>
                    <legend>Roles allowed to approve</legend>
                    {[
                      ["owner", "Owner"],
                      ["admin", "Administrator"],
                      ["office", "Office"],
                      ["field", "Field"],
                      ["crew", "Crew"],
                    ].map(([role, label]) => {
                      const configured = Array.isArray(
                        selectedBlock.config.allowedRoles,
                      )
                        ? selectedBlock.config.allowedRoles.map(String)
                        : ["owner", "admin"];
                      return (
                        <label key={role}>
                          <input
                            type="checkbox"
                            checked={configured.includes(role)}
                            disabled={draft.locked}
                            onChange={(event) =>
                              updateBlock({
                                config: {
                                  ...selectedBlock.config,
                                  allowedRoles: event.target.checked
                                    ? [...new Set([...configured, role])]
                                    : configured.filter(
                                        (candidate) => candidate !== role,
                                      ),
                                },
                              })
                            }
                          />
                          {label}
                        </label>
                      );
                    })}
                  </fieldset>
                )}
                {selectedBlock?.type === "deposit_collection" && (
                  <>
                    <label>
                      Amount calculation
                      <select
                        value={String(
                          selectedBlock.config.amountMode || "percent",
                        )}
                        disabled={draft.locked}
                        onChange={(event) =>
                          updateBlock({
                            config: {
                              ...selectedBlock.config,
                              amountMode: event.target.value,
                            },
                          })
                        }
                      >
                        <option value="percent">Percent of quote</option>
                        <option value="fixed">Fixed amount</option>
                        <option value="remaining">
                          Remaining quote balance
                        </option>
                      </select>
                    </label>
                    {String(selectedBlock.config.amountMode || "percent") !==
                      "remaining" && (
                      <label>
                        {String(
                          selectedBlock.config.amountMode || "percent",
                        ) === "fixed"
                          ? "Amount"
                          : "Percent"}
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={Number(
                            String(
                              selectedBlock.config.amountMode || "percent",
                            ) === "fixed"
                              ? selectedBlock.config.amount || 0
                              : selectedBlock.config.percent || 100,
                          )}
                          disabled={draft.locked}
                          onChange={(event) =>
                            updateBlock({
                              config: {
                                ...selectedBlock.config,
                                [String(
                                  selectedBlock.config.amountMode || "percent",
                                ) === "fixed"
                                  ? "amount"
                                  : "percent"]: Number(event.target.value),
                              },
                            })
                          }
                        />
                      </label>
                    )}
                    <fieldset className={styles.signingMethods}>
                      <legend>Payment methods</legend>
                      {[
                        ["stripe", "Online card payment"],
                        ["manual", "Record check, cash, or transfer"],
                      ].map(([provider, label]) => {
                        const configured = Array.isArray(
                          selectedBlock.config.providers,
                        )
                          ? selectedBlock.config.providers.map(String)
                          : ["stripe", "manual"];
                        return (
                          <label key={provider}>
                            <input
                              type="checkbox"
                              checked={configured.includes(provider)}
                              disabled={draft.locked}
                              onChange={(event) =>
                                updateBlock({
                                  config: {
                                    ...selectedBlock.config,
                                    providers: event.target.checked
                                      ? [...new Set([...configured, provider])]
                                      : configured.filter(
                                          (candidate) => candidate !== provider,
                                        ),
                                  },
                                })
                              }
                            />
                            {label}
                          </label>
                        );
                      })}
                    </fieldset>
                  </>
                )}
                {selectedBlock &&
                  ["signature", "initials"].includes(selectedBlock.type) && (
                    <>
                      <label>
                        Signer role
                        <input
                          value={String(
                            selectedBlock.config.signerRoleId || "customer",
                          )}
                          readOnly={draft.locked}
                          onChange={(event) =>
                            updateBlock({
                              config: {
                                ...selectedBlock.config,
                                signerRoleId: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        Signing order
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={Number(selectedBlock.config.order || 1)}
                          disabled={draft.locked}
                          onChange={(event) =>
                            updateBlock({
                              config: {
                                ...selectedBlock.config,
                                order: Math.max(1, Number(event.target.value)),
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        Required acknowledgment
                        <textarea
                          value={String(
                            selectedBlock.config.acknowledgment || "",
                          )}
                          readOnly={draft.locked}
                          placeholder={
                            selectedBlock.type === "initials"
                              ? "I reviewed and acknowledge this section."
                              : "I reviewed this section and intend this electronic signature to be binding."
                          }
                          onChange={(event) =>
                            updateBlock({
                              config: {
                                ...selectedBlock.config,
                                acknowledgment: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      <fieldset className={styles.signingMethods}>
                        <legend>Signing methods</legend>
                        {(
                          [
                            ["remote", "Customer portal"],
                            ["onsite", "ServiceBuddy device"],
                            ["in_person", "Mark signed in person"],
                            ["on_behalf", "Authorized sign on behalf"],
                          ] as const
                        ).map(([method, label]) => {
                          const configured = Array.isArray(
                            selectedBlock.config.methods,
                          )
                            ? selectedBlock.config.methods.map(String)
                            : ["remote", "onsite", "in_person"];
                          return (
                            <label key={method}>
                              <input
                                type="checkbox"
                                checked={configured.includes(method)}
                                disabled={draft.locked}
                                onChange={(event) => {
                                  const methods = event.target.checked
                                    ? [...new Set([...configured, method])]
                                    : configured.filter(
                                        (candidate) => candidate !== method,
                                      );
                                  updateBlock({
                                    config: {
                                      ...selectedBlock.config,
                                      methods,
                                    },
                                  });
                                }}
                              />
                              {label}
                            </label>
                          );
                        })}
                      </fieldset>
                    </>
                  )}
                <fieldset className={styles.conditions}>
                  <legend>Conditions</legend>
                  <select
                    value={
                      (selectedBlock?.conditions || selectedStage.conditions)
                        .mode
                    }
                    disabled={draft.locked}
                    onChange={(event) =>
                      selectedBlock
                        ? updateBlock({
                            conditions: {
                              ...selectedBlock.conditions,
                              mode: event.target.value as "all" | "any",
                            },
                          })
                        : updateStage({
                            conditions: {
                              ...selectedStage.conditions,
                              mode: event.target.value as "all" | "any",
                            },
                          })
                    }
                  >
                    <option value="all">Match all rules</option>
                    <option value="any">Match any rule</option>
                  </select>
                  {(
                    selectedBlock?.conditions || selectedStage.conditions
                  ).rules.map((rule, index) => (
                    <div key={rule.id} className={styles.conditionRule}>
                      <select
                        value={rule.field}
                        disabled={draft.locked}
                        onChange={(event) => {
                          const conditions = structuredClone(
                            selectedBlock?.conditions ||
                              selectedStage.conditions,
                          );
                          conditions.rules[index].field = event.target
                            .value as QuoteFlowCondition["field"];
                          updateConditions(conditions);
                        }}
                      >
                        {quoteFlowConditionFields.map((field) => (
                          <option key={field}>{field}</option>
                        ))}
                      </select>
                      <select
                        value={rule.operator}
                        disabled={draft.locked}
                        onChange={(event) => {
                          const conditions = structuredClone(
                            selectedBlock?.conditions ||
                              selectedStage.conditions,
                          );
                          conditions.rules[index].operator = event.target
                            .value as QuoteFlowCondition["operator"];
                          updateConditions(conditions);
                        }}
                      >
                        {quoteFlowConditionOperators.map((operator) => (
                          <option key={operator}>
                            {operator.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                      {!["is_empty", "is_not_empty"].includes(
                        rule.operator,
                      ) && (
                        <input
                          value={String(rule.value ?? "")}
                          readOnly={draft.locked}
                          placeholder="Value"
                          onChange={(event) => {
                            const conditions = structuredClone(
                              selectedBlock?.conditions ||
                                selectedStage.conditions,
                            );
                            conditions.rules[index].value = event.target.value;
                            updateConditions(conditions);
                          }}
                        />
                      )}
                      {!draft.locked && (
                        <button
                          type="button"
                          aria-label="Remove condition"
                          onClick={() => {
                            const conditions = structuredClone(
                              selectedBlock?.conditions ||
                                selectedStage.conditions,
                            );
                            conditions.rules.splice(index, 1);
                            updateConditions(conditions);
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                  {!draft.locked && (
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() => {
                        const conditions = structuredClone(
                          selectedBlock?.conditions || selectedStage.conditions,
                        );
                        conditions.rules.push(newCondition());
                        updateConditions(conditions);
                      }}
                    >
                      <Plus size={13} /> Add condition
                    </button>
                  )}
                </fieldset>
                {selectedBlock
                  ? !draft.locked && (
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => {
                          mutate((template) => {
                            const stage = template.definition.stages.find(
                              (item) => item.id === selectedStage.id,
                            );
                            if (stage)
                              stage.blocks = stage.blocks.filter(
                                (item) => item.id !== selectedBlock.id,
                              );
                            return template;
                          });
                          setSelection({ stageId: selectedStage.id });
                        }}
                      >
                        <Trash2 size={14} /> Remove block
                      </button>
                    )
                  : !draft.locked && (
                      <div className={styles.stageButtons}>
                        <button
                          type="button"
                          onClick={() =>
                            mutate((template) => {
                              const index =
                                template.definition.stages.findIndex(
                                  (item) => item.id === selectedStage.id,
                                );
                              const copy = cloneStage(selectedStage);
                              template.definition.stages.splice(
                                index + 1,
                                0,
                                copy,
                              );
                              setSelection({ stageId: copy.id });
                              return template;
                            })
                          }
                        >
                          <Copy size={14} /> Duplicate stage
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (draft.definition.stages.length <= 1) return;
                            mutate((template) => ({
                              ...template,
                              definition: {
                                ...template.definition,
                                stages: template.definition.stages.filter(
                                  (item) => item.id !== selectedStage.id,
                                ),
                              },
                            }));
                            const next = draft.definition.stages.find(
                              (item) => item.id !== selectedStage.id,
                            );
                            setSelection(next ? { stageId: next.id } : null);
                          }}
                        >
                          <Trash2 size={14} /> Remove stage
                        </button>
                      </div>
                    )}
                {!selectedBlock && !draft.locked && (
                  <div className={styles.addRow}>
                    <select
                      aria-label="Block type"
                      value={addBlock}
                      onChange={(event) => setAddBlock(event.target.value)}
                    >
                      <option value="">Add block…</option>
                      {quoteFlowBlockTypes.map((type) => (
                        <option key={type} value={type}>
                          {quoteFlowBlockRegistry[type].label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addBlockToStage}
                      disabled={!addBlock}
                      aria-label="Add selected block"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className={styles.inspectorEmpty}>Select a stage or block.</p>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
