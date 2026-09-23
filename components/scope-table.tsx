"use client";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { ScopeItem, Workspace } from "@/lib/types";
import {
  projectMoney as money,
  scopeTotal,
  scopeCosts,
  scopeDifference,
} from "@/lib/project-finances";
import { Badge, Empty } from "./ui";
export default function ScopeTable({
  items,
  workspace,
  onAdd,
  onEdit,
  onDelete,
}: {
  items: ScopeItem[];
  workspace: Workspace;
  onAdd: () => void;
  onEdit: (item: ScopeItem) => void;
  onDelete: (item: ScopeItem) => void;
}) {
  if (!items.length)
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
  const estimated = scopeTotal(items);
  const { subCosts, materialCosts, costs } = scopeCosts(items);
  return (
    <div className="table-scroll">
      <table className="scope-table">
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
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <button className="text-button" onClick={() => onEdit(item)}>
                  {item.title}
                </button>
                <small>
                  {workspace.contractors.find((c) => c.id === item.contractorId)
                    ?.name || "Unassigned"}
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
                    onClick={() => onEdit(item)}
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
          ))}
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
  );
}
