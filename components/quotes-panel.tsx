"use client";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  FileUp,
  RotateCcw,
  Tablet,
  Trash2,
} from "lucide-react";
import {
  quoteStatuses,
  type Attachment,
  type Entity,
  type EntityKind,
  type Quote,
  type ScopeItem,
  type User,
  type Workspace,
} from "@/lib/types";
import { projectFinances, scopeTotal } from "@/lib/project-finances";
import { msaPaymentRows } from "@/lib/msa-contract";
import { DEFAULT_QUOTE_PROJECT_NAME } from "@/lib/scope-projects";
import { orderedScopeItems } from "@/lib/scope-order";
import { Empty } from "./ui";
import type { Editor } from "./entity-form";
import ScopeTable from "./scope-table";
import FilesPanel from "./files-panel";
import QuotePhotosPanel from "./quote-photos-panel";
import QuoteImportDialog from "./quote-import-dialog";
import MsaDraftPanel from "./msa-draft-panel";
import type { ImportedQuote } from "@/lib/quote-import";
import QuoteProjectHandoffDemo from "./quote-project-handoff-demo";
import { QUOTE_HANDOFF_DEMO_ID } from "@/lib/demo-quote-handoff";
import QuoteWorkflowStepper, {
  type QuoteWorkflowStep,
} from "./quote-workflow-stepper";
import MsaSigningPanel from "./msa-signing-panel";
import RoomScansPanel from "./room-scans-panel";
import QuoteCustomerPreview from "./quote-customer-preview";
import displayStyles from "./quote-display-control.module.css";
import {
  quotePriceDisplayOptions,
  resolveQuotePriceDisplay,
} from "@/lib/quote-price-display";
import { useRegionalFormat } from "./regional-format-context";
import AgreementPacketPanel from "./agreement-packet-panel";
import QuoteFlowRenderer from "./quote-flow-renderer";
import QuoteFlowInPersonControl from "./quote-flow-in-person-control";
import QuoteFlowFileControl from "./quote-flow-file-control";
import QuoteFlowPaymentControl from "./quote-flow-payment-control";
import {
  quoteFlowConditionsMatch,
  type QuoteFlowCondition,
  type QuoteFlowDefinition,
  type QuoteFlowStage,
} from "@/lib/quote-flow-schema";

type QuoteFlowInstanceDto = {
  id: string;
  status: "active" | "completed" | "cancelled";
  currentStageId: string;
  definition: QuoteFlowDefinition;
  values: Array<{
    stageId: string;
    blockId: string;
    value: unknown;
  }>;
  events: Array<{
    id: string;
    stageId: string;
    blockId: string;
    eventType: string;
    actorName: string | null;
    createdAt: string;
  }>;
};

function legacyStepForStage(stage: QuoteFlowStage): QuoteWorkflowStep | null {
  if (
    stage.type === "quote_builder" &&
    stage.blocks.some(
      (block) => block.config.renderer === "premium_quote_builder_v1",
    )
  )
    return "quote";
  if (
    stage.type === "agreement_details" &&
    stage.blocks.some(
      (block) => block.config.renderer === "legacy_premium_msa_v1",
    )
  )
    return "agreement";
  if (
    stage.type === "delivery" &&
    stage.blocks.some(
      (block) => block.config.renderer === "legacy_quote_portal_v1",
    )
  )
    return "completion";
  if (
    stage.type === "project_conversion" &&
    stage.blocks.some(
      (block) => block.config.renderer === "premium_quote_promotion_v1",
    )
  )
    return "project";
  return null;
}

function agreementTemplateForStage(
  definition: QuoteFlowDefinition,
  stageId: string,
) {
  const stageIndex = definition.stages.findIndex(
    (stage) => stage.id === stageId,
  );
  for (let index = stageIndex; index >= 0; index -= 1) {
    const document = [...definition.stages[index].blocks]
      .reverse()
      .find(
        (block) =>
          block.enabled &&
          ["uploaded_pdf", "generated_document"].includes(block.type) &&
          typeof block.config.templateId === "string",
      );
    if (document) return String(document.config.templateId);
  }
  return null;
}

export default function QuotesPanel({
  workspace,
  search,
  onNew,
  onOpen,
  onImport,
  onSaveQuote,
  demo,
}: {
  workspace: Workspace;
  search: string;
  onNew: () => void;
  onOpen: (id: string) => void;
  onImport: (
    quotes: ImportedQuote[],
    options: { combine: boolean; combinedName: string },
  ) => Promise<void>;
  onSaveQuote: (
    data: Record<string, unknown>,
    quote: Quote,
  ) => Promise<unknown>;
  demo: boolean;
}) {
  const regional = useRegionalFormat();
  const [filter, setFilter] = useState("All quotes");
  const [importOpen, setImportOpen] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [actionError, setActionError] = useState("");
  const quotes = workspace.quotes || [];
  const activeQuotes = quotes.filter((quote) => !quote.junkedAt);
  const visible = quotes
    .filter(
      (quote) =>
        (filter === "Junk"
          ? Boolean(quote.junkedAt)
          : !quote.junkedAt &&
            (filter === "All quotes" || quote.status === filter)) &&
        `${quote.name} ${quote.client} ${quote.address} ${quote.clientEmail || ""} ${quote.clientPhone || ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const sent = activeQuotes.filter((quote) => quote.status === "Sent");
  const sentCount = activeQuotes.filter((quote) =>
    Boolean(quote.quoteSentAt),
  ).length;
  const wonCount =
    workspace.projects.filter((project) => Boolean(project.quoteAcceptedAt))
      .length +
    activeQuotes.filter((quote) => quote.status === "Accepted").length;
  const closeRate =
    sentCount > 0 ? Math.round((wonCount / sentCount) * 1000) / 10 : 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">BEFORE THE WORK BEGINS</span>
          <h1>
            Quotes<span className="heading-dot">.</span>
          </h1>
          <p>
            Track quotes through customer approval, agreement signing, and the
            deposit before work moves into Projects.
          </p>
        </div>
        <div className="project-actions">
          {!demo && (
            <button
              className="button secondary"
              onClick={() => setImportOpen(true)}
            >
              <FileUp size={16} /> Import PDFs
            </button>
          )}
          <button className="button primary" onClick={onNew}>
            <Plus size={17} /> New quote
          </button>
        </div>
      </div>
      <div className="quote-summary">
        <FileText size={20} />
        <div>
          <strong>
            {sent.length} {sent.length === 1 ? "quote" : "quotes"} awaiting a
            decision
          </strong>
          <span>
            {regional.money(
              sent.reduce(
                (sum, quote) => sum + scopeTotal(workspace.scope, quote.id),
                0,
              ),
            )}{" "}
            in sent quotes
          </span>
        </div>
      </div>
      <div className="quote-close-rate" aria-label="Close rate">
        <article>
          <strong>{sentCount}</strong>
          <span>Quotes sent</span>
        </article>
        <article>
          <strong>{wonCount}</strong>
          <span>Quotes won</span>
        </article>
        <article>
          <strong>{closeRate}%</strong>
          <span>Close rate (won ÷ sent)</span>
        </article>
      </div>
      <div className="filter-tabs quote-filters" aria-label="Filter quotes">
        {["All quotes", ...quoteStatuses, "Junk"].map((status) => (
          <button
            key={status}
            className={status === filter ? "active" : ""}
            aria-pressed={status === filter}
            onClick={() => setFilter(status)}
          >
            {status}
            <span>
              {status === "All quotes"
                ? activeQuotes.length
                : status === "Junk"
                  ? quotes.filter((quote) => Boolean(quote.junkedAt)).length
                  : activeQuotes.filter((quote) => quote.status === status)
                      .length}
            </span>
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className="quote-list">
          {visible.map((quote) => {
            const isJunk = Boolean(quote.junkedAt);
            return (
              <div className="quote-row" key={quote.id}>
                <button
                  type="button"
                  className="quote-row-open"
                  onClick={() => onOpen(quote.id)}
                >
                  <div className="quote-row-info">
                    <strong>{quote.name}</strong>
                    <span>{quote.client || "No client added"}</span>
                    <small>
                      <MapPin size={12} />
                      {quote.address || "No address added"}
                    </small>
                  </div>
                  <div className="quote-row-price">
                    <strong>
                      {regional.money(scopeTotal(workspace.scope, quote.id))}
                    </strong>
                    <span>Scope total</span>
                  </div>
                  <div className="quote-row-status">
                    <span
                      className={`quote-status quote-status-${quote.status.toLowerCase()}`}
                    >
                      {quote.status}
                    </span>
                    <small>
                      {quote.status === "Sent" && quote.quoteSentAt
                        ? `Sent ${regional.date(quote.quoteSentAt)}`
                        : `Updated ${regional.date(quote.updatedAt)}`}
                    </small>
                  </div>
                </button>
                <button
                  type="button"
                  className={`row-junk-action ${isJunk ? "restore" : ""}`}
                  aria-label={
                    isJunk
                      ? `Restore ${quote.name} to quotes`
                      : `Move ${quote.name} to junk`
                  }
                  title={isJunk ? "Restore to Quotes" : "Move to Junk"}
                  disabled={savingId === quote.id}
                  onClick={async () => {
                    setSavingId(quote.id);
                    setActionError("");
                    try {
                      await onSaveQuote(
                        {
                          ...quote,
                          junkedAt: isJunk ? null : new Date().toISOString(),
                        },
                        quote,
                      );
                    } catch (error) {
                      setActionError(
                        error instanceof Error
                          ? error.message
                          : "Could not update this quote.",
                      );
                    } finally {
                      setSavingId("");
                    }
                  }}
                >
                  {isJunk ? (
                    <RotateCcw size={16} aria-hidden="true" />
                  ) : (
                    <Trash2 size={16} aria-hidden="true" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty
          title={
            quotes.length
              ? "No matching quotes"
              : "Your next project starts with a quote"
          }
          text={
            quotes.length
              ? "Try another status or search."
              : "Add a lead, build the scope and price, then mark the quote as sent."
          }
          action={
            <button className="button secondary" onClick={onNew}>
              <Plus size={15} />
              New quote
            </button>
          }
        />
      )}
      {actionError && (
        <div className="alert quote-list-alert" role="alert">
          {actionError}
        </div>
      )}
      {importOpen && (
        <QuoteImportDialog
          onClose={() => setImportOpen(false)}
          onImport={onImport}
        />
      )}
    </>
  );
}

export function QuoteDetail({
  quote,
  workspace,
  user,
  config,
  demo,
  onBack,
  onEdit,
  onSave,
  onReorderScope,
  onPriceScope,
  onAccept,
  onDelete,
  onUpload,
  onSent,
  onProjectReady,
}: {
  quote: Quote;
  workspace: Workspace;
  user: User;
  config: import("@/lib/business-config").BusinessConfig;
  demo: boolean;
  onBack: () => void;
  onEdit: (editor: Editor) => void;
  onSave: (
    kind: EntityKind,
    data: Record<string, unknown>,
    entity?: Entity,
  ) => Promise<Entity>;
  onReorderScope: (
    quoteId: string,
    items: ScopeItem[],
    movingId: string,
  ) => Promise<ScopeItem[]>;
  onPriceScope: (
    quoteId: string,
    items: ScopeItem[],
    subMultiplier: number,
    materialMultiplier: number,
  ) => Promise<ScopeItem[]>;
  onAccept: (quote: Quote) => Promise<void>;
  onDelete: (kind: EntityKind, entity: Entity) => void;
  onUpload: (file: File, projectId: string) => Promise<Attachment>;
  onSent: () => Promise<void>;
  onProjectReady: (id: string) => void;
}) {
  const regional = useRegionalFormat();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendRequestId, setSendRequestId] = useState("");
  const [onsiteBusy, setOnsiteBusy] = useState(false);
  const clientFirstName = quote.client.trim().split(/\s+/)[0] || "there";
  const senderFirstName = user.name.trim().split(/\s+/)[0] || "The team";
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [checkRequestId, setCheckRequestId] = useState(() =>
    crypto.randomUUID(),
  );
  const items = orderedScopeItems(
    workspace.scope.filter((item) => item.projectId === quote.id),
  );
  const files = workspace.attachments.filter(
    (file) => file.projectId === quote.id,
  );
  const finances = projectFinances(quote, items);
  const overviewPhotos = (quote.quotePhotos || [])
    .flatMap((photo) => {
      const file = files.find(
        (candidate) => candidate.id === photo.attachmentId,
      );
      return file ? [{ photo, file }] : [];
    })
    .slice(0, 2);
  const signedScope =
    quote.status === "Accepted" && Boolean(quote.quoteAcceptance);
  const signedMsa = quote.msaAgreement?.status === "signed";
  const depositCents = signedMsa
    ? Math.round(msaPaymentRows(quote.msaAgreement!)[0]?.amount * 100)
    : 0;
  const paidCents = (workspace.activities || [])
    .filter(
      (item) =>
        item.projectId === quote.id && item.activityType === "Payment received",
    )
    .reduce((sum, item) => sum + Math.round((item.amount || 0) * 100), 0);
  const dueCents = Math.max(0, depositCents - paidCents);
  const readyForProjects =
    signedScope && signedMsa && depositCents > 0 && dueCents === 0;
  const handoffDemo = quote.id === QUOTE_HANDOFF_DEMO_ID;
  const canMarkInPerson =
    user.group === "owner" ||
    config.rolePermissions[user.group].includes("agreements.mark_in_person");
  const canSignOnBehalf =
    user.group === "owner" ||
    config.rolePermissions[user.group].includes("agreements.sign_on_behalf");
  const canViewStaffFlowContent =
    user.group === "owner" ||
    config.rolePermissions[user.group].includes(
      "quote_flows.staff_content.view",
    );
  const canOverrideFlow =
    user.group === "owner" ||
    config.rolePermissions[user.group].includes("quote_flows.override");
  const [workflowStep, setWorkflowStepState] = useState<QuoteWorkflowStep>(
    () =>
      readyForProjects ? "project" : quote.quoteSentAt ? "completion" : "quote",
  );
  const [flowInstance, setFlowInstance] = useState<QuoteFlowInstanceDto | null>(
    null,
  );
  const [configuredStageId, setConfiguredStageId] = useState("");
  const [flowValueBusy, setFlowValueBusy] = useState("");
  const [flowPaymentRequestIds, setFlowPaymentRequestIds] = useState<
    Record<string, string>
  >({});
  const [pendingOverride, setPendingOverride] = useState<{
    stage: QuoteFlowStage;
    message: string;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const quoteDetailsReady = Boolean(
    quote.client.trim() && quote.clientEmail?.trim() && items.length,
  );
  const agreementDetailsReady = Boolean(
    quote.msaPaymentSchedule?.length &&
    quote.msaPermitResponsibility &&
    quote.msaContractTerms,
  );
  const agreementReadyForSharing =
    !config.features.agreements ||
    (agreementDetailsReady &&
      (signedScope || quote.msaAgreement?.status === "prepared"));
  const flowValues = Object.fromEntries(
    (flowInstance?.values || []).map((item) => [item.blockId, item.value]),
  );
  function resolveFlowCondition(condition: QuoteFlowCondition) {
    const key = condition.fieldKey || "";
    const quoteData = quote as unknown as Record<string, unknown>;
    if (condition.field === "quote.total") return finances.total;
    if (condition.field === "quote.item_ids")
      return items.map((item) => item.id);
    if (condition.field === "quote.categories")
      return items.map((item) => item.sectionName || quote.category);
    if (condition.field === "project.type") return quote.category;
    if (condition.field === "staff.role") return user.group;
    if (condition.field === "payment.status")
      return readyForProjects ? "paid" : paidCents > 0 ? "partial" : "unpaid";
    if (condition.field === "signature.status")
      return signedScope && signedMsa
        ? "complete"
        : signedScope
          ? "quote_signed"
          : "pending";
    if (condition.field === "contact.field") {
      const contact: Record<string, unknown> = {
        name: quote.client,
        email: quote.clientEmail,
        phone: quote.clientPhone,
        address: quote.address,
      };
      return contact[key];
    }
    if (condition.field === "project.field") return quoteData[key];
    if (
      condition.field === "custom.field" ||
      condition.field === "customer.response"
    )
      return flowValues[key];
    return undefined;
  }
  const configuredStages = (flowInstance?.definition.stages || []).filter(
    (stage) =>
      stage.enabled &&
      quoteFlowConditionsMatch(stage.conditions, resolveFlowCondition),
  );
  const activeConfiguredStage = configuredStages.find(
    (stage) => stage.id === configuredStageId,
  );
  const activeAgreementTemplateId =
    flowInstance && activeConfiguredStage
      ? agreementTemplateForStage(
          flowInstance.definition,
          activeConfiguredStage.id,
        )
      : null;
  const activeLegacyStep = activeConfiguredStage
    ? legacyStepForStage(activeConfiguredStage)
    : workflowStep;
  const showingCustomStage = Boolean(
    activeConfiguredStage && !legacyStepForStage(activeConfiguredStage),
  );
  const showQuoteStage = !showingCustomStage && activeLegacyStep === "quote";
  const showAgreementStage =
    !showingCustomStage && activeLegacyStep === "agreement";
  const showCompletionStage =
    !showingCustomStage && activeLegacyStep === "completion";
  const showProjectStage =
    !showingCustomStage && activeLegacyStep === "project";

  useEffect(() => {
    if (demo || handoffDemo) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        let response = await fetch(
          `/api/quote-flow-instances?quoteId=${encodeURIComponent(quote.id)}`,
          { cache: "no-store" },
        );
        let body = await response.json().catch(() => ({}));
        let instance = body.instance as QuoteFlowInstanceDto | null;
        if (response.ok && !instance) {
          response = await fetch("/api/quote-flow-instances", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quoteId: quote.id }),
          });
          body = await response.json().catch(() => ({}));
          instance = response.ok ? (body as QuoteFlowInstanceDto) : null;
        }
        if (!cancelled && instance) {
          setFlowInstance(instance);
          setConfiguredStageId(instance.currentStageId);
          const stage = instance.definition.stages.find(
            (candidate) => candidate.id === instance.currentStageId,
          );
          const mapped = stage ? legacyStepForStage(stage) : null;
          if (mapped) setWorkflowStepState(mapped);
        }
      } catch {
        // The legacy flow remains available if an organization has not
        // published a modular template yet.
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [demo, handoffDemo, quote.id]);

  async function selectConfiguredStage(
    stage: QuoteFlowStage,
    allowOverride = false,
  ) {
    if (!flowInstance) {
      setConfiguredStageId(stage.id);
      const mapped = legacyStepForStage(stage);
      if (mapped) setWorkflowStepState(mapped);
      return;
    }
    try {
      const response = await fetch(
        `/api/quote-flow-instances/${flowInstance.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "move_stage",
            stageId: stage.id,
            allowOverride,
            overrideReason: allowOverride ? overrideReason : "",
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409 && canOverrideFlow)
          setPendingOverride({
            stage,
            message: body.error || "Required steps are incomplete.",
          });
        else
          setError(
            body.error || "Complete the required step before continuing.",
          );
        return;
      }
      setFlowInstance(body as QuoteFlowInstanceDto);
      setConfiguredStageId(stage.id);
      const mapped = legacyStepForStage(stage);
      if (mapped) setWorkflowStepState(mapped);
      setPendingOverride(null);
      setOverrideReason("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not move to this step.",
      );
    }
  }

  function setWorkflowStep(step: QuoteWorkflowStep) {
    setWorkflowStepState(step);
    const configured = configuredStages.find(
      (stage) => legacyStepForStage(stage) === step,
    );
    if (configured) {
      const currentIndex = configuredStages.findIndex(
        (stage) => stage.id === configuredStageId,
      );
      const targetIndex = configuredStages.findIndex(
        (stage) => stage.id === configured.id,
      );
      const next =
        currentIndex >= 0 && targetIndex > currentIndex
          ? configuredStages[currentIndex + 1]
          : configured;
      if (next) void selectConfiguredStage(next);
    }
  }

  function selectWorkflowStage(id: string) {
    const configured = configuredStages.find((stage) => stage.id === id);
    if (configured) void selectConfiguredStage(configured);
    else setWorkflowStepState(id as QuoteWorkflowStep);
  }

  async function saveFlowValue(blockId: string, value: unknown) {
    if (!flowInstance || !activeConfiguredStage) return;
    setFlowValueBusy(blockId);
    try {
      const response = await fetch(
        `/api/quote-flow-instances/${flowInstance.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_value",
            stageId: activeConfiguredStage.id,
            blockId,
            value,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not save this response.");
      setFlowInstance(body as QuoteFlowInstanceDto);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save this response.",
      );
    } finally {
      setFlowValueBusy("");
    }
  }

  async function uploadFlowFile(blockId: string, file: File) {
    setFlowValueBusy(blockId);
    try {
      const form = new FormData();
      form.set("projectId", quote.id);
      form.set("file", file);
      const response = await fetch("/api/files", {
        method: "POST",
        body: form,
      });
      const attachment = await response.json();
      if (!response.ok)
        throw new Error(attachment.error || "Could not upload this file.");
      await saveFlowValue(blockId, {
        id: attachment.id,
        name: attachment.name,
        mime: attachment.mime,
        size: attachment.size,
      });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Could not upload this file.";
      setError(message);
      throw new Error(message);
    } finally {
      setFlowValueBusy("");
    }
  }

  async function markFlowSignedInPerson(
    blockId: string,
    input: { signedName: string; reference: string },
  ) {
    if (!flowInstance || !activeConfiguredStage) return;
    setFlowValueBusy(blockId);
    setError("");
    try {
      const response = await fetch(
        `/api/quote-flow-instances/${flowInstance.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "mark_signed_in_person",
            stageId: activeConfiguredStage.id,
            blockId,
            ...input,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not record this signature.");
      setFlowInstance(body as QuoteFlowInstanceDto);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not record this signature.",
      );
      throw cause;
    } finally {
      setFlowValueBusy("");
    }
  }

  async function signFlowOnBehalf(
    blockId: string,
    input: { signedName: string; authorization: string },
  ) {
    if (!flowInstance || !activeConfiguredStage) return;
    setFlowValueBusy(blockId);
    setError("");
    try {
      const response = await fetch(
        `/api/quote-flow-instances/${flowInstance.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "sign_on_behalf",
            stageId: activeConfiguredStage.id,
            blockId,
            ...input,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not record this signature.");
      setFlowInstance(body as QuoteFlowInstanceDto);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not record this signature.",
      );
      throw cause;
    } finally {
      setFlowValueBusy("");
    }
  }

  async function convertConfiguredFlowToProject(blockId: string) {
    if (!flowInstance || !activeConfiguredStage) return;
    setFlowValueBusy(blockId);
    setError("");
    try {
      const response = await fetch(
        `/api/quote-flow-instances/${flowInstance.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "convert_to_project",
            stageId: activeConfiguredStage.id,
            blockId,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not create this project.");
      onProjectReady(quote.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create this project.",
      );
    } finally {
      setFlowValueBusy("");
    }
  }

  async function recordConfiguredFlowPayment(
    blockId: string,
    input: {
      amount: number;
      method: "Check" | "Cash" | "Bank transfer" | "Other";
      reference: string;
    },
  ) {
    if (!flowInstance || !activeConfiguredStage) return;
    const requestId = flowPaymentRequestIds[blockId] || crypto.randomUUID();
    setFlowPaymentRequestIds((current) => ({
      ...current,
      [blockId]: requestId,
    }));
    setFlowValueBusy(blockId);
    setError("");
    try {
      const response = await fetch(
        `/api/quote-flow-instances/${flowInstance.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "record_manual_payment",
            stageId: activeConfiguredStage.id,
            blockId,
            requestId,
            ...input,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not record this payment.");
      setFlowInstance(body as QuoteFlowInstanceDto);
      setFlowPaymentRequestIds((current) => {
        const next = { ...current };
        delete next[blockId];
        return next;
      });
      await onSent();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not record this payment.",
      );
    } finally {
      setFlowValueBusy("");
    }
  }
  async function recordCheck(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checkBusy) return;
    setCheckBusy(true);
    setCheckError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/quotes/${encodeURIComponent(quote.id)}/check-deposit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: checkRequestId,
            amount: String(form.get("amount") || ""),
            checkReference: String(form.get("checkReference") || ""),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not record the check.");
      if (result.projectReady) onProjectReady(quote.id);
      await onSent();
      setCheckRequestId(crypto.randomUUID());
    } catch (cause) {
      setCheckError(
        cause instanceof Error ? cause.message : "Could not record the check.",
      );
    } finally {
      setCheckBusy(false);
    }
  }
  async function change(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not update this quote.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openEmail() {
    setError("");
    if (
      config.features.agreements &&
      quote.msaAgreement?.status !== "prepared"
    ) {
      setError(
        "Sign and prepare the MSA in Agreement details before emailing this quote.",
      );
      setWorkflowStep("agreement");
      return;
    }
    try {
      const response = await fetch("/api/google-mail", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not check company email.");
      if (!data.connected)
        throw new Error(
          "Connect the company mailbox in Settings before sending a quote.",
        );
      setSendRequestId(crypto.randomUUID());
      setSendError("");
      setSendOpen(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not check company email.",
      );
    }
  }
  async function startOnsiteSigning() {
    if (onsiteBusy) return;
    setOnsiteBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/quotes/${encodeURIComponent(quote.id)}/onsite-signing`,
        { method: "POST" },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "Could not start on-site signing.");
      window.location.assign(result.url);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not start on-site signing.",
      );
      setOnsiteBusy(false);
    }
  }
  async function sendEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendBusy) return;
    if (
      (quote.quoteSentAt || quote.status === "Sent") &&
      !window.confirm(
        "This quote has already been sent. Are you sure you want to email it again?",
      )
    )
      return;
    setSendBusy(true);
    setSendError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/quotes/${encodeURIComponent(quote.id)}/email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: sendRequestId,
            recipientEmail: quote.clientEmail,
            subject: String(form.get("subject") || ""),
            message: String(form.get("message") || ""),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send quote.");
      setSendOpen(false);
      try {
        await onSent();
      } catch {
        setError(
          "Gmail sent the quote, but the workspace could not refresh. Reload to see the updated status.",
        );
      }
      if (data.warning) setError(data.warning);
    } catch (caught) {
      setSendError(
        caught instanceof Error ? caught.message : "Could not send quote.",
      );
    } finally {
      setSendBusy(false);
    }
  }
  const msaDraftPanel =
    items.length && config.features.agreements ? (
      <MsaDraftPanel
        key={`${quote.id}:${JSON.stringify(quote.msaPaymentSchedule)}:${quote.msaPermitResponsibility || ""}:${JSON.stringify(quote.msaContractTerms)}`}
        project={quote}
        items={items}
        signer={user}
        showSigning={!signedScope}
        canSendAgreement={signedScope}
        prepareBeforeQuoteSignature={!signedScope}
        onSaveTerms={async (terms) => {
          const response = await fetch(
            `/api/msa/${encodeURIComponent(quote.id)}/terms`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ updatedAt: quote.updatedAt, ...terms }),
            },
          );
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || "Could not save MSA terms.");
          await onSent();
        }}
      />
    ) : null;
  const agreementPanel =
    msaDraftPanel ||
    (items.length && config.modules.agreements ? (
      <AgreementPacketPanel
        quote={quote}
        user={user}
        businessName={config.profile.name}
        demo={demo}
      />
    ) : null);
  return (
    <div className="quote-detail">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={15} />
        All quotes
      </button>
      <div className="project-heading">
        <div>
          <h1>{quote.name}</h1>
          <div className="project-address">
            <MapPin size={15} />
            {quote.address || "No address added"}
          </div>
          <div className="quote-header-contact">
            <strong>{quote.client || "No client added"}</strong>
            {quote.clientEmail && (
              <a href={`mailto:${quote.clientEmail}`}>
                <Mail size={14} />
                {quote.clientEmail}
              </a>
            )}
            {quote.clientPhone && (
              <a href={`tel:${quote.clientPhone.replace(/[^+\d]/g, "")}`}>
                <Phone size={14} />
                {quote.clientPhone}
              </a>
            )}
            {!quote.clientPhone && !quote.clientEmail && (
              <span>Add client contact details in Edit quote.</span>
            )}
          </div>
        </div>
        <div className="project-actions quote-header-actions">
          {!demo &&
            quote.clientEmail &&
            !signedScope &&
            showCompletionStage && (
              <button
                className="button primary"
                disabled={busy || sendBusy}
                onClick={() => void openEmail()}
              >
                <Mail size={15} /> Email quote
              </button>
            )}
          <div className="quote-header-status">
            <select
              aria-label="Quote status"
              value={quote.status}
              disabled={busy || signedScope}
              onChange={(event) =>
                void change(() =>
                  onSave(
                    "quote",
                    { ...quote, status: event.target.value },
                    quote,
                  ),
                )
              }
            >
              {quoteStatuses
                .filter((status) => status !== "Accepted" || signedScope)
                .map((status) => (
                  <option key={status}>{status}</option>
                ))}
            </select>
            {quote.quoteSentAt && (
              <small>Last shared {regional.date(quote.quoteSentAt)}</small>
            )}
          </div>
          <a
            className="button secondary"
            href={`/api/quotes/${encodeURIComponent(quote.id)}/pdf`}
            download
          >
            <Download size={15} />
            {signedScope ? "Download signed quote" : "Download PDF"}
          </a>
          {!signedScope && (handoffDemo || showQuoteStage) && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => onEdit({ kind: "quote", entity: quote })}
            >
              <Pencil size={15} /> Edit quote
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {sendOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !sendBusy)
              setSendOpen(false);
          }}
        >
          <form
            className="modal"
            onSubmit={(event) => void sendEmail(event)}
            aria-label="Email quote"
          >
            <header>
              <div>
                <h2>Email quote</h2>
                <p>
                  We’ll attach the quote PDF and include a private link to view
                  it in the client portal. The email will be sent from this
                  organization’s connected Gmail account.
                </p>
              </div>
            </header>
            <div className="form-fields">
              <label>
                To
                <input type="email" value={quote.clientEmail} readOnly />
              </label>
              <label>
                Subject
                <input
                  name="subject"
                  defaultValue={`Quote for ${quote.name}`}
                  required
                  maxLength={180}
                />
              </label>
              <label>
                Message
                <textarea
                  name="message"
                  defaultValue={`Hi ${clientFirstName},\n\nI’ve attached your quote for ${quote.name}. You can also use the button below to open it in your client portal, review the details, and sign online when you’re ready.\n\nIf you have any questions or would like to talk through the quote, just reply to this email or give me a call.\n\nLooking forward to taking care of this project for you!\n\nThanks,\n${senderFirstName} from ${config.profile.name}`}
                  required
                  rows={7}
                  maxLength={5000}
                />
              </label>
              {sendError && (
                <div className="alert" role="alert">
                  {sendError}
                </div>
              )}
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setPreviewOpen(true)}
              >
                Preview customer PDF
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={sendBusy}
                onClick={() => setSendOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={sendBusy}
              >
                {sendBusy ? "Sending…" : "Email quote"}
              </button>
            </footer>
          </form>
        </div>
      )}
      {previewOpen && !demo && (
        <QuoteCustomerPreview
          quoteId={quote.id}
          onClose={() => setPreviewOpen(false)}
        />
      )}
      <div className="quote-overview">
        <div
          className={`quote-overview-metrics${config.quotePreferences.showInternalCosts ? "" : " quote-overview-metrics-solo"}`}
        >
          <div className="quote-overview-metric quote-price">
            <span>Scope total · quote price</span>
            <strong>{regional.money(finances.total)}</strong>
            <small>{items.length} items</small>
          </div>
          {config.quotePreferences.showInternalCosts && (
            <div className="quote-overview-metric">
              <span>Total costs</span>
              <strong>{regional.money(finances.costs)}</strong>
            </div>
          )}
          {config.quotePreferences.showInternalCosts && (
            <div className="quote-overview-metric">
              <span>Profit</span>
              <strong
                className={finances.margin < 0 ? "is-negative" : undefined}
              >
                {regional.money(finances.margin)}
              </strong>
            </div>
          )}
        </div>
        {overviewPhotos.length > 0 && (
          <div
            className="quote-overview-photos"
            aria-label="Selected quote photos"
          >
            {overviewPhotos.map(({ photo, file }) => {
              const label =
                photo.kind === "before"
                  ? "Before"
                  : photo.kind === "concept"
                    ? "AI concept"
                    : "Example";
              return (
                <figure key={file.id}>
                  <img
                    src={
                      demo
                        ? file.path
                        : `/api/files?id=${encodeURIComponent(file.id)}`
                    }
                    alt={photo.caption || `${label} photo`}
                    title={photo.caption || file.name}
                  />
                  <figcaption>{label}</figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </div>
      {handoffDemo && quote.quoteSentAt && (
        <QuoteProjectHandoffDemo
          quote={quote}
          itemCount={items.length}
          fileCount={files.length}
          agreementDetails={agreementPanel}
        />
      )}
      {!handoffDemo && (
        <QuoteWorkflowStepper
          active={configuredStageId || workflowStep}
          agreementReady={quoteDetailsReady}
          completionReady={agreementReadyForSharing}
          projectReady={readyForProjects}
          configuredStages={configuredStages}
          onSelect={selectWorkflowStage}
        />
      )}
      {pendingOverride && (
        <section
          className="workflow-override-panel"
          aria-label="Override required step"
        >
          <div>
            <strong>Required work is incomplete</strong>
            <p>{pendingOverride.message}</p>
          </div>
          <label>
            Override reason
            <input
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              placeholder="Explain why this quote can continue"
              minLength={5}
              maxLength={500}
            />
          </label>
          <div>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setPendingOverride(null);
                setOverrideReason("");
              }}
            >
              Keep working
            </button>
            <button
              type="button"
              className="button primary"
              disabled={overrideReason.trim().length < 5}
              onClick={() =>
                void selectConfiguredStage(pendingOverride.stage, true)
              }
            >
              Override and continue
            </button>
          </div>
        </section>
      )}
      {!handoffDemo &&
        showingCustomStage &&
        flowInstance &&
        activeConfiguredStage && (
          <section
            className="workflow-live-step"
            aria-label={activeConfiguredStage.title}
          >
            <QuoteFlowRenderer
              definition={flowInstance.definition}
              audience="both"
              mode="staff"
              activeStageId={activeConfiguredStage.id}
              values={flowValues}
              resolveCondition={resolveFlowCondition}
              showNavigation={false}
              showFooter={false}
              blockFilter={(block) =>
                block.type !== "staff_information" || canViewStaffFlowContent
              }
              renderBlock={(block) => {
                if (block.type === "contact_fields")
                  return (
                    <div className="workflow-configured-object">
                      <dl>
                        <div>
                          <dt>Name</dt>
                          <dd>{quote.client || "Not selected"}</dd>
                        </div>
                        <div>
                          <dt>Email</dt>
                          <dd>{quote.clientEmail || "Not provided"}</dd>
                        </div>
                        <div>
                          <dt>Phone</dt>
                          <dd>{quote.clientPhone || "Not provided"}</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => onEdit({ kind: "quote", entity: quote })}
                      >
                        <Pencil size={15} /> Edit contact
                      </button>
                    </div>
                  );
                if (block.type === "project_fields")
                  return (
                    <div className="workflow-configured-object">
                      <dl>
                        <div>
                          <dt>Project</dt>
                          <dd>{quote.name || "Untitled quote"}</dd>
                        </div>
                        <div>
                          <dt>Type</dt>
                          <dd>{quote.category || "Not selected"}</dd>
                        </div>
                        <div>
                          <dt>Address</dt>
                          <dd>{quote.address || "Not provided"}</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => onEdit({ kind: "quote", entity: quote })}
                      >
                        <Pencil size={15} /> Edit project
                      </button>
                    </div>
                  );
                if (block.type === "quote_items")
                  return signedScope ? (
                    <table
                      className="scope-table"
                      aria-label="Signed quote scope"
                    >
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.title}</strong>
                              {item.details && <small>{item.details}</small>}
                            </td>
                            <td>{regional.money(item.estimate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <ScopeTable
                      items={items}
                      workspace={workspace}
                      pricebookEnabled={
                        config.features.priceBook &&
                        config.quotePreferences.showPriceBookPicker
                      }
                      demoPricebook={demo}
                      showInternalCosts={
                        config.quotePreferences.showInternalCosts
                      }
                      inline
                      compactQuoteRows
                      showStatus={false}
                      projectId={quote.id}
                      defaultSectionName={DEFAULT_QUOTE_PROJECT_NAME}
                      onSave={(data, item) => onSave("scope", data, item)}
                      onReorder={onReorderScope}
                      onBulkPrice={onPriceScope}
                      onRefresh={onSent}
                      onDelete={(item) => onDelete("scope", item)}
                    />
                  );
                if (block.type === "scope_of_work")
                  return (
                    <div className="workflow-configured-copy">
                      <p>
                        {quote.description || "No scope summary added yet."}
                      </p>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => onEdit({ kind: "quote", entity: quote })}
                      >
                        <Pencil size={15} /> Edit scope
                      </button>
                    </div>
                  );
                if (block.type === "notes")
                  return (
                    <div className="workflow-configured-copy">
                      <p>{quote.quoteNotes || "No notes added yet."}</p>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => onEdit({ kind: "quote", entity: quote })}
                      >
                        <Pencil size={15} /> Edit notes
                      </button>
                    </div>
                  );
                if (block.type === "photos_attachments")
                  return (
                    <div className="workflow-configured-files">
                      <QuotePhotosPanel
                        quote={quote}
                        files={files}
                        demo={demo}
                        onSave={(photos) =>
                          onSave(
                            "quote",
                            { ...quote, quotePhotos: photos },
                            quote,
                          )
                        }
                        onUpload={(file) => onUpload(file, quote.id)}
                        onDelete={(file) => onDelete("attachment", file)}
                        admin={user.role === "admin"}
                      />
                      <FilesPanel
                        files={files.filter(
                          (file) => !file.mime.startsWith("image/"),
                        )}
                        admin={user.role === "admin"}
                        demo={demo}
                        hideEmpty
                        onUpload={async (file) => {
                          await onUpload(file, quote.id);
                        }}
                        onDelete={(file) => onDelete("attachment", file)}
                      />
                    </div>
                  );
                if (block.type === "delivery_controls")
                  return (
                    <div className="workflow-configured-delivery">
                      <div>
                        <strong>
                          {quote.quoteSentAt
                            ? `Sent to ${quote.clientEmail}`
                            : "Ready to send"}
                        </strong>
                        <span>
                          {quote.quoteSentAt
                            ? "The private customer portal is active."
                            : "Email creates the private portal link and attaches the quote PDF."}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="button primary"
                        disabled={!quote.clientEmail || sendBusy || signedScope}
                        onClick={() => void openEmail()}
                      >
                        <Mail size={15} />
                        {quote.quoteSentAt ? "Resend quote" : "Email quote"}
                      </button>
                      <a
                        className="button secondary"
                        href={`/api/quotes/${encodeURIComponent(quote.id)}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Download size={15} /> Preview PDF
                      </a>
                    </div>
                  );
                if (block.type === "custom_file")
                  return (
                    <QuoteFlowFileControl
                      value={flowValues[block.id]}
                      busy={flowValueBusy === block.id}
                      onUpload={(file) => uploadFlowFile(block.id, file)}
                    />
                  );
                const blockTemplateId =
                  typeof block.config.templateId === "string"
                    ? block.config.templateId
                    : null;
                if (
                  ["uploaded_pdf", "generated_document"].includes(block.type) &&
                  blockTemplateId
                )
                  return (
                    <AgreementPacketPanel
                      quote={quote}
                      user={user}
                      businessName={config.profile.name}
                      demo={demo}
                      fixedTemplateId={blockTemplateId}
                      heading={block.label}
                      flowResponses={flowValues}
                    />
                  );
                const methods = Array.isArray(block.config.methods)
                  ? block.config.methods.map(String)
                  : ["remote", "onsite", "in_person"];
                const signatureValue = flowValues[block.id] as
                  Record<string, unknown> | undefined;
                if (block.type === "internal_approval") {
                  if (signatureValue?.approved)
                    return (
                      <div className="success">
                        <Check size={15} /> Approved by{" "}
                        {String(
                          signatureValue.approvedBy || "authorized staff",
                        )}
                      </div>
                    );
                  return (
                    <button
                      type="button"
                      className="button primary"
                      disabled={flowValueBusy === block.id}
                      onClick={() => void saveFlowValue(block.id, true)}
                    >
                      {flowValueBusy === block.id
                        ? "Approving…"
                        : "Approve step"}
                    </button>
                  );
                }
                if (block.type === "project_conversion")
                  return (
                    <button
                      type="button"
                      className="button primary"
                      disabled={flowValueBusy === block.id}
                      onClick={() =>
                        void convertConfiguredFlowToProject(block.id)
                      }
                    >
                      {flowValueBusy === block.id
                        ? "Creating project…"
                        : "Create project"}
                    </button>
                  );
                if (block.type === "deposit_collection")
                  return (
                    <QuoteFlowPaymentControl
                      block={block}
                      value={flowValues[block.id]}
                      quoteTotal={finances.total}
                      locale={config.regional.locale}
                      currency={config.regional.currency}
                      busy={flowValueBusy === block.id}
                      staff
                      onRecord={(input) =>
                        recordConfiguredFlowPayment(block.id, input)
                      }
                    />
                  );
                if (
                  ["signature", "initials"].includes(block.type) &&
                  signatureValue?.method === "agreement_packet"
                )
                  return (
                    <div className="success">
                      <Check size={15} /> Completed in the signed agreement
                      packet.
                    </div>
                  );
                if (
                  ["signature", "initials"].includes(block.type) &&
                  ((methods.includes("in_person") && canMarkInPerson) ||
                    (methods.includes("on_behalf") && canSignOnBehalf))
                )
                  return (
                    <QuoteFlowInPersonControl
                      block={block}
                      value={flowValues[block.id]}
                      busy={flowValueBusy === block.id}
                      onComplete={(input) =>
                        markFlowSignedInPerson(block.id, input)
                      }
                      canSignOnBehalf={
                        methods.includes("on_behalf") && canSignOnBehalf
                      }
                      onSignOnBehalf={(input) =>
                        signFlowOnBehalf(block.id, input)
                      }
                    />
                  );
                if (
                  ["signature", "initials"].includes(block.type) &&
                  activeAgreementTemplateId
                )
                  return (
                    <div className="alert">
                      This field is completed through the private agreement link
                      created in the document step.
                    </div>
                  );
                return undefined;
              }}
              onValue={(block, value) => {
                if (
                  activeConfiguredStage.audience !== "customer" &&
                  block.audience !== "customer"
                )
                  void saveFlowValue(block.id, value);
              }}
            />
            {flowValueBusy && (
              <p className="muted-note" role="status">
                Saving response…
              </p>
            )}
            {flowInstance.events?.some(
              (event) => event.stageId === activeConfiguredStage.id,
            ) && (
              <details className="workflow-flow-audit">
                <summary>Step history</summary>
                {flowInstance.events
                  .filter((event) => event.stageId === activeConfiguredStage.id)
                  .map((event) => (
                    <div key={event.id}>
                      <strong>{event.eventType.replaceAll("_", " ")}</strong>
                      <span>{event.actorName || "System"}</span>
                      <time dateTime={event.createdAt}>
                        {regional.dateTime(event.createdAt)}
                      </time>
                    </div>
                  ))}
              </details>
            )}
          </section>
        )}
      {(handoffDemo || showQuoteStage) && quote.description && (
        <section className="content-section">
          <div className="section-heading">
            <h2>Scope brief</h2>
          </div>
          <p className="scope-description">{quote.description}</p>
        </section>
      )}
      {(handoffDemo || showQuoteStage) && (
        <section className="content-section">
          <div className="section-heading">
            <div>
              <h2>Scope & pricing</h2>
              <p>
                {signedScope
                  ? "Signed scope is locked."
                  : "Edit a row, or drag its handle to change the quote order."}
              </p>
            </div>
          </div>
          <div className={displayStyles.bar}>
            <label className={displayStyles.field}>
              <span>Customer pricing display</span>
              <select
                value={resolveQuotePriceDisplay(
                  quote,
                  config.quotePreferences.showCustomerLineItemPrices,
                )}
                disabled={busy || signedScope}
                onChange={(event) =>
                  void change(async () => {
                    await onSave(
                      "quote",
                      { ...quote, priceDisplay: event.target.value },
                      quote,
                    );
                    await onSent();
                  })
                }
              >
                {quotePriceDisplayOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <span className={displayStyles.description}>
              {
                quotePriceDisplayOptions.find(
                  (option) =>
                    option.value ===
                    resolveQuotePriceDisplay(
                      quote,
                      config.quotePreferences.showCustomerLineItemPrices,
                    ),
                )?.description
              }
            </span>
            {!demo && (
              <button
                type="button"
                className="button secondary"
                onClick={() => setPreviewOpen(true)}
              >
                Preview customer PDF
              </button>
            )}
          </div>
          {signedScope ? (
            <table className="scope-table" aria-label="Signed quote scope">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.title}</strong>
                      {item.details && <small>{item.details}</small>}
                    </td>
                    <td>{regional.money(item.estimate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <ScopeTable
              items={items}
              workspace={workspace}
              pricebookEnabled={
                config.features.priceBook &&
                config.quotePreferences.showPriceBookPicker
              }
              demoPricebook={demo}
              showInternalCosts={config.quotePreferences.showInternalCosts}
              inline
              compactQuoteRows
              showStatus={false}
              projectId={quote.id}
              defaultSectionName={DEFAULT_QUOTE_PROJECT_NAME}
              onSave={(data, item) => onSave("scope", data, item)}
              onReorder={onReorderScope}
              onBulkPrice={onPriceScope}
              onRefresh={onSent}
              onDelete={(item) => onDelete("scope", item)}
            />
          )}
        </section>
      )}
      {!handoffDemo && showAgreementStage && (
        <section className="workflow-live-step" aria-label="Agreement details">
          <header>
            <span className="project-handoff-eyebrow">Step 2</span>
            <h2>Agreement details</h2>
            <p>
              Confirm payment milestones, contract terms, dates, and parties
              before anything is sent for signature.
            </p>
          </header>
          {agreementPanel || (
            <div className="alert">Add at least one quote item first.</div>
          )}
          <footer>
            <button
              type="button"
              className="button secondary"
              onClick={() => setWorkflowStep("quote")}
            >
              Back to quote
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!agreementReadyForSharing}
              onClick={() => setWorkflowStep("completion")}
            >
              Continue to send & complete
            </button>
          </footer>
        </section>
      )}
      {!handoffDemo && showCompletionStage && (
        <section className="workflow-live-step" aria-label="Send and complete">
          <header>
            <span className="project-handoff-eyebrow">Step 3</span>
            <h2>Send & complete</h2>
            <p>
              Complete each document in order. Delivery, viewing, and signing
              controls stay with the document they affect.
            </p>
          </header>
          <div
            className="workflow-document-stack"
            aria-label="Quote completion workflow"
          >
            <section
              className={`workflow-completion-panel workflow-document-panel ${signedScope ? "is-complete" : ""}`}
              aria-label="Quote document"
            >
              <header>
                <div className="workflow-document-marker">
                  <span
                    className={`workflow-document-step ${signedScope ? "is-complete" : ""}`}
                  >
                    {signedScope ? <Check size={14} aria-hidden="true" /> : "1"}
                  </span>
                  <span className="workflow-completion-icon">
                    <FileText size={18} aria-hidden="true" />
                  </span>
                </div>
                <div>
                  <span className="project-handoff-eyebrow">
                    Quote document
                  </span>
                  <h3>
                    {signedScope
                      ? "Quote accepted and signed"
                      : quote.quoteSentAt
                        ? "Awaiting customer signature"
                        : "Ready to send"}
                  </h3>
                  <p>
                    {signedScope
                      ? `${quote.quoteAcceptance?.signedName || quote.client} signed the quote.`
                      : quote.quoteSentAt
                        ? `The quote is available to ${quote.clientEmail} in the client portal.`
                        : "Email the quote or open it for signing on this device."}
                  </p>
                </div>
                <div className="workflow-document-actions">
                  {signedScope ? (
                    <a
                      className="button secondary"
                      href={`/api/quotes/${encodeURIComponent(quote.id)}/pdf?view=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View signed quote
                    </a>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={!quote.clientEmail || sendBusy}
                        onClick={() => void openEmail()}
                      >
                        <Mail size={15} aria-hidden="true" />
                        {quote.quoteSentAt ? "Resend quote" : "Email quote"}
                      </button>
                      <button
                        type="button"
                        className="button primary"
                        disabled={
                          !quote.clientEmail ||
                          !["prepared", "sent"].includes(
                            quote.msaAgreement?.status || "",
                          ) ||
                          onsiteBusy
                        }
                        onClick={() => void startOnsiteSigning()}
                      >
                        <Tablet size={15} aria-hidden="true" />
                        {onsiteBusy ? "Opening…" : "Sign quote on this device"}
                      </button>
                    </>
                  )}
                </div>
              </header>
              <dl>
                <div>
                  <dt>Customer</dt>
                  <dd>{quote.client}</dd>
                </div>
                <div>
                  <dt>Email delivery</dt>
                  <dd>
                    {quote.quoteSentAt
                      ? `Sent to ${quote.clientEmail}`
                      : "Not sent"}
                  </dd>
                </div>
                <div>
                  <dt>Client portal</dt>
                  <dd>
                    {quote.quoteSentAt
                      ? "Private link active"
                      : "Created when emailed"}
                  </dd>
                </div>
              </dl>
            </section>
            {config.features.agreements && (
              <MsaSigningPanel
                quote={quote}
                signerName={user.name}
                onSent={onSent}
                signingOnDevice={onsiteBusy}
                onSignOnDevice={() => void startOnsiteSigning()}
              />
            )}
            <section
              className={`workflow-completion-panel workflow-document-panel workflow-deposit-step ${readyForProjects ? "is-complete" : "is-waiting"}`}
              aria-label="Deposit"
            >
              <header>
                <div className="workflow-document-marker">
                  <span
                    className={`workflow-document-step ${readyForProjects ? "is-complete" : ""}`}
                  >
                    {readyForProjects ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      "3"
                    )}
                  </span>
                </div>
                <div>
                  <span className="project-handoff-eyebrow">Deposit</span>
                  <h3>
                    {readyForProjects
                      ? "Deposit received"
                      : signedMsa
                        ? "Deposit ready to collect"
                        : "Available after the MSA is signed"}
                  </h3>
                  <p>
                    {readyForProjects
                      ? "The required deposit has been recorded."
                      : signedMsa
                        ? `${regional.money(dueCents / 100)} remains due before scheduling.`
                        : "Complete the quote and MSA before collecting the deposit."}
                  </p>
                </div>
              </header>
              {signedMsa && dueCents > 0 && user.role === "admin" && !demo && (
                <form
                  className="workflow-deposit-form"
                  onSubmit={(event) => void recordCheck(event)}
                >
                  <p>
                    Record a check after it is received. The customer can also
                    pay online from the signed agreement.
                  </p>
                  <label>
                    Check amount ($)
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      max={(dueCents / 100).toFixed(2)}
                      step="0.01"
                      placeholder={(dueCents / 100).toFixed(2)}
                      required
                      disabled={checkBusy}
                    />
                  </label>
                  <label>
                    Check number (optional)
                    <input
                      name="checkReference"
                      maxLength={100}
                      disabled={checkBusy}
                    />
                  </label>
                  <button
                    type="submit"
                    className="button primary"
                    disabled={checkBusy}
                  >
                    {checkBusy ? "Recording…" : "Record received check"}
                  </button>
                  {checkError && (
                    <p role="alert" className="alert">
                      {checkError}
                    </p>
                  )}
                </form>
              )}
            </section>
          </div>
        </section>
      )}
      {!handoffDemo && showProjectStage && (
        <section className="workflow-live-step" aria-label="Create project">
          <header>
            <span className="project-handoff-eyebrow">Step 4</span>
            <h2>Create project</h2>
            <p>
              The signed quote, agreement, deposit, customer, files, and items
              will move together into Projects.
            </p>
          </header>
          <div className="workflow-project-review">
            <div>
              <span>Project</span>
              <strong>{quote.name}</strong>
              <small>{quote.address}</small>
            </div>
            <div>
              <span>Customer</span>
              <strong>{quote.client}</strong>
              <small>{quote.clientEmail}</small>
            </div>
            <div>
              <span>Contract</span>
              <strong>
                {regional.money(quote.contractPrice || finances.total)}
              </strong>
              <small>{items.length} items ready for Planning</small>
            </div>
          </div>
          <ul className="workflow-project-items" aria-label="Project items">
            {items.map((item, index) => (
              <li key={item.id}>
                <span>{index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.sectionName || quote.category}</small>
                </div>
                <Check size={15} aria-label="Ready" />
              </li>
            ))}
          </ul>
          <footer>
            <button
              type="button"
              className="button secondary"
              onClick={() => setWorkflowStep("completion")}
            >
              Back to completion
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy || !readyForProjects}
              onClick={() => void change(() => onAccept(quote))}
            >
              <Check size={16} /> {busy ? "Creating…" : "Create project"}
            </button>
          </footer>
        </section>
      )}
      {(handoffDemo || showQuoteStage) && (
        <section className="content-section">
          <div className="section-heading">
            <div>
              <h2>Quote photos</h2>
              <p>
                Choose before and example photos to show your customer, or
                create a finished concept.
              </p>
              {quote.quoteSentAt && (
                <p>Resend the quote to update photos in the customer copy.</p>
              )}
            </div>
          </div>
          <QuotePhotosPanel
            quote={quote}
            files={files}
            demo={demo}
            onSave={(photos) =>
              onSave("quote", { ...quote, quotePhotos: photos }, quote)
            }
            onUpload={(file) => onUpload(file, quote.id)}
            onDelete={(file) => onDelete("attachment", file)}
            admin={user.role === "admin"}
          />
          <FilesPanel
            files={files.filter((file) => !file.mime.startsWith("image/"))}
            admin={user.role === "admin"}
            demo={demo}
            hideEmpty
            onUpload={async (file) => {
              await onUpload(file, quote.id);
            }}
            onDelete={(file) => onDelete("attachment", file)}
          />
        </section>
      )}
      {!demo && showQuoteStage && (
        <RoomScansPanel quoteId={quote.id} readOnly={signedScope} />
      )}
    </div>
  );
}
