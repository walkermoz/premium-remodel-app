"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import type { ScopeItem, TaskStatus, Workspace } from "@/lib/types";
import {
  projectMoney as money,
  scopeTotal,
  scopeCosts,
  scopeDifference,
} from "@/lib/project-finances";
import { Badge, Empty } from "./ui";

const units = ["job", "sq ft", "linear ft", "each", "hours"];
const statuses: TaskStatus[] = ["To do", "In progress", "Done"];

interface ScopeDraft {
  title: string;
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
    quantity: numberValue(draft.quantity, "Quantity"),
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

export default function ScopeTable({
  items,
  workspace,
  onAdd,
  onEdit,
  onDelete,
  inline = false,
  projectId,
  onSave,
}: {
  items: ScopeItem[];
  workspace: Workspace;
  onAdd?: () => void;
  onEdit?: (item: ScopeItem) => void;
  onDelete: (item: ScopeItem) => void;
  inline?: boolean;
  projectId?: string;
  onSave?: (
    data: Record<string, unknown>,
    item?: ScopeItem,
  ) => Promise<unknown>;
}) {
  const orderedItems = useMemo(() => ordered(items), [items]);
  const [drafts, setDrafts] = useState<Record<string, ScopeDraft>>(() =>
    Object.fromEntries(orderedItems.map((item) => [item.id, draftFrom(item)])),
  );
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<ScopeDraft>(() => draftFrom());
  const [saving, setSaving] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
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

  return (
    <div className={inline ? "scope-grid" : undefined}>
      {error && (
        <div className="alert scope-grid-error" role="alert">
          {error}
        </div>
      )}
      <div className="table-scroll">
        <table
          className={`scope-table${inline ? " scope-table-editable" : ""}`}
        >
          <thead>
            <tr>
              <th>Work item / contractor</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Sub cost</th>
              <th>Material cost</th>
              <th>Difference</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {orderedItems.map((item) => {
              const draft = drafts[item.id] || draftFrom(item);
              const difference =
                draftNumber(draft.estimate) -
                draftNumber(draft.subCost) -
                draftNumber(draft.materialCost);
              return inline ? (
                <EditableRow
                  key={item.id}
                  draft={draft}
                  workspace={workspace}
                  difference={difference}
                  saving={saving.has(item.id)}
                  dirty={dirty(item)}
                  onChange={(patch) => updateDraft(item.id, patch, item)}
                  onSave={() => void saveRow(item)}
                  onDelete={() => onDelete(item)}
                  onBlur={(event) => rowBlur(event, item)}
                  onKeyDown={(event) => rowKeyDown(event, item)}
                />
              ) : (
                <tr key={item.id}>
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
                    <span className="muted">{item.unit}</span>
                  </td>
                  <td>{money(item.estimate)}</td>
                  <td>{money(item.subCost)}</td>
                  <td>{money(item.materialCost ?? 0)}</td>
                  <td className={scopeDifference(item) < 0 ? "is-overdue" : ""}>
                    {money(scopeDifference(item))}
                  </td>
                  <td>
                    <Badge status={item.status} />
                  </td>
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
                <td colSpan={8}>
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
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function EditableRow({
  draft,
  workspace,
  difference,
  saving,
  dirty,
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
        <div className="scope-quantity-cell">
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
          <select
            className="scope-cell-select scope-unit-select"
            aria-label={`Unit for ${draft.title || "new work item"}`}
            value={draft.unit}
            disabled={saving}
            onChange={(event) => onChange({ unit: event.target.value })}
          >
            {units.map((unit) => (
              <option key={unit}>{unit}</option>
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
        {money(difference)}
      </td>
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
