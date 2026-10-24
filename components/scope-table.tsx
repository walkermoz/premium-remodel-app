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
import { Badge, Empty, Modal } from "./ui";
import BathroomQuestionnaire from "./bathroom-questionnaire";

const units = [
  { value: "job", label: "Flat price" },
  { value: "sq ft", label: "sq ft" },
  { value: "linear ft", label: "linear ft" },
  { value: "each", label: "each" },
  { value: "hours", label: "hours" },
];
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
  title: string;
  details: string;
  quantity: string;
  unit: string;
  estimate: string;
  subCost: string;
  materialCost: string;
  contractorId: string;
  status: TaskStatus;
}

function draftFrom(item?: ScopeItem): ScopeDraft {
  return {
    title: item?.title || "",
    details: item?.details || "",
    quantity: String(item?.quantity ?? 1),
    unit: item?.unit || "job",
    estimate: String(item?.estimate ?? 0),
    subCost: String(item?.subCost ?? 0),
    materialCost: String(item?.materialCost ?? 0),
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
    title,
    details: draft.details.trim(),
    quantity:
      draft.unit === "job" ? 1 : numberValue(draft.quantity, "Quantity"),
    unit: draft.unit,
    estimate: numberValue(draft.estimate, "Price"),
    subCost: numberValue(draft.subCost, "Subcontractor cost"),
    materialCost: numberValue(draft.materialCost, "Material cost"),
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
  showStatus = true,
  projectId,
  onSave,
  onSaveMany,
  templateProject,
  onSaveTemplateProject,
  defaultSectionName = "General scope",
}: {
  items: ScopeItem[];
  workspace: Workspace;
  onAdd?: () => void;
  onEdit?: (item: ScopeItem) => void;
  onDelete: (item: ScopeItem) => void;
  inline?: boolean;
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
  const [newDraft, setNewDraft] = useState<ScopeDraft>(() => draftFrom());
  const [saving, setSaving] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const newTitle = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) newTitle.current?.focus();
  }, [adding]);

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
      draft.details !== (item.details || "") ||
      draft.quantity !== String(item.quantity) ||
      draft.unit !== item.unit ||
      draft.estimate !== String(item.estimate) ||
      draft.subCost !== String(item.subCost) ||
      draft.materialCost !== String(item.materialCost ?? 0) ||
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
      setAdding(false);
      setNewDraft(draftFrom());
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
            details: values.details,
            quantity: String(values.quantity),
            unit: values.unit,
            estimate: String(values.estimate),
            subCost: String(values.subCost),
            materialCost: String(values.materialCost),
            contractorId: values.contractorId,
            status: values.status,
          },
        }));
      } else {
        setAdding(false);
        setNewDraft(draftFrom());
      }
    } catch (saveError) {
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
    void saveRow(item);
  }

  function rowKeyDown(
    event: React.KeyboardEvent<HTMLTableRowElement>,
    item?: ScopeItem,
  ) {
    if (event.key === "Enter") {
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
        setAdding(false);
        setNewDraft(draftFrom());
      }
      setError("");
    }
  }

  function resetTemplate() {
    setTemplateOpen(false);
    setTemplateError("");
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
      const sectionName = answers.projectName.trim() || "Bathroom";
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
          className={`scope-table${inline ? " scope-table-editable" : ""}${showStatus ? "" : " scope-table-no-status"}`}
        >
          <thead>
            <tr>
              <th>Work item / contractor</th>
              <th>Pricing basis</th>
              <th>Price</th>
              <th>Sub cost</th>
              <th>Material cost</th>
              <th>Difference</th>
              {showStatus && <th>Status</th>}
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
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
                  {startsSection && section && (
                    <ScopeSectionRow
                      name={section.name}
                      count={section.count}
                      total={section.total}
                      colSpan={showStatus ? 8 : 7}
                    />
                  )}
                  {inline ? (
                    <EditableRow
                      draft={draft}
                      workspace={workspace}
                      difference={difference}
                      saving={saving.has(item.id)}
                      dirty={dirty(item)}
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
            {inline && adding && (
              <EditableRow
                draft={newDraft}
                workspace={workspace}
                difference={
                  draftNumber(newDraft.estimate) -
                  draftNumber(newDraft.subCost) -
                  draftNumber(newDraft.materialCost)
                }
                saving={saving.has("new")}
                dirty
                showStatus={showStatus}
                newRow
                titleRef={newTitle}
                onChange={(patch) =>
                  setNewDraft((current) => ({ ...current, ...patch }))
                }
                onSave={() => void saveRow()}
                onDelete={() => {
                  setAdding(false);
                  setNewDraft(draftFrom());
                  setError("");
                }}
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
                        setAdding(true);
                      }}
                    >
                      <Plus size={15} />
                      Add row
                    </button>
                    <button
                      type="button"
                      className="scope-add-row-button scope-add-project-button"
                      onClick={() => {
                        setTemplateError("");
                        setTemplateOpen(true);
                      }}
                    >
                      <FolderPlus size={15} />
                      Add project
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
            project={templateProject}
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
  colSpan,
}: {
  name: string;
  count: number;
  total: number;
  colSpan: number;
}) {
  return (
    <tr className="scope-section-row">
      <td colSpan={colSpan}>
        <div className="scope-section-heading">
          <div>
            <span>Project</span>
            <strong>{name}</strong>
          </div>
          <small>
            {count} {count === 1 ? "item" : "items"} · {money(total)}
          </small>
        </div>
      </td>
    </tr>
  );
}

function EditableRow({
  draft,
  workspace,
  difference,
  saving,
  dirty,
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
  saving: boolean;
  dirty: boolean;
  showStatus: boolean;
  newRow?: boolean;
  titleRef?: React.RefObject<HTMLInputElement | null>;
  onChange: (patch: Partial<ScopeDraft>) => void;
  onSave: () => void;
  onDelete: () => void;
  onBlur: (event: React.FocusEvent<HTMLTableRowElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => void;
}) {
  return (
    <tr
      className={newRow ? "scope-new-row" : undefined}
      aria-busy={saving}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      <td>
        <input
          ref={titleRef}
          className="scope-cell-input scope-title-input"
          aria-label={newRow ? "New work item" : `Work item ${draft.title}`}
          placeholder="Work item"
          maxLength={250}
          value={draft.title}
          disabled={saving}
          onChange={(event) => onChange({ title: event.target.value })}
        />
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
          onChange={(event) => onChange({ contractorId: event.target.value })}
        >
          <option value="">Unassigned</option>
          {workspace.contractors.map((contractor) => (
            <option key={contractor.id} value={contractor.id}>
              {contractor.name} · {contractor.trade || contractor.company}
            </option>
          ))}
        </select>
      </td>
      <td>
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
              onChange={(event) => onChange({ quantity: event.target.value })}
            />
          )}
          <select
            className="scope-cell-select scope-unit-select"
            aria-label={`Unit for ${draft.title || "new work item"}`}
            value={draft.unit}
            disabled={saving}
            onChange={(event) =>
              onChange({
                unit: event.target.value,
                ...(event.target.value === "job" ? { quantity: "1" } : {}),
              })
            }
          >
            {units.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
      </td>
      <MoneyCell
        label={`Price for ${draft.title || "new work item"}`}
        value={draft.estimate}
        disabled={saving}
        onChange={(estimate) => onChange({ estimate })}
      />
      <MoneyCell
        label={`Subcontractor cost for ${draft.title || "new work item"}`}
        value={draft.subCost}
        disabled={saving}
        onChange={(subCost) => onChange({ subCost })}
      />
      <MoneyCell
        label={`Material cost for ${draft.title || "new work item"}`}
        value={draft.materialCost}
        disabled={saving}
        onChange={(materialCost) => onChange({ materialCost })}
      />
      <td
        className={
          difference < 0 ? "is-overdue scope-calculated" : "scope-calculated"
        }
      >
        <output className="scope-calculated-value">{money(difference)}</output>
      </td>
      {showStatus && (
        <td>
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
}

function MoneyCell({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <td className="scope-money-cell">
      <span aria-hidden="true">$</span>
      <input
        className="scope-cell-input scope-money-input"
        aria-label={label}
        type="number"
        min="0"
        max="1000000000"
        step="0.01"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </td>
  );
}
