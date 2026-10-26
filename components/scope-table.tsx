"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  FolderPlus,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { ScopeItem, TaskStatus, Workspace } from "@/lib/types";
import type {
  BathroomQuestionnaireAnswers,
  BathroomQuestionnaireProject,
  GeneratedBathroomScopeRow,
} from "@/lib/bathroom-questionnaire";
import {
  projectMoney as money,
  scopeTotal,
  scopeCosts,
  scopeDifference,
} from "@/lib/project-finances";
import {
  lineTotal,
  pricingBases,
  rateFromTotal,
  rateLabel,
} from "@/lib/scope-pricing";
import { Badge, Empty, Modal } from "./ui";
import BathroomQuestionnaire from "./bathroom-questionnaire";
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
    quantity:
      draft.unit === "job" ? 1 : numberValue(draft.quantity, "Quantity"),
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

function ordered(items: ScopeItem[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.position !== undefined && b.item.position !== undefined)
        return a.item.position - b.item.position || a.index - b.index;
      if (a.item.position !== undefined) return -1;
      if (b.item.position !== undefined) return 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
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
  onSaveMany,
  templateProject,
  onSaveTemplateProject,
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
  onSaveMany?: (rows: Record<string, unknown>[]) => Promise<unknown>;
  templateProject?: Partial<BathroomQuestionnaireProject>;
  onSaveTemplateProject?: (
    project: BathroomQuestionnaireProject,
  ) => Promise<unknown>;
  defaultSectionName?: string;
}) {
  const orderedItems = useMemo(() => ordered(items), [items]);
  const [drafts, setDrafts] = useState<Record<string, ScopeDraft>>(() =>
    Object.fromEntries(orderedItems.map((item) => [item.id, draftFrom(item)])),
  );
  const [adding, setAdding] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [newDraft, setNewDraft] = useState<ScopeDraft>(() => draftFrom());
  const [saving, setSaving] = useState<Set<string>>(() => new Set());
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [sectionSaving, setSectionSaving] = useState(false);
  const newTitle = useRef<HTMLInputElement>(null);
  const newProjectName = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) (addingProject ? newProjectName : newTitle).current?.focus();
  }, [adding, addingProject]);

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
  const newProjectAccentClass = `scope-project-accent scope-project-accent-${projectSections.length % 6}`;
  const lastItem = orderedItems.at(-1);
  const newRowAccentClass = compactQuoteRows
    ? addingProject
      ? newProjectAccentClass
      : lastItem
        ? projectAccentClasses.get(scopeSectionKey(lastItem))
        : undefined
    : undefined;
  let nextProjectNumber = projectSections.length + 1;
  while (
    projectSections.some(
      ([, section]) => section.name === `Project #${nextProjectNumber}`,
    )
  )
    nextProjectNumber++;
  const nextProjectName = `Project #${nextProjectNumber}`;

  function cancelAdding() {
    setAdding(false);
    setAddingProject(false);
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

  async function saveRow(item?: ScopeItem) {
    if (!inline || !projectId || !onSave) return;
    const id = item?.id || "new";
    if (saving.has(id)) return;
    const draft = item ? drafts[item.id] || draftFrom(item) : newDraft;
    if (!item && !draft.title.trim()) {
      cancelAdding();
      return;
    }
    if (item && !dirty(item)) return;
    setError("");
    try {
      const values = draftValues(draft);
      if (!item && addingProject) {
        const projectName = draft.sectionName.trim();
        if (!projectName)
          throw new Error("Enter a project name before saving its first item.");
        values.sectionName = projectName;
      }
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
      if (item && compactQuoteRows) setExpandedItemId(item.id);
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
    if (
      !item &&
      addingProject &&
      event.relatedTarget instanceof Element &&
      event.relatedTarget.closest(".scope-new-project-row")
    )
      return;
    // Keep the destination button mounted until its click opens the next row.
    // Collapsing here can remove that button during the pointer sequence.
    const movingToAnotherSummary =
      event.relatedTarget instanceof Element &&
      Boolean(event.relatedTarget.closest(".scope-summary-button"));
    if (compactQuoteRows && item && !movingToAnotherSummary)
      setExpandedItemId((current) => (current === item.id ? null : current));
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

  function resetTemplate() {
    setTemplateOpen(false);
    setTemplateError("");
  }

  async function updateProjectGrouping(
    sectionKey: string,
    name: string | null,
  ) {
    if (!inline || !onSave || sectionSaving) return;
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

  async function addBathroomProject(
    answers: BathroomQuestionnaireAnswers,
    rows: GeneratedBathroomScopeRow[],
  ) {
    if (!inline || !projectId || !onSaveMany || templateSaving) return;
    if (!rows.length) {
      setTemplateError("Complete the questionnaire so there is work to add.");
      return;
    }
    setTemplateSaving(true);
    setTemplateError("");
    try {
      const sectionId = crypto.randomUUID();
      const sectionName = answers.projectName.trim() || nextProjectName;
      await onSaveTemplateProject?.({
        projectName: sectionName,
        customerName: answers.customerName,
        customerPhone: answers.customerPhone,
        customerEmail: answers.customerEmail,
        address: answers.address,
        preferredStartDate: answers.preferredStartDate,
      });
      await onSaveMany(
        rows.map((row, index) => ({
          projectId,
          sectionId,
          sectionName,
          title: row.title,
          details: row.details,
          quantity: 1,
          unit: row.unit,
          estimate: 0,
          subCost: 0,
          materialCost: 0,
          contractorId: "",
          status: "To do",
          position: nextPosition + index,
        })),
      );
      resetTemplate();
    } catch (saveError) {
      setTemplateError(
        saveError instanceof Error
          ? saveError.message
          : "The bathroom questionnaire could not be added to this quote.",
      );
    } finally {
      setTemplateSaving(false);
    }
  }

  return (
    <div className={inline ? "scope-grid" : undefined}>
      {error && (
        <div className="alert scope-grid-error" role="alert">
          {error}
        </div>
      )}
      <div className="table-scroll">
        <table
          className={`scope-table${inline ? " scope-table-editable" : ""}${showStatus ? "" : " scope-table-no-status"}${compactQuoteRows ? " scope-table-compact" : ""}`}
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
                        busy={sectionSaving}
                        onRename={(name) =>
                          updateProjectGrouping(sectionKey, name)
                        }
                        onRemove={() => updateProjectGrouping(sectionKey, null)}
                      />
                    )}
                  {inline && compactQuoteRows && expandedItemId !== item.id ? (
                    <tr
                      className={`scope-summary-row${index % 2 === 1 ? " scope-item-alternate" : ""}${projectAccentClasses.get(sectionKey) ? ` ${projectAccentClasses.get(sectionKey)}` : ""}`}
                    >
                      <td colSpan={showStatus ? 8 : 7}>
                        <button
                          type="button"
                          className="scope-summary-button"
                          aria-label={`Edit ${draft.title}`}
                          aria-expanded="false"
                          onClick={() => setExpandedItemId(item.id)}
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
                      </td>
                    </tr>
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
                        compactQuoteRows && expandedItemId === item.id
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
                        {item.unit === "job" ? (
                          "Flat price"
                        ) : (
                          <>
                            {item.quantity.toLocaleString()}{" "}
                            <span className="muted">{item.unit}</span>
                          </>
                        )}
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
            {inline && adding && addingProject && (
              <tr
                className={`scope-section-row scope-new-project-row ${newProjectAccentClass}`}
              >
                <td colSpan={showStatus ? 8 : 7}>
                  <div className="scope-section-heading">
                    <div className="scope-section-title">
                      <span>Project</span>
                      <div className="scope-section-edit">
                        <input
                          ref={newProjectName}
                          aria-label="New project name"
                          value={newDraft.sectionName}
                          maxLength={250}
                          disabled={saving.has("new")}
                          onChange={(event) =>
                            setNewDraft((current) => ({
                              ...current,
                              sectionName: event.target.value,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              newTitle.current?.focus();
                            }
                            if (event.key === "Escape") cancelAdding();
                          }}
                        />
                      </div>
                    </div>
                    <div className="scope-section-tools">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Cancel new project"
                        onClick={cancelAdding}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {inline && adding && (
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
            )}
            {inline && !adding && (
              <tr className="scope-add-row">
                <td colSpan={showStatus ? 8 : 7}>
                  <div className="scope-add-actions">
                    <button
                      type="button"
                      className="scope-add-row-button"
                      onClick={() => {
                        setError("");
                        setAddingProject(false);
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
                      Add row
                    </button>
                    {compactQuoteRows && (
                      <button
                        type="button"
                        className="scope-add-row-button scope-add-project-button"
                        onClick={() => {
                          setError("");
                          setNewDraft({
                            ...draftFrom(),
                            sectionId: crypto.randomUUID(),
                            sectionName: nextProjectName,
                          });
                          setAddingProject(true);
                          setAdding(true);
                        }}
                      >
                        <FolderPlus size={15} />
                        Add project
                      </button>
                    )}
                    <button
                      type="button"
                      className="scope-add-row-button scope-add-project-button"
                      onClick={() => {
                        setTemplateError("");
                        setTemplateOpen(true);
                      }}
                    >
                      <FolderPlus size={15} />
                      Use Project Template
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Scope totals</td>
              <td>{money(estimated)}</td>
              <td>{money(subCosts)}</td>
              <td>{money(materialCosts)}</td>
              <td>{money(estimated - costs)}</td>
              <td colSpan={showStatus ? 2 : 1} />
            </tr>
          </tfoot>
        </table>
      </div>
      {templateOpen && (
        <Modal
          title="Bathroom questionnaire"
          subtitle="Use the project details and selections to create a consistent, itemized quote."
          onClose={() => {
            if (!templateSaving) resetTemplate();
          }}
        >
          <BathroomQuestionnaire
            project={{ ...templateProject, projectName: nextProjectName }}
            busy={templateSaving}
            error={templateError}
            onCancel={resetTemplate}
            onSubmit={(answers, rows) => void addBathroomProject(answers, rows)}
          />
        </Modal>
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
      <td>
        {compact && <span className="scope-field-label">Pricing basis</span>}
        <div
          className={`scope-quantity-cell${draft.unit === "job" ? " is-flat" : ""}`}
        >
          {draft.unit !== "job" && (
            <input
              className="scope-cell-input scope-number-input"
              aria-label={`Quantity for ${draft.title || "new work item"}`}
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
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
          )}
          <select
            className="scope-cell-select scope-unit-select"
            aria-label={`Unit for ${draft.title || "new work item"}`}
            value={draft.unit}
            disabled={saving}
            onChange={(event) => {
              const unit = event.target.value;
              onChange({
                unit,
                ...(unit === "job"
                  ? { quantity: "1", rate: draft.estimate }
                  : draft.unit === "job"
                    ? { rate: draft.estimate }
                    : {}),
              });
            }}
          >
            {pricingBases.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
      </td>
      <MoneyCell
        heading={compact ? "Price / rate" : undefined}
        label={`${draft.unit === "job" ? "Price" : rateLabel(draft.unit)} for ${draft.title || "new work item"}`}
        value={draft.unit === "job" ? draft.estimate : draft.rate}
        hint={
          draft.unit === "job"
            ? undefined
            : `Total ${money(draftNumber(draft.estimate))}`
        }
        step={draft.unit === "job" ? "0.01" : "any"}
        disabled={saving}
        onChange={(value) =>
          onChange(
            draft.unit === "job"
              ? { estimate: value, rate: value }
              : {
                  rate: value,
                  estimate: String(
                    lineTotal(Number(draft.quantity), Number(value)),
                  ),
                },
          )
        }
      />
      <CostCell
        heading="Sub cost"
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
    <td className="scope-cost-cell">
      <span className="scope-field-label">{heading}</span>
      <div className={`scope-quantity-cell${unit === "job" ? " is-flat" : ""}`}>
        {unit !== "job" && (
          <input
            className="scope-cell-input scope-number-input"
            aria-label={`${label} quantity for ${itemName}`}
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
      </div>
      <div className="scope-cost-rate">
        <span aria-hidden="true">$</span>
        <input
          className="scope-cell-input scope-money-input"
          aria-label={
            unit === "job"
              ? `${label} for ${itemName}`
              : `${label} rate for ${itemName}`
          }
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
      </div>
      {unit !== "job" && (
        <small className="scope-line-total">
          Total {money(draftNumber(total))}
        </small>
      )}
    </td>
  );
}
