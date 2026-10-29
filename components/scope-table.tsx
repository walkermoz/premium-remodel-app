"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { ScopeItem, TaskStatus, Workspace } from "@/lib/types";
import { pricebookScopeValues, type PricebookItem } from "@/lib/pricebook";
import {
  projectMoney as money,
  scopeTotal,
  scopeCosts,
  scopeDifference,
} from "@/lib/project-finances";
import {
  lineTotal,
  pricingBases,
  salePricingBases,
  quantityLabel,
  costRateLabel,
  rateFromTotal,
  rateLabel,
} from "@/lib/scope-pricing";
import { Badge, Empty } from "./ui";
import PricebookPicker from "./pricebook-picker";
import { readDemoPricebook } from "@/lib/demo-pricebook";
import { moveQuoteScopeItem, orderedScopeItems } from "@/lib/scope-order";
import {
  calculatedQuotePrice,
  DEFAULT_MATERIAL_MULTIPLIER,
  DEFAULT_SUB_MULTIPLIER,
  validMultiplier,
} from "@/lib/quote-bulk-pricing";
import {
  DEFAULT_QUOTE_PROJECT_NAME,
  UNGROUPED_SCOPE_PROJECT_ID,
} from "@/lib/scope-projects";

const statuses: TaskStatus[] = ["To do", "In progress", "Done"];

function detailRowCount(value: string) {
  return value
    .split(/\r?\n/)
    .reduce(
      (total, line) => total + Math.max(1, Math.ceil(line.length / 44)),
      0,
    );
}

interface ScopeDraft {
  sectionId: string;
  sectionName: string;
  title: string;
  details: string;
  quantity: string;
  unit: string;
  estimate: string;
  rate: string;
  subCost: string;
  subCostUnit: string;
  subCostQuantity: string;
  subCostRate: string;
  materialCost: string;
  materialCostUnit: string;
  materialCostQuantity: string;
  materialCostRate: string;
  contractorId: string;
  status: TaskStatus;
}

function draftFrom(item?: ScopeItem): ScopeDraft {
  return {
    sectionId: item?.sectionId || "",
    sectionName: item?.sectionName || "",
    title: item?.title || "",
    details: item?.details || "",
    quantity: String(item?.quantity ?? 1),
    unit: item?.unit || "job",
    estimate: String(item?.estimate ?? 0),
    rate: String(rateFromTotal(item?.estimate ?? 0, item?.quantity ?? 1)),
    subCost: String(item?.subCost ?? 0),
    subCostUnit: item?.subCostUnit || "job",
    subCostQuantity: String(item?.subCostQuantity ?? 1),
    subCostRate: String(
      rateFromTotal(item?.subCost ?? 0, item?.subCostQuantity ?? 1),
    ),
    materialCost: String(item?.materialCost ?? 0),
    materialCostUnit: item?.materialCostUnit || "job",
    materialCostQuantity: String(item?.materialCostQuantity ?? 1),
    materialCostRate: String(
      rateFromTotal(item?.materialCost ?? 0, item?.materialCostQuantity ?? 1),
    ),
    contractorId: item?.contractorId || "",
    status: item?.status || "To do",
  };
}

function numberValue(value: string, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000_000)
    throw new Error(`${label} must be between 0 and 1,000,000,000.`);
  return number;
}

function draftValues(draft: ScopeDraft) {
  const title = draft.title.trim();
  if (!title) throw new Error("Add a work item name before saving this row.");
  return {
    sectionId: draft.sectionId,
    sectionName: draft.sectionName,
    title,
    details: draft.details.trim(),
    quantity: numberValue(draft.quantity, "Quantity"),
    unit: draft.unit,
    estimate: numberValue(draft.estimate, "Price"),
    subCost: numberValue(draft.subCost, "Subcontractor cost"),
    subCostUnit: draft.subCostUnit,
    subCostQuantity:
      draft.subCostUnit === "job"
        ? 1
        : numberValue(draft.subCostQuantity, "Subcontractor quantity"),
    materialCost: numberValue(draft.materialCost, "Material cost"),
    materialCostUnit: draft.materialCostUnit,
    materialCostQuantity:
      draft.materialCostUnit === "job"
        ? 1
        : numberValue(draft.materialCostQuantity, "Material quantity"),
    contractorId: draft.contractorId,
    status: draft.status,
  };
}

function draftNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function draftValuesForMath(draft: ScopeDraft) {
  return {
    title: draft.title,
    details: draft.details,
    quantity: draftNumber(draft.quantity),
    unit: draft.unit,
    estimate: draftNumber(draft.estimate),
    subCost: draftNumber(draft.subCost),
    materialCost: draftNumber(draft.materialCost),
    contractorId: draft.contractorId,
    status: draft.status,
  };
}

function scopeSectionKey(item: ScopeItem) {
  return item.sectionId?.trim()
    ? `id:${item.sectionId.trim()}`
    : item.sectionName?.trim()
      ? `name:${item.sectionName.trim().toLowerCase()}`
      : "ungrouped";
}

function scopeSectionName(item: ScopeItem, fallback: string) {
  return item.sectionName?.trim() || fallback;
}

export default function ScopeTable({
  items,
  workspace,
  onAdd,
  onEdit,
  onDelete,
  inline = false,
  compactQuoteRows = false,
  showStatus = true,
  projectId,
  onSave,
  onReorder,
  onBulkPrice,
  pricebookEnabled = false,
  demoPricebook = false,
  showInternalCosts = true,
  defaultSectionName = DEFAULT_QUOTE_PROJECT_NAME,
}: {
  items: ScopeItem[];
  workspace: Workspace;
  onAdd?: () => void;
  onEdit?: (item: ScopeItem) => void;
  onDelete: (item: ScopeItem) => void;
  inline?: boolean;
  compactQuoteRows?: boolean;
  showStatus?: boolean;
  projectId?: string;
  onSave?: (
    data: Record<string, unknown>,
    item?: ScopeItem,
  ) => Promise<unknown>;
  onReorder?: (
    quoteId: string,
    items: ScopeItem[],
    movingId: string,
  ) => Promise<unknown>;
  onBulkPrice?: (
    quoteId: string,
    items: ScopeItem[],
    subMultiplier: number,
    materialMultiplier: number,
  ) => Promise<ScopeItem[]>;
  pricebookEnabled?: boolean;
  demoPricebook?: boolean;
  showInternalCosts?: boolean;
  defaultSectionName?: string;
}) {
  const [pendingOrder, setPendingOrder] = useState<ScopeItem[] | null>(null);
  const orderedItems = useMemo(
    () => orderedScopeItems(pendingOrder || items),
    [items, pendingOrder],
  );
  const [drafts, setDrafts] = useState<Record<string, ScopeDraft>>(() =>
    Object.fromEntries(orderedItems.map((item) => [item.id, draftFrom(item)])),
  );
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<ScopeDraft>(() => draftFrom());
  const [saving, setSaving] = useState<Set<string>>(() => new Set());
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [error, setError] = useState("");
  const [sectionSaving, setSectionSaving] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pricingBusy, setPricingBusy] = useState(false);
  const [subMultiplier, setSubMultiplier] = useState(
    String(DEFAULT_SUB_MULTIPLIER),
  );
  const [materialMultiplier, setMaterialMultiplier] = useState(
    String(DEFAULT_MATERIAL_MULTIPLIER),
  );
  const [dragSourceId, setDragSourceId] = useState("");
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    placement: "before" | "after";
  } | null>(null);
  const [pricebookItems, setPricebookItems] = useState<PricebookItem[]>([]);
  const [pricebookBusy, setPricebookBusy] = useState(false);
  const [pricebookOpen, setPricebookOpen] = useState(false);
  const newTitle = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) newTitle.current?.focus();
  }, [adding]);

  useEffect(() => {
    if (!pricebookEnabled) return;
    if (demoPricebook) {
      const timer = setTimeout(() => setPricebookItems(readDemoPricebook()), 0);
      return () => clearTimeout(timer);
    }
    fetch("/api/pricebook", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Could not load price book.");
        setPricebookItems(body);
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not load price book.",
        ),
      );
  }, [pricebookEnabled, demoPricebook]);

  if (!inline && !items.length)
    return (
      <Empty
        title="Build out your scope"
        text="Break the job into work items, with a price, subcontractor cost, and material cost for each."
        action={
          <button className="button secondary" onClick={onAdd}>
            <Plus size={16} />
            Add scope item
          </button>
        }
      />
    );

  const visibleItems = inline
    ? orderedItems.map((item) => ({
        ...item,
        ...draftValuesForMath(drafts[item.id] || draftFrom(item)),
      }))
    : orderedItems;
  const estimated = scopeTotal(visibleItems);
  const selectedItems = orderedItems.filter((item) => selectedIds.has(item.id));
  const multipliersValid =
    validMultiplier(Number(subMultiplier)) &&
    validMultiplier(Number(materialMultiplier)) &&
    subMultiplier.trim() !== "" &&
    materialMultiplier.trim() !== "";
  const selectedPricingTotal = multipliersValid
    ? selectedItems.reduce(
        (total, item) =>
          total +
          calculatedQuotePrice(
            item,
            Number(subMultiplier),
            Number(materialMultiplier),
          ),
        0,
      )
    : 0;
  const { subCosts, materialCosts, costs } = scopeCosts(visibleItems);
  const sectionStats = new Map<
    string,
    { name: string; count: number; total: number }
  >();
  for (const item of visibleItems) {
    const key = scopeSectionKey(item);
    const current = sectionStats.get(key);
    sectionStats.set(key, {
      name: scopeSectionName(item, defaultSectionName),
      count: (current?.count || 0) + 1,
      total: (current?.total || 0) + item.estimate,
    });
  }
  const nextPosition =
    Math.max(-1, ...items.map((item) => item.position ?? -1)) + 1;
  const projectSections = [...sectionStats.entries()].filter(
    ([key]) => key !== `id:${UNGROUPED_SCOPE_PROJECT_ID}`,
  );
  const projectAccentClasses = new Map(
    projectSections.map(([key], index) => [
      key,
      `scope-project-accent scope-project-accent-${index % 6}`,
    ]),
  );
  const lastItem = orderedItems.at(-1);
  const newRowAccentClass = compactQuoteRows
    ? lastItem
      ? projectAccentClasses.get(scopeSectionKey(lastItem))
      : undefined
    : undefined;

  function cancelAdding() {
    setAdding(false);
    setNewDraft(draftFrom());
    setError("");
  }

  function updateDraft(
    id: string,
    patch: Partial<ScopeDraft>,
    item: ScopeItem,
  ) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] || draftFrom(item)), ...patch },
    }));
  }

  function dirty(item: ScopeItem) {
    const draft = drafts[item.id] || draftFrom(item);
    return (
      draft.title !== item.title ||
      draft.sectionId !== (item.sectionId || "") ||
      draft.sectionName !== (item.sectionName || "") ||
      draft.details !== (item.details || "") ||
      draft.quantity !== String(item.quantity) ||
      draft.unit !== item.unit ||
      draft.estimate !== String(item.estimate) ||
      draft.subCost !== String(item.subCost) ||
      draft.subCostUnit !== (item.subCostUnit || "job") ||
      draft.subCostQuantity !== String(item.subCostQuantity ?? 1) ||
      draft.materialCost !== String(item.materialCost ?? 0) ||
      draft.materialCostUnit !== (item.materialCostUnit || "job") ||
      draft.materialCostQuantity !== String(item.materialCostQuantity ?? 1) ||
      draft.contractorId !== item.contractorId ||
      draft.status !== item.status
    );
  }

  async function applyBulkPricing() {
    if (!projectId || !onBulkPrice || !selectedItems.length || pricingBusy)
      return;
    if (!multipliersValid) {
      setError("Enter multipliers between 0 and 100.");
      return;
    }
    if (
      saving.size ||
      reorderBusy ||
      sectionSaving ||
      selectedItems.some(dirty)
    ) {
      setError(
        "Save any open edits on selected items before applying pricing.",
      );
      return;
    }
    if (
      selectedItems.some(
        (item) =>
          calculatedQuotePrice(
            item,
            Number(subMultiplier),
            Number(materialMultiplier),
          ) > 1_000_000_000,
      )
    ) {
      setError("A calculated price exceeds the maximum allowed amount.");
      return;
    }
    setPricingBusy(true);
    setError("");
    try {
      const updated = await onBulkPrice(
        projectId,
        selectedItems,
        Number(subMultiplier),
        Number(materialMultiplier),
      );
      setDrafts((current) => {
        const next = { ...current };
        for (const item of updated) next[item.id] = draftFrom(item);
        return next;
      });
      setSelectedIds(new Set());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not apply quote pricing.",
      );
    } finally {
      setPricingBusy(false);
    }
  }

  async function saveRow(item?: ScopeItem) {
    if (!inline || !projectId || !onSave) return;
    const id = item?.id || "new";
    if (saving.has(id) || reorderBusy || pricingBusy) return;
    const draft = item ? drafts[item.id] || draftFrom(item) : newDraft;
    if (!item && !draft.title.trim()) {
      cancelAdding();
      return;
    }
    if (item && !dirty(item)) return;
    setError("");
    try {
      const values = draftValues(draft);
      setSaving((current) => new Set(current).add(id));
      await onSave(
        {
          projectId,
          ...values,
          position:
            item?.position ??
            (item ? orderedItems.indexOf(item) : nextPosition),
        },
        item,
      );
      if (item) {
        setDrafts((current) => ({
          ...current,
          [item.id]: {
            title: values.title,
            sectionId: values.sectionId,
            sectionName: values.sectionName,
            details: values.details,
            quantity: String(values.quantity),
            unit: values.unit,
            estimate: String(values.estimate),
            rate: draft.rate,
            subCost: String(values.subCost),
            subCostUnit: values.subCostUnit,
            subCostQuantity: String(values.subCostQuantity),
            subCostRate: draft.subCostRate,
            materialCost: String(values.materialCost),
            materialCostUnit: values.materialCostUnit,
            materialCostQuantity: String(values.materialCostQuantity),
            materialCostRate: draft.materialCostRate,
            contractorId: values.contractorId,
            status: values.status,
          },
        }));
      } else {
        cancelAdding();
      }
    } catch (saveError) {
      if (item && compactQuoteRows)
        setExpandedItemIds((current) => new Set(current).add(item.id));
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save this scope row.",
      );
    } finally {
      setSaving((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  function rowBlur(
    event: React.FocusEvent<HTMLTableRowElement>,
    item?: ScopeItem,
  ) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    )
      return;
    if (
      event.relatedTarget instanceof Element &&
      event.relatedTarget
        .closest("tr[data-scope-editor-id]")
        ?.getAttribute("data-scope-editor-id") ===
        event.currentTarget.getAttribute("data-scope-editor-id")
    )
      return;
    // A new quote row stays in progress until its Save or Cancel button is used.
    // Existing rows can autosave on blur while remaining visibly expanded.
    if (compactQuoteRows && !item) return;
    void saveRow(item);
  }

  function rowKeyDown(
    event: React.KeyboardEvent<HTMLTableRowElement>,
    item?: ScopeItem,
  ) {
    if (event.key === "Enter") {
      if (
        event.target instanceof HTMLButtonElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      if (
        event.target instanceof HTMLTextAreaElement &&
        !event.ctrlKey &&
        !event.metaKey
      )
        return;
      event.preventDefault();
      void saveRow(item);
    }
    if (event.key === "Escape") {
      if (item)
        setDrafts((current) => ({
          ...current,
          [item.id]: draftFrom(item),
        }));
      else {
        cancelAdding();
      }
      setError("");
    }
  }

  async function moveRow(
    movingId: string,
    targetId: string,
    placement: "before" | "after",
  ) {
    if (!projectId || !onReorder) return;
    if (reorderBusy || sectionSaving || pricingBusy || saving.size) {
      setError("Wait for the current save before moving a quote row.");
      return;
    }
    const next = moveQuoteScopeItem(
      orderedItems,
      movingId,
      targetId,
      placement,
    );
    if (!next) return;
    setPendingOrder(next);
    setReorderBusy(true);
    setError("");
    try {
      await onReorder(projectId, next, movingId);
      const moved = next.find((item) => item.id === movingId)!;
      setDrafts((current) => ({
        ...current,
        [movingId]: {
          ...(current[movingId] || draftFrom(moved)),
          sectionId: moved.sectionId || "",
          sectionName: moved.sectionName || "",
        },
      }));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not reorder quote rows.",
      );
    } finally {
      setPendingOrder(null);
      setReorderBusy(false);
    }
  }

  function dropPlacement(event: React.DragEvent<HTMLTableRowElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2
      ? ("before" as const)
      : ("after" as const);
  }

  async function updateProjectGrouping(
    sectionKey: string,
    name: string | null,
  ) {
    if (!inline || !onSave || sectionSaving || reorderBusy) return;
    const sectionItems = orderedItems.filter(
      (item) => scopeSectionKey(item) === sectionKey,
    );
    if (!sectionItems.length) return;
    const nextName = name?.trim();
    if (name !== null && (!nextName || nextName.length > 250))
      throw new Error("Enter a project name of up to 250 characters.");
    const sectionId =
      name === null
        ? UNGROUPED_SCOPE_PROJECT_ID
        : sectionItems[0].sectionId || crypto.randomUUID();
    const sectionName = name === null ? "" : nextName!;
    setSectionSaving(true);
    setError("");
    try {
      for (const item of sectionItems) {
        await onSave({ ...item, sectionId, sectionName }, item);
      }
      const ids = new Set(sectionItems.map((item) => item.id));
      setDrafts((current) =>
        Object.fromEntries(
          Object.entries(current).map(([id, draft]) => [
            id,
            ids.has(id) ? { ...draft, sectionId, sectionName } : draft,
          ]),
        ),
      );
    } finally {
      setSectionSaving(false);
    }
  }

  return (
    <div className={inline ? "scope-grid" : undefined}>
      {error && (
        <div className="alert scope-grid-error" role="alert">
          {error}
        </div>
      )}
      {reorderBusy && (
        <div className="scope-reorder-status" role="status">
          Saving row order…
        </div>
      )}
      {inline && compactQuoteRows && orderedItems.length > 0 && (
        <div className="scope-bulk-bar">
          <label className="scope-select-all">
            <input
              type="checkbox"
              aria-label="Select all quote items"
              checked={selectedItems.length === orderedItems.length}
              disabled={pricingBusy}
              onChange={(event) =>
                setSelectedIds(
                  event.target.checked
                    ? new Set(orderedItems.map((item) => item.id))
                    : new Set(),
                )
              }
            />
            <span>
              {selectedItems.length
                ? `${selectedItems.length} selected`
                : `Select all ${orderedItems.length} items`}
            </span>
          </label>
          {selectedItems.length > 0 && showInternalCosts && onBulkPrice && (
            <div className="scope-bulk-pricing">
              <span className="scope-bulk-pricing-label">
                Set quote price from costs
              </span>
              <label>
                Sub costs ×{" "}
                <input
                  aria-label="Subcontractor cost multiplier"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={subMultiplier}
                  disabled={pricingBusy}
                  onChange={(event) => setSubMultiplier(event.target.value)}
                />
              </label>
              <label>
                Material costs ×{" "}
                <input
                  aria-label="Material cost multiplier"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={materialMultiplier}
                  disabled={pricingBusy}
                  onChange={(event) =>
                    setMaterialMultiplier(event.target.value)
                  }
                />
              </label>
              <span className="scope-bulk-preview">
                Selected items price:{" "}
                <strong>
                  {multipliersValid ? money(selectedPricingTotal) : "—"}
                </strong>
              </span>
              <button
                className="button primary"
                type="button"
                disabled={pricingBusy || !multipliersValid}
                onClick={() => void applyBulkPricing()}
              >
                {pricingBusy ? "Applying…" : "Apply pricing"}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="table-scroll">
        <table
          className={`scope-table${inline ? " scope-table-editable" : ""}${showStatus ? "" : " scope-table-no-status"}${compactQuoteRows ? " scope-table-compact" : ""}${!showInternalCosts ? " scope-hide-internal-costs" : ""}`}
          aria-label={compactQuoteRows ? "Quote scope and pricing" : undefined}
        >
          {compactQuoteRows ? (
            <colgroup>
              {Array.from({ length: showStatus ? 8 : 7 }, (_, index) => (
                <col key={index} />
              ))}
            </colgroup>
          ) : (
            <thead>
              <tr>
                <th>Work item / contractor</th>
                <th>Pricing basis</th>
                <th>Price / rate</th>
                <th>Sub cost</th>
                <th>Material cost</th>
                <th>Profit</th>
                {showStatus && <th>Status</th>}
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
          )}
          <tbody>
            {orderedItems.map((item, index) => {
              const draft = drafts[item.id] || draftFrom(item);
              const difference =
                draftNumber(draft.estimate) -
                draftNumber(draft.subCost) -
                draftNumber(draft.materialCost);
              const sectionKey = scopeSectionKey(item);
              const startsSection =
                index === 0 ||
                scopeSectionKey(orderedItems[index - 1]) !== sectionKey;
              const section = sectionStats.get(sectionKey);
              return (
                <Fragment key={item.id}>
                  {startsSection &&
                    section &&
                    item.sectionId !== UNGROUPED_SCOPE_PROJECT_ID && (
                      <ScopeSectionRow
                        name={section.name}
                        count={section.count}
                        total={section.total}
                        accentClassName={
                          compactQuoteRows
                            ? projectAccentClasses.get(sectionKey)
                            : undefined
                        }
                        colSpan={showStatus ? 8 : 7}
                        editable={inline && Boolean(onSave)}
                        busy={sectionSaving || reorderBusy}
                        onRename={(name) =>
                          updateProjectGrouping(sectionKey, name)
                        }
                        onRemove={() => updateProjectGrouping(sectionKey, null)}
                      />
                    )}
                  {inline && compactQuoteRows ? (
                    <>
                      <tr
                        className={`scope-summary-row${index % 2 === 1 ? " scope-item-alternate" : ""}${projectAccentClasses.get(sectionKey) ? ` ${projectAccentClasses.get(sectionKey)}` : ""}${dragSourceId === item.id ? " is-dragging" : ""}${dropTarget?.id === item.id ? ` drop-${dropTarget.placement}` : ""}${selectedIds.has(item.id) ? " is-selected" : ""}`}
                        onDragOver={(event) => {
                          if (
                            !dragSourceId ||
                            dragSourceId === item.id ||
                            reorderBusy
                          )
                            return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          const placement = dropPlacement(event);
                          setDropTarget((current) =>
                            current?.id === item.id &&
                            current.placement === placement
                              ? current
                              : { id: item.id, placement },
                          );
                        }}
                        onDragLeave={(event) => {
                          if (
                            !event.relatedTarget ||
                            !event.currentTarget.contains(
                              event.relatedTarget as Node,
                            )
                          )
                            setDropTarget(null);
                        }}
                        onDrop={(event) => {
                          const movingId =
                            event.dataTransfer.getData("text/plain") ||
                            dragSourceId;
                          if (!movingId) return;
                          event.preventDefault();
                          const placement = dropPlacement(event);
                          setDragSourceId("");
                          setDropTarget(null);
                          void moveRow(movingId, item.id, placement);
                        }}
                      >
                        <td colSpan={showStatus ? 8 : 7}>
                          <div className="scope-summary-shell">
                            <label className="scope-row-selection">
                              <input
                                type="checkbox"
                                aria-label={`Select ${draft.title}`}
                                checked={selectedIds.has(item.id)}
                                disabled={pricingBusy}
                                onChange={(event) =>
                                  setSelectedIds((current) => {
                                    const next = new Set(current);
                                    if (event.target.checked) next.add(item.id);
                                    else next.delete(item.id);
                                    return next;
                                  })
                                }
                              />
                            </label>
                            <div className="scope-row-controls">
                              <button
                                type="button"
                                className="scope-row-drag-handle"
                                draggable={
                                  !reorderBusy &&
                                  !sectionSaving &&
                                  !pricingBusy &&
                                  !saving.size
                                }
                                disabled={
                                  reorderBusy ||
                                  sectionSaving ||
                                  pricingBusy ||
                                  Boolean(saving.size)
                                }
                                aria-label={`Drag ${draft.title} to reorder`}
                                title="Drag to reorder this quote row"
                                onDragStart={(event) => {
                                  setDragSourceId(item.id);
                                  event.dataTransfer.effectAllowed = "move";
                                  event.dataTransfer.setData(
                                    "text/plain",
                                    item.id,
                                  );
                                }}
                                onDragEnd={() => {
                                  setDragSourceId("");
                                  setDropTarget(null);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "ArrowUp" && index > 0) {
                                    event.preventDefault();
                                    void moveRow(
                                      item.id,
                                      orderedItems[index - 1].id,
                                      "before",
                                    );
                                  }
                                  if (
                                    event.key === "ArrowDown" &&
                                    index < orderedItems.length - 1
                                  ) {
                                    event.preventDefault();
                                    void moveRow(
                                      item.id,
                                      orderedItems[index + 1].id,
                                      "after",
                                    );
                                  }
                                }}
                              >
                                <GripVertical size={16} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="scope-row-touch-move"
                                disabled={
                                  index === 0 ||
                                  reorderBusy ||
                                  sectionSaving ||
                                  Boolean(saving.size)
                                }
                                aria-label={`Move ${draft.title} up`}
                                onClick={() =>
                                  void moveRow(
                                    item.id,
                                    orderedItems[index - 1].id,
                                    "before",
                                  )
                                }
                              >
                                <ArrowUp size={14} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="scope-row-touch-move"
                                disabled={
                                  index === orderedItems.length - 1 ||
                                  reorderBusy ||
                                  sectionSaving ||
                                  Boolean(saving.size)
                                }
                                aria-label={`Move ${draft.title} down`}
                                onClick={() =>
                                  void moveRow(
                                    item.id,
                                    orderedItems[index + 1].id,
                                    "after",
                                  )
                                }
                              >
                                <ArrowDown size={14} aria-hidden="true" />
                              </button>
                            </div>
                            <button
                              type="button"
                              className="scope-summary-button"
                              aria-label={`Edit ${draft.title}`}
                              aria-expanded={expandedItemIds.has(item.id)}
                              onClick={() =>
                                setExpandedItemIds((current) => {
                                  const next = new Set(current);
                                  if (next.has(item.id)) next.delete(item.id);
                                  else next.add(item.id);
                                  return next;
                                })
                              }
                            >
                              <span>
                                <small>Work item</small>
                                <strong>{draft.title}</strong>
                              </span>
                              <span>
                                <small>Scope</small>
                                <span className="scope-summary-scope">
                                  {draft.details || "No scope details"}
                                </span>
                              </span>
                              <span>
                                <small>Contractor</small>
                                <span>
                                  {workspace.contractors.find(
                                    (contractor) =>
                                      contractor.id === draft.contractorId,
                                  )?.name || "Unassigned"}
                                </span>
                              </span>
                              <span>
                                <small>Quote price</small>
                                <strong>
                                  {money(draftNumber(draft.estimate))}
                                </strong>
                              </span>
                              <span>
                                <small>Total costs</small>
                                <span>
                                  {money(
                                    draftNumber(draft.subCost) +
                                      draftNumber(draft.materialCost),
                                  )}
                                </span>
                              </span>
                              <span>
                                <small>Profit</small>
                                <strong
                                  className={
                                    difference < 0 ? "is-overdue" : undefined
                                  }
                                >
                                  {money(difference)}
                                </strong>
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedItemIds.has(item.id) && (
                        <CompactQuoteEditor
                          draft={draft}
                          workspace={workspace}
                          difference={difference}
                          alternateShade={index % 2 === 1}
                          accentClassName={projectAccentClasses.get(sectionKey)}
                          saving={saving.has(item.id)}
                          dirty={dirty(item)}
                          compact
                          focusTitle
                          editorId={item.id}
                          showStatus={showStatus}
                          showInternalCosts={showInternalCosts}
                          onChange={(patch) =>
                            updateDraft(item.id, patch, item)
                          }
                          onSave={() => void saveRow(item)}
                          onDelete={() => onDelete(item)}
                          onBlur={(event) => rowBlur(event, item)}
                          onKeyDown={(event) => rowKeyDown(event, item)}
                        />
                      )}
                    </>
                  ) : inline ? (
                    <EditableRow
                      draft={draft}
                      workspace={workspace}
                      difference={difference}
                      alternateShade={index % 2 === 1}
                      accentClassName={
                        compactQuoteRows
                          ? projectAccentClasses.get(sectionKey)
                          : undefined
                      }
                      saving={saving.has(item.id)}
                      dirty={dirty(item)}
                      compact={compactQuoteRows}
                      focusTitle={
                        compactQuoteRows && expandedItemIds.has(item.id)
                      }
                      editorId={item.id}
                      showStatus={showStatus}
                      onChange={(patch) => updateDraft(item.id, patch, item)}
                      onSave={() => void saveRow(item)}
                      onDelete={() => onDelete(item)}
                      onBlur={(event) => rowBlur(event, item)}
                      onKeyDown={(event) => rowKeyDown(event, item)}
                    />
                  ) : (
                    <tr>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => onEdit?.(item)}
                        >
                          {item.title}
                        </button>
                        <small>
                          {workspace.contractors.find(
                            (contractor) => contractor.id === item.contractorId,
                          )?.name || "Unassigned"}
                        </small>
                      </td>
                      <td className="nowrap">
                        {item.quantity.toLocaleString()}{" "}
                        {item.unit === "job"
                          ? item.quantity === 1
                            ? "job"
                            : "jobs"
                          : item.unit}
                      </td>
                      <td>{money(item.estimate)}</td>
                      <td>{money(item.subCost)}</td>
                      <td>{money(item.materialCost ?? 0)}</td>
                      <td
                        className={
                          scopeDifference(item) < 0 ? "is-overdue" : ""
                        }
                      >
                        {money(scopeDifference(item))}
                      </td>
                      {showStatus && (
                        <td>
                          <Badge status={item.status} />
                        </td>
                      )}
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            onClick={() => onEdit?.(item)}
                            aria-label={`Edit ${item.title}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="icon-button delete-action"
                            onClick={() => onDelete(item)}
                            aria-label={`Delete ${item.title}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {inline &&
              adding &&
              (compactQuoteRows ? (
                <CompactQuoteEditor
                  draft={newDraft}
                  workspace={workspace}
                  difference={
                    draftNumber(newDraft.estimate) -
                    draftNumber(newDraft.subCost) -
                    draftNumber(newDraft.materialCost)
                  }
                  alternateShade={orderedItems.length % 2 === 1}
                  accentClassName={newRowAccentClass}
                  saving={saving.has("new")}
                  dirty
                  compact
                  editorId="new"
                  showStatus={showStatus}
                  showInternalCosts={showInternalCosts}
                  newRow
                  titleRef={newTitle}
                  onChange={(patch) =>
                    setNewDraft((current) => ({ ...current, ...patch }))
                  }
                  onSave={() => void saveRow()}
                  onDelete={cancelAdding}
                  onBlur={(event) => rowBlur(event)}
                  onKeyDown={(event) => rowKeyDown(event)}
                />
              ) : (
                <EditableRow
                  draft={newDraft}
                  workspace={workspace}
                  difference={
                    draftNumber(newDraft.estimate) -
                    draftNumber(newDraft.subCost) -
                    draftNumber(newDraft.materialCost)
                  }
                  alternateShade={orderedItems.length % 2 === 1}
                  accentClassName={newRowAccentClass}
                  saving={saving.has("new")}
                  dirty
                  compact={compactQuoteRows}
                  editorId="new"
                  showStatus={showStatus}
                  newRow
                  titleRef={newTitle}
                  onChange={(patch) =>
                    setNewDraft((current) => ({ ...current, ...patch }))
                  }
                  onSave={() => void saveRow()}
                  onDelete={cancelAdding}
                  onBlur={(event) => rowBlur(event)}
                  onKeyDown={(event) => rowKeyDown(event)}
                />
              ))}
            {inline && !adding && (
              <tr className="scope-add-row">
                <td colSpan={showStatus ? 8 : 7}>
                  <div className="scope-add-actions">
                    {pricebookEnabled && (
                      <button
                        type="button"
                        className="scope-add-row-button"
                        disabled={pricebookBusy}
                        onClick={() => setPricebookOpen(true)}
                      >
                        <Plus size={15} />
                        Add Item
                      </button>
                    )}
                    <button
                      type="button"
                      className="scope-add-row-button"
                      onClick={() => {
                        setError("");
                        setNewDraft({
                          ...draftFrom(),
                          sectionId:
                            lastItem?.sectionId === UNGROUPED_SCOPE_PROJECT_ID
                              ? ""
                              : lastItem?.sectionId || "",
                          sectionName:
                            lastItem?.sectionId === UNGROUPED_SCOPE_PROJECT_ID
                              ? defaultSectionName
                              : lastItem?.sectionName || defaultSectionName,
                        });
                        setAdding(true);
                      }}
                    >
                      <Plus size={15} />
                      Add Custom
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            {showInternalCosts ? (
              <tr>
                <td colSpan={2}>Scope totals</td>
                <td>{money(estimated)}</td>
                <td>{money(subCosts)}</td>
                <td>{money(materialCosts)}</td>
                <td>{money(estimated - costs)}</td>
                <td colSpan={showStatus ? 2 : 1} />
              </tr>
            ) : (
              <tr>
                <td colSpan={showStatus ? 8 : 7}>
                  Quote price: {money(estimated)}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
      {pricebookOpen && (
        <PricebookPicker
          items={pricebookItems}
          contractors={workspace.contractors}
          busy={pricebookBusy}
          showInternalCosts={showInternalCosts}
          onClose={() => {
            if (!pricebookBusy) setPricebookOpen(false);
          }}
          onAdd={async (item, quantity, contractorId) => {
            if (!onSave || !projectId)
              throw new Error("This quote is unavailable.");
            setPricebookBusy(true);
            try {
              await onSave({
                projectId,
                ...pricebookScopeValues(item, quantity, contractorId),
                sectionId: lastItem?.sectionId || "",
                sectionName: lastItem?.sectionName || defaultSectionName,
                position: nextPosition,
                contractorId,
                status: "To do",
              });
            } finally {
              setPricebookBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

function ScopeSectionRow({
  name,
  count,
  total,
  accentClassName,
  colSpan,
  editable = false,
  busy = false,
  onRename,
  onRemove,
}: {
  name: string;
  count: number;
  total: number;
  accentClassName?: string;
  colSpan: number;
  editable?: boolean;
  busy?: boolean;
  onRename?: (name: string) => Promise<void>;
  onRemove?: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const cancelRef = useRef(false);

  async function rename() {
    if (!onRename || busy || savingRef.current || cancelRef.current) return;
    if (draft.trim() === name) {
      setEditing(false);
      return;
    }
    savingRef.current = true;
    setError("");
    try {
      await onRename(draft);
      setEditing(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not rename project.",
      );
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      savingRef.current = false;
    }
  }

  function cancelRename() {
    cancelRef.current = true;
    setDraft(name);
    setEditing(false);
    setError("");
  }

  async function remove() {
    if (!onRemove || busy) return;
    setError("");
    try {
      await onRemove();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not remove project grouping.",
      );
    }
  }

  return (
    <tr
      className={`scope-section-row${accentClassName ? ` ${accentClassName}` : ""}`}
    >
      <td colSpan={colSpan}>
        <div className="scope-section-heading">
          <div className="scope-section-title">
            <span>Project</span>
            {editing ? (
              <form
                className="scope-section-edit"
                onSubmit={(event) => {
                  event.preventDefault();
                  void rename();
                }}
              >
                <input
                  ref={inputRef}
                  aria-label={`Project name for ${name}`}
                  value={draft}
                  maxLength={250}
                  disabled={busy}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => void rename()}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      cancelRename();
                    }
                  }}
                  autoFocus
                  required
                />
              </form>
            ) : (
              <button
                type="button"
                className="scope-section-name"
                aria-label={`Rename project ${name}`}
                title="Click to rename project"
                disabled={busy}
                onClick={() => {
                  cancelRef.current = false;
                  setDraft(name);
                  setError("");
                  setEditing(true);
                }}
              >
                {name}
              </button>
            )}
          </div>
          <div className="scope-section-tools">
            <small>
              {count} {count === 1 ? "item" : "items"} · {money(total)}
            </small>
            {editable && !editing && (
              <>
                <button
                  type="button"
                  className="icon-button delete-action"
                  aria-label={`Remove project ${name}`}
                  title="Remove project grouping; keep quote rows"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>
        {error && (
          <small className="scope-section-error" role="alert">
            {error}
          </small>
        )}
      </td>
    </tr>
  );
}

function EditableRow({
  draft,
  workspace,
  difference,
  alternateShade,
  accentClassName,
  saving,
  dirty,
  compact,
  focusTitle = false,
  editorId,
  showStatus,
  newRow = false,
  titleRef,
  onChange,
  onSave,
  onDelete,
  onBlur,
  onKeyDown,
}: {
  draft: ScopeDraft;
  workspace: Workspace;
  difference: number;
  alternateShade: boolean;
  accentClassName?: string;
  saving: boolean;
  dirty: boolean;
  compact: boolean;
  focusTitle?: boolean;
  editorId: string;
  showStatus: boolean;
  newRow?: boolean;
  titleRef?: React.RefObject<HTMLInputElement | null>;
  onChange: (patch: Partial<ScopeDraft>) => void;
  onSave: () => void;
  onDelete: () => void;
  onBlur: (event: React.FocusEvent<HTMLTableRowElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => void;
}) {
  const mainRow = (
    <tr
      className={`${newRow ? "scope-new-row " : ""}${compact ? "scope-edit-row" : ""}${compact && alternateShade ? " scope-item-alternate" : ""}${accentClassName ? ` ${accentClassName}` : ""}`}
      data-scope-editor-id={editorId}
      aria-busy={saving}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      <td>
        {compact && <span className="scope-field-label">Work item</span>}
        <input
          ref={titleRef}
          autoFocus={focusTitle}
          className="scope-cell-input scope-title-input"
          aria-label={newRow ? "New work item" : `Work item ${draft.title}`}
          placeholder="Work item"
          maxLength={250}
          value={draft.title}
          disabled={saving}
          onChange={(event) => onChange({ title: event.target.value })}
        />
        {!compact && (
          <>
            <textarea
              className="scope-cell-input scope-details-input"
              aria-label={`Details for ${draft.title || "new work item"}`}
              placeholder="Scope details"
              rows={detailRowCount(draft.details)}
              maxLength={15000}
              value={draft.details}
              disabled={saving}
              onChange={(event) => onChange({ details: event.target.value })}
            />
            <select
              className="scope-cell-select scope-contractor-select"
              aria-label={`Contractor for ${draft.title || "new work item"}`}
              value={draft.contractorId}
              disabled={saving}
              onChange={(event) =>
                onChange({ contractorId: event.target.value })
              }
            >
              <option value="">Unassigned</option>
              {workspace.contractors.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} · {candidate.trade || candidate.company}
                </option>
              ))}
            </select>
          </>
        )}
      </td>
      <td
        colSpan={compact ? 2 : undefined}
        className={compact ? "scope-pricing-cell" : undefined}
      >
        {compact && (
          <span className="scope-field-label scope-pricing-heading">
            Customer price
          </span>
        )}
        <div
          className={
            compact
              ? "scope-pricing-controls"
              : "scope-quantity-cell scope-sale-basis"
          }
        >
          <label className="scope-field-stack">
            {compact && (
              <span className="scope-field-label">
                {quantityLabel(draft.unit)}
              </span>
            )}
            <input
              className="scope-cell-input scope-number-input"
              aria-label={`${quantityLabel(draft.unit)} for ${draft.title || "new work item"}`}
              type="number"
              min="0"
              max="1000000000"
              step={
                draft.unit === "job" || draft.unit === "each" ? "1" : "0.01"
              }
              value={draft.quantity}
              disabled={saving}
              onChange={(event) => {
                const quantity = event.target.value;
                onChange({
                  quantity,
                  estimate: String(
                    lineTotal(Number(quantity), Number(draft.rate)),
                  ),
                });
              }}
            />
          </label>
          <label className="scope-field-stack">
            {compact && <span className="scope-field-label">Price by</span>}
            <select
              className="scope-cell-select scope-unit-select"
              aria-label={`Unit for ${draft.title || "new work item"}`}
              value={draft.unit}
              disabled={saving}
              onChange={(event) => {
                const unit = event.target.value;
                onChange({
                  unit,
                  quantity: "1",
                  rate: draft.estimate,
                });
              }}
            >
              {salePricingBases.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
          {compact && (
            <label className="scope-field-stack">
              <span className="scope-field-label">{rateLabel(draft.unit)}</span>
              <span className="scope-pricing-rate">
                <span aria-hidden="true">$</span>
                <input
                  className="scope-cell-input scope-money-input"
                  aria-label={`${rateLabel(draft.unit)} for ${draft.title || "new work item"}`}
                  type="number"
                  min="0"
                  max="1000000000"
                  step="any"
                  value={draft.rate}
                  disabled={saving}
                  onChange={(event) => {
                    const rate = event.target.value;
                    onChange({
                      rate,
                      estimate: String(
                        lineTotal(Number(draft.quantity), Number(rate)),
                      ),
                    });
                  }}
                />
              </span>
            </label>
          )}
        </div>
        {compact && (
          <small className="scope-pricing-total">
            Total {money(draftNumber(draft.estimate))}
          </small>
        )}
      </td>
      {!compact && (
        <MoneyCell
          label={`${rateLabel(draft.unit)} for ${draft.title || "new work item"}`}
          value={draft.rate}
          hint={`Line total ${money(draftNumber(draft.estimate))}`}
          step="any"
          disabled={saving}
          onChange={(value) =>
            onChange({
              rate: value,
              estimate: String(
                lineTotal(Number(draft.quantity), Number(value)),
              ),
            })
          }
        />
      )}
      <CostCell
        heading="Sub cost"
        compact={compact}
        label="Subcontractor cost"
        itemName={draft.title || "new work item"}
        unit={draft.subCostUnit}
        quantity={draft.subCostQuantity}
        rate={draft.subCostRate}
        total={draft.subCost}
        saleUnit={draft.unit}
        saleQuantity={draft.quantity}
        disabled={saving}
        onChange={(cost) =>
          onChange({
            subCostUnit: cost.unit,
            subCostQuantity: cost.quantity,
            subCostRate: cost.rate,
            subCost: cost.total,
          })
        }
      />
      <CostCell
        heading="Material cost"
        compact={compact}
        label="Material cost"
        itemName={draft.title || "new work item"}
        unit={draft.materialCostUnit}
        quantity={draft.materialCostQuantity}
        rate={draft.materialCostRate}
        total={draft.materialCost}
        saleUnit={draft.unit}
        saleQuantity={draft.quantity}
        disabled={saving}
        onChange={(cost) =>
          onChange({
            materialCostUnit: cost.unit,
            materialCostQuantity: cost.quantity,
            materialCostRate: cost.rate,
            materialCost: cost.total,
          })
        }
      />
      <td
        className={
          difference < 0 ? "is-overdue scope-calculated" : "scope-calculated"
        }
      >
        {compact && <span className="scope-field-label">Profit</span>}
        <output
          className="scope-calculated-value"
          aria-label={`Profit for ${draft.title || "new work item"}`}
        >
          {money(difference)}
        </output>
      </td>
      {showStatus && (
        <td>
          {compact && <span className="scope-field-label">Status</span>}
          <select
            className={`scope-status-select scope-status-${draft.status
              .toLowerCase()
              .replaceAll(" ", "-")}`}
            aria-label={`Status for ${draft.title || "new work item"}`}
            value={draft.status}
            disabled={saving}
            onChange={(event) =>
              onChange({ status: event.target.value as TaskStatus })
            }
          >
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </td>
      )}
      <td>
        <div className="row-actions scope-row-actions">
          {saving ? (
            <span className="scope-row-saving" aria-label="Saving row">
              <LoaderCircle size={14} className="spin" />
            </span>
          ) : (
            dirty && (
              <button
                type="button"
                className="icon-button scope-save-row"
                onClick={onSave}
                aria-label={`Save ${draft.title || "new row"}`}
              >
                <Check size={14} />
              </button>
            )
          )}
          <button
            type="button"
            className={`icon-button${newRow ? "" : " delete-action"}`}
            disabled={saving}
            onClick={onDelete}
            aria-label={
              newRow ? "Cancel new row" : `Delete ${draft.title || "scope row"}`
            }
          >
            {newRow ? <X size={14} /> : <Trash2 size={14} />}
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <Fragment>
      {mainRow}
      {compact && (
        <tr
          className={`scope-row-detail-editor${alternateShade ? " scope-item-alternate" : ""}${accentClassName ? ` ${accentClassName}` : ""}`}
          data-scope-editor-id={editorId}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        >
          <td colSpan={showStatus ? 8 : 7}>
            <div className="scope-row-detail-fields">
              <label>
                <span>Scope details</span>
                <textarea
                  className="scope-cell-input scope-details-input"
                  aria-label={`Details for ${draft.title || "new work item"}`}
                  rows={1}
                  maxLength={15000}
                  value={draft.details}
                  disabled={saving}
                  onChange={(event) =>
                    onChange({ details: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Contractor</span>
                <select
                  className="scope-cell-select"
                  value={draft.contractorId}
                  disabled={saving}
                  onChange={(event) =>
                    onChange({ contractorId: event.target.value })
                  }
                >
                  <option value="">Unassigned</option>
                  {workspace.contractors.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name} · {candidate.trade || candidate.company}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function CompactQuoteEditor({
  draft,
  workspace,
  difference,
  alternateShade,
  accentClassName,
  saving,
  dirty,
  focusTitle = false,
  editorId,
  showStatus,
  showInternalCosts = true,
  newRow = false,
  titleRef,
  onChange,
  onSave,
  onDelete,
  onBlur,
  onKeyDown,
}: Parameters<typeof EditableRow>[0] & { showInternalCosts?: boolean }) {
  const itemName = draft.title || "new work item";
  const totalCosts =
    draftNumber(draft.subCost) + draftNumber(draft.materialCost);

  return (
    <tr
      className={`scope-inspector-row${newRow ? " scope-new-row" : ""}${alternateShade ? " scope-item-alternate" : ""}${accentClassName ? ` ${accentClassName}` : ""}`}
      data-scope-editor-id={editorId}
      aria-busy={saving}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      <td colSpan={showStatus ? 8 : 7}>
        <div className="scope-inspector">
          <div className="scope-inspector-header">
            <label className="scope-inspector-title">
              <span>Work item</span>
              <input
                ref={titleRef}
                autoFocus={focusTitle}
                className="scope-cell-input scope-title-input"
                aria-label={
                  newRow ? "New work item" : `Work item ${draft.title}`
                }
                placeholder="Work item"
                maxLength={250}
                value={draft.title}
                disabled={saving}
                onChange={(event) => onChange({ title: event.target.value })}
              />
            </label>
            <label className="scope-inspector-contractor">
              <span>Contractor</span>
              <select
                className="scope-cell-select"
                aria-label={`Contractor for ${itemName}`}
                value={draft.contractorId}
                disabled={saving}
                onChange={(event) =>
                  onChange({ contractorId: event.target.value })
                }
              >
                <option value="">Unassigned</option>
                {workspace.contractors.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} · {candidate.trade || candidate.company}
                  </option>
                ))}
              </select>
            </label>
            {showStatus && (
              <label className="scope-inspector-status">
                <span>Status</span>
                <select
                  className="scope-status-select"
                  aria-label={`Status for ${itemName}`}
                  value={draft.status}
                  disabled={saving}
                  onChange={(event) =>
                    onChange({ status: event.target.value as TaskStatus })
                  }
                >
                  {statuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="scope-inspector-actions">
              {saving ? (
                <span className="scope-row-saving" aria-label="Saving row">
                  <LoaderCircle size={14} className="spin" />
                </span>
              ) : (
                dirty && (
                  <button
                    type="button"
                    className="icon-button scope-save-row"
                    onClick={onSave}
                    aria-label={`Save ${itemName}`}
                  >
                    <Check size={14} />
                  </button>
                )
              )}
              <button
                type="button"
                className={`icon-button${newRow ? "" : " delete-action"}`}
                disabled={saving}
                onClick={onDelete}
                aria-label={newRow ? "Cancel new row" : `Delete ${itemName}`}
              >
                {newRow ? <X size={14} /> : <Trash2 size={14} />}
              </button>
            </div>
            <label className="scope-inspector-scope">
              <span>Scope details</span>
              <textarea
                className="scope-cell-input scope-details-input"
                aria-label={`Details for ${itemName}`}
                placeholder="Describe the work included"
                rows={detailRowCount(draft.details)}
                maxLength={15000}
                value={draft.details}
                disabled={saving}
                onChange={(event) => onChange({ details: event.target.value })}
              />
            </label>
          </div>

          <div className="scope-inspector-body">
            <div className="scope-inspector-pricing">
              <div className="scope-inspector-pricing-title">
                {showInternalCosts
                  ? "Enter costs, then set customer pricing"
                  : "Customer pricing"}
              </div>
              <div className="scope-inspector-price-groups">
                <QuoteCostGroup
                  heading="Sub cost"
                  label="Subcontractor cost"
                  itemName={itemName}
                  unit={draft.subCostUnit}
                  quantity={draft.subCostQuantity}
                  rate={draft.subCostRate}
                  total={draft.subCost}
                  saleUnit={draft.unit}
                  saleQuantity={draft.quantity}
                  disabled={saving}
                  onChange={(cost) =>
                    onChange({
                      subCostUnit: cost.unit,
                      subCostQuantity: cost.quantity,
                      subCostRate: cost.rate,
                      subCost: cost.total,
                    })
                  }
                />
                <QuoteCostGroup
                  heading="Material cost"
                  label="Material cost"
                  itemName={itemName}
                  unit={draft.materialCostUnit}
                  quantity={draft.materialCostQuantity}
                  rate={draft.materialCostRate}
                  total={draft.materialCost}
                  saleUnit={draft.unit}
                  saleQuantity={draft.quantity}
                  disabled={saving}
                  onChange={(cost) =>
                    onChange({
                      materialCostUnit: cost.unit,
                      materialCostQuantity: cost.quantity,
                      materialCostRate: cost.rate,
                      materialCost: cost.total,
                    })
                  }
                />
                <div className="scope-inspector-price-group scope-inspector-customer-price">
                  <span className="scope-inspector-group-title">
                    Customer price
                  </span>
                  <div className="scope-inspector-basis-row">
                    <label>
                      <span>{quantityLabel(draft.unit)}</span>
                      <input
                        className="scope-cell-input scope-number-input"
                        aria-label={`${quantityLabel(draft.unit)} for ${itemName}`}
                        type="number"
                        min="0"
                        max="1000000000"
                        step={
                          draft.unit === "job" || draft.unit === "each"
                            ? "1"
                            : "0.01"
                        }
                        value={draft.quantity}
                        disabled={saving}
                        onChange={(event) => {
                          const quantity = event.target.value;
                          onChange({
                            quantity,
                            estimate: String(
                              lineTotal(Number(quantity), Number(draft.rate)),
                            ),
                          });
                        }}
                      />
                    </label>
                    <label>
                      <span>Price by</span>
                      <select
                        className="scope-cell-select"
                        aria-label={`Unit for ${itemName}`}
                        value={draft.unit}
                        disabled={saving}
                        onChange={(event) =>
                          onChange({
                            unit: event.target.value,
                            quantity: "1",
                            rate: draft.estimate,
                          })
                        }
                      >
                        {salePricingBases.map((unit) => (
                          <option key={unit.value} value={unit.value}>
                            {unit.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="scope-inspector-rate">
                    <span>{rateLabel(draft.unit)}</span>
                    <span className="scope-pricing-rate">
                      <span aria-hidden="true">$</span>
                      <input
                        className="scope-cell-input scope-money-input"
                        aria-label={`${rateLabel(draft.unit)} for ${itemName}`}
                        type="number"
                        min="0"
                        max="1000000000"
                        step="any"
                        value={draft.rate}
                        disabled={saving}
                        onChange={(event) => {
                          const rate = event.target.value;
                          onChange({
                            rate,
                            estimate: String(
                              lineTotal(Number(draft.quantity), Number(rate)),
                            ),
                          });
                        }}
                      />
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="scope-inspector-totals">
            <span>
              <small>Quote price</small>
              <strong>{money(draftNumber(draft.estimate))}</strong>
            </span>
            <span>
              <small>Total costs</small>
              <strong>{money(totalCosts)}</strong>
            </span>
            <span className="scope-inspector-profit">
              <small>Profit</small>
              <strong className={difference < 0 ? "is-overdue" : undefined}>
                {money(difference)}
              </strong>
            </span>
          </div>
        </div>
      </td>
    </tr>
  );
}

function QuoteCostGroup({
  heading,
  label,
  itemName,
  unit,
  quantity,
  rate,
  total,
  saleUnit,
  saleQuantity,
  disabled,
  onChange,
}: {
  heading: string;
  label: string;
  itemName: string;
  unit: string;
  quantity: string;
  rate: string;
  total: string;
  saleUnit: string;
  saleQuantity: string;
  disabled: boolean;
  onChange: (value: {
    unit: string;
    quantity: string;
    rate: string;
    total: string;
  }) => void;
}) {
  return (
    <div className="scope-inspector-price-group">
      <span className="scope-inspector-group-title">{heading}</span>
      <div className="scope-inspector-basis-row">
        <label>
          <span>{unit === "job" ? "Fixed qty" : quantityLabel(unit)}</span>
          {unit === "job" ? (
            <span
              className="scope-cell-input scope-fixed-quantity"
              aria-label={`${label} fixed quantity for ${itemName}`}
            >
              1
            </span>
          ) : (
            <input
              className="scope-cell-input scope-number-input"
              aria-label={`${quantityLabel(unit)} for ${label.toLowerCase()} of ${itemName}`}
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              value={quantity}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  unit,
                  quantity: event.target.value,
                  rate,
                  total: String(
                    lineTotal(Number(event.target.value), Number(rate)),
                  ),
                })
              }
            />
          )}
        </label>
        <label>
          <span>Cost by</span>
          <select
            className="scope-cell-select"
            aria-label={`${label} basis for ${itemName}`}
            value={unit}
            disabled={disabled}
            onChange={(event) => {
              const nextUnit = event.target.value;
              const nextQuantity =
                nextUnit === "job"
                  ? 1
                  : nextUnit === saleUnit
                    ? Math.max(1, Number(saleQuantity) || 1)
                    : 1;
              onChange({
                unit: nextUnit,
                quantity: String(nextQuantity),
                rate: String(rateFromTotal(Number(total), nextQuantity)),
                total,
              });
            }}
          >
            {pricingBases.map((basis) => (
              <option key={basis.value} value={basis.value}>
                {basis.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="scope-inspector-rate">
        <span>{costRateLabel(unit)}</span>
        <span className="scope-pricing-rate">
          <span aria-hidden="true">$</span>
          <input
            className="scope-cell-input scope-money-input"
            aria-label={`${label}: ${costRateLabel(unit)} for ${itemName}`}
            type="number"
            min="0"
            max="1000000000"
            step={unit === "job" ? "0.01" : "any"}
            value={unit === "job" ? total : rate}
            disabled={disabled}
            onChange={(event) => {
              const nextRate = event.target.value;
              onChange({
                unit,
                quantity,
                rate: nextRate,
                total:
                  unit === "job"
                    ? nextRate
                    : String(lineTotal(Number(quantity), Number(nextRate))),
              });
            }}
          />
        </span>
      </label>
    </div>
  );
}

function MoneyCell({
  heading,
  label,
  value,
  hint,
  step = "0.01",
  disabled,
  onChange,
}: {
  heading?: string;
  label: string;
  value: string;
  hint?: string;
  step?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <td className="scope-money-cell">
      {heading && <span className="scope-field-label">{heading}</span>}
      <span className="scope-currency-symbol" aria-hidden="true">
        $
      </span>
      <input
        className="scope-cell-input scope-money-input"
        aria-label={label}
        type="number"
        min="0"
        max="1000000000"
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <small className="scope-line-total">{hint}</small> : null}
    </td>
  );
}

function CostCell({
  heading,
  compact,
  label,
  itemName,
  unit,
  quantity,
  rate,
  total,
  saleUnit,
  saleQuantity,
  disabled,
  onChange,
}: {
  heading: string;
  compact: boolean;
  label: string;
  itemName: string;
  unit: string;
  quantity: string;
  rate: string;
  total: string;
  saleUnit: string;
  saleQuantity: string;
  disabled: boolean;
  onChange: (value: {
    unit: string;
    quantity: string;
    rate: string;
    total: string;
  }) => void;
}) {
  return (
    <td className={`scope-cost-cell${compact ? " scope-pricing-cell" : ""}`}>
      <span
        className={`scope-field-label${compact ? " scope-pricing-heading" : ""}`}
      >
        {heading}
      </span>
      <div className={`scope-cost-controls${unit === "job" ? " is-flat" : ""}`}>
        <div
          className={`scope-quantity-cell${unit === "job" ? " is-flat" : ""}`}
        >
          {unit === "job" && compact && (
            <span className="scope-field-stack scope-fixed-quantity">
              <span className="scope-field-label">Fixed qty</span>
              <span
                className="scope-cell-input"
                aria-label={`${label} fixed quantity for ${itemName}`}
              >
                1
              </span>
            </span>
          )}
          {unit !== "job" && (
            <label className="scope-field-stack">
              {compact && (
                <span className="scope-field-label">{quantityLabel(unit)}</span>
              )}
              <input
                className="scope-cell-input scope-number-input"
                aria-label={`${quantityLabel(unit)} for ${label.toLowerCase()} of ${itemName}`}
                type="number"
                min="0"
                max="1000000000"
                step="0.01"
                value={quantity}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    unit,
                    quantity: event.target.value,
                    rate,
                    total: String(
                      lineTotal(Number(event.target.value), Number(rate)),
                    ),
                  })
                }
              />
            </label>
          )}
          <label className="scope-field-stack">
            {compact && <span className="scope-field-label">Cost by</span>}
            <select
              className="scope-cell-select scope-unit-select"
              aria-label={`${label} basis for ${itemName}`}
              value={unit}
              disabled={disabled}
              onChange={(event) => {
                const nextUnit = event.target.value;
                const nextQuantity =
                  nextUnit === "job"
                    ? 1
                    : nextUnit === saleUnit
                      ? Math.max(1, Number(saleQuantity) || 1)
                      : 1;
                onChange({
                  unit: nextUnit,
                  quantity: String(nextQuantity),
                  rate: String(rateFromTotal(Number(total), nextQuantity)),
                  total,
                });
              }}
            >
              {pricingBases.map((basis) => (
                <option key={basis.value} value={basis.value}>
                  {basis.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="scope-cost-rate">
          {compact && (
            <span className="scope-field-label">{costRateLabel(unit)}</span>
          )}
          <span className="scope-pricing-rate">
            <span aria-hidden="true">$</span>
            <input
              className="scope-cell-input scope-money-input"
              aria-label={`${label}: ${costRateLabel(unit)} for ${itemName}`}
              type="number"
              min="0"
              max="1000000000"
              step={unit === "job" ? "0.01" : "any"}
              value={unit === "job" ? total : rate}
              disabled={disabled}
              onChange={(event) => {
                const nextRate = event.target.value;
                onChange({
                  unit,
                  quantity,
                  rate: nextRate,
                  total:
                    unit === "job"
                      ? nextRate
                      : String(lineTotal(Number(quantity), Number(nextRate))),
                });
              }}
            />
          </span>
        </div>
      </div>
      {(compact || unit !== "job") && (
        <small className={compact ? "scope-pricing-total" : "scope-line-total"}>
          Total {money(draftNumber(total))}
        </small>
      )}
    </td>
  );
}
