"use client";

import { useState } from "react";
import {
  CircleDollarSign,
  Plus,
  ReceiptText,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { jobCostSummary } from "@/lib/job-costing";
import {
  actualCostCategories,
  type ActualCost,
  type Entity,
  type EntityKind,
  type Project,
  type ScopeItem,
} from "@/lib/types";
import { useRegionalFormat } from "./regional-format-context";

export default function JobCostingPanel({
  project,
  scope,
  actualCosts,
  canManage,
  demo,
  onSave,
  onDelete,
  notify,
}: {
  project: Project;
  scope: ScopeItem[];
  actualCosts: ActualCost[];
  canManage: boolean;
  demo: boolean;
  onSave: (
    kind: EntityKind,
    data: Record<string, unknown>,
    entity?: Entity,
    requestId?: string,
  ) => Promise<void>;
  onDelete: (kind: EntityKind, entity: Entity) => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const regional = useRegionalFormat();
  const summary = jobCostSummary(
    project.id,
    scope,
    actualCosts,
    project.jobCostBudgetSnapshot,
  );
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const percent =
    summary.actualMarginPercent === null
      ? "—"
      : regional.number(summary.actualMarginPercent, {
          style: "percent",
          maximumFractionDigits: 1,
        });

  return (
    <section className="job-costing" aria-label="Job costing">
      <div className="section-heading">
        <div>
          <h2>Budget versus actual</h2>
          <p>
            Compare the cost snapshot from the accepted scope with spend logged
            during delivery.
          </p>
        </div>
        {canManage && (
          <button
            className="button primary"
            onClick={() => setAdding((value) => !value)}
          >
            <Plus size={16} /> Log cost
          </button>
        )}
      </div>

      <div className="job-cost-metrics">
        <div>
          <span>Budgeted cost</span>
          <strong>{regional.money(summary.budget)}</strong>
          <small>Accepted scope snapshot</small>
        </div>
        <div>
          <span>Actual cost</span>
          <strong>{regional.money(summary.actual)}</strong>
          <small>{summary.costs.length} entries</small>
        </div>
        <div className={summary.variance < 0 ? "negative" : "positive"}>
          <span>Cost variance</span>
          <strong>{regional.money(summary.variance)}</strong>
          <small>
            {summary.variance < 0 ? "Over budget" : "Remaining budget"}
          </small>
        </div>
        <div className={summary.actualMargin < 0 ? "negative" : ""}>
          <span>Actual gross margin</span>
          <strong>{regional.money(summary.actualMargin)}</strong>
          <small>{percent} of project price</small>
        </div>
      </div>

      {summary.variance < 0 && (
        <div className="job-cost-warning" role="status">
          <TriangleAlert size={18} />
          Actual spend is {regional.money(Math.abs(summary.variance))} above the
          cost budget. Review the largest item variances below.
        </div>
      )}

      {adding && (
        <form
          className="job-cost-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || demo) return;
            setBusy(true);
            setError("");
            try {
              const values = Object.fromEntries(
                new FormData(event.currentTarget),
              );
              await onSave("actual_cost", {
                projectId: project.id,
                scopeItemId: values.scopeItemId || "",
                category: values.category,
                description: values.description,
                vendor: values.vendor,
                amount: Number(values.amount),
                incurredAt: values.incurredAt,
                notes: values.notes,
              });
              setAdding(false);
              notify("Actual cost recorded");
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not record cost.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="section-heading">
            <div>
              <h3>New actual cost</h3>
              <p>Attach spend to a scope item when possible.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Category
              <select name="category" defaultValue="Materials">
                {actualCostCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              Scope item
              <select name="scopeItemId" defaultValue="">
                <option value="">Unallocated / job-level</option>
                {scope.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Description
              <input
                name="description"
                required
                maxLength={250}
                placeholder="Cabinet hardware"
              />
            </label>
            <label>
              Vendor or payee
              <input
                name="vendor"
                maxLength={250}
                placeholder="Supplier or crew"
              />
            </label>
            <label>
              Amount
              <input
                name="amount"
                type="number"
                min="0.01"
                max="1000000000"
                step="0.01"
                required
              />
            </label>
            <label>
              Incurred date
              <input
                name="incurredAt"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
          </div>
          <label>
            Notes
            <textarea name="notes" rows={2} maxLength={15000} />
          </label>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Save cost"}
            </button>
          </div>
        </form>
      )}

      <div className="job-cost-breakdown">
        <div className="section-heading">
          <div>
            <h3>Item variance</h3>
            <p>Budget comes from saved subcontractor and material costs.</p>
          </div>
        </div>
        <div
          className="job-cost-table"
          role="table"
          aria-label="Item cost variance"
        >
          <div className="job-cost-row header" role="row">
            <span>Scope item</span>
            <span>Budget</span>
            <span>Actual</span>
            <span>Variance</span>
          </div>
          {summary.byItem.map(({ item, budget, actual, variance }) => (
            <div className="job-cost-row" role="row" key={item.id}>
              <strong>{item.title}</strong>
              <span>{regional.money(budget)}</span>
              <span>{regional.money(actual)}</span>
              <span className={variance < 0 ? "negative" : ""}>
                {regional.money(variance)}
              </span>
            </div>
          ))}
          {summary.unallocated > 0 && (
            <div className="job-cost-row" role="row">
              <strong>Unallocated costs</strong>
              <span>—</span>
              <span>{regional.money(summary.unallocated)}</span>
              <span className="negative">
                {regional.money(-summary.unallocated)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="job-cost-ledger">
        <div className="section-heading">
          <div>
            <h3>Actual cost ledger</h3>
            <p>Every entry retains who recorded it and when.</p>
          </div>
        </div>
        {summary.costs.length ? (
          summary.costs.map((cost) => (
            <article key={cost.id} className="job-cost-entry">
              <ReceiptText size={18} />
              <div>
                <strong>{cost.description}</strong>
                <span>
                  {cost.category}
                  {cost.vendor ? ` · ${cost.vendor}` : ""}
                </span>
                <small>
                  {regional.date(`${cost.incurredAt}T12:00:00Z`)} · logged by{" "}
                  {cost.recordedByName}
                </small>
              </div>
              <b>{regional.money(cost.amount)}</b>
              {canManage && (
                <button
                  className="icon-button"
                  aria-label={`Delete ${cost.description}`}
                  onClick={() => onDelete("actual_cost", cost)}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </article>
          ))
        ) : (
          <div className="empty-inline">
            <CircleDollarSign size={28} />
            <p>No actual costs logged yet.</p>
          </div>
        )}
      </div>
    </section>
  );
}
