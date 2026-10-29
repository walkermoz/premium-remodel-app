"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import {
  pricebookCode,
  pricebookMatches,
  type PricebookItem,
} from "@/lib/pricebook";
import { readDemoPricebook, writeDemoPricebook } from "@/lib/demo-pricebook";
import { pricingBases, rateLabel, costRateLabel } from "@/lib/scope-pricing";
import type { Contractor, User } from "@/lib/types";
import { Modal } from "./ui";

type Draft = {
  name: string;
  description: string;
  category: string;
  unit: string;
  customerRate: string;
  customerVisible: boolean;
  subUnit: string;
  subRate: string;
  materialUnit: string;
  materialRate: string;
  contractorRates: { contractorId: string; rate: string }[];
};
const blank: Draft = {
  name: "",
  description: "",
  category: "General",
  unit: "job",
  customerRate: "0",
  customerVisible: true,
  subUnit: "job",
  subRate: "0",
  materialUnit: "job",
  materialRate: "0",
  contractorRates: [],
};
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
function cents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter a dollar amount with no more than two decimals.");
  const result = Math.round(Number(value) * 100);
  if (result > 100_000_000) throw new Error("A rate cannot exceed $1,000,000.");
  return result;
}
function fromItem(item: PricebookItem): Draft {
  return {
    name: item.name,
    description: item.description,
    category: item.category || "General",
    unit: item.unit,
    customerRate: String(item.customerRateCents / 100),
    customerVisible: item.customerVisible,
    subUnit: item.subUnit,
    subRate: String(item.subRateCents / 100),
    materialUnit: item.materialUnit,
    materialRate: String(item.materialRateCents / 100),
    contractorRates: item.contractorRates.map((rate) => ({
      contractorId: rate.contractorId,
      rate: String(rate.rateCents / 100),
    })),
  };
}

export default function PricebookPanel({
  user,
  contractors,
  demo = false,
}: {
  user: User;
  contractors: Contractor[];
  demo?: boolean;
}) {
  const [items, setItems] = useState<PricebookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedId, setSelectedId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(blank);
  const [addingCategory, setAddingCategory] = useState(false);
  const [editing, setEditing] = useState<PricebookItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (demo) {
      const timer = setTimeout(() => {
        setItems(readDemoPricebook());
        setLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    fetch("/api/pricebook", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Could not load price book.");
        setItems(body);
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not load price book.",
        ),
      )
      .finally(() => setLoading(false));
  }, [demo]);
  const categories = useMemo(
    () => ["All", ...new Set(items.map((item) => item.category || "General"))],
    [items],
  );
  const editorCategories = useMemo(
    () =>
      [...new Set(["General", ...categories.slice(1)])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [categories],
  );
  const filtered = items.filter(
    (item) =>
      (category === "All" || (item.category || "General") === category) &&
      pricebookMatches(item, search),
  );
  const selected =
    filtered.find((item) => item.id === selectedId) || filtered[0] || null;
  function openNew() {
    setEditing(null);
    setDraft(blank);
    setAddingCategory(false);
    setError("");
    setEditorOpen(true);
  }
  function openEdit(item: PricebookItem) {
    setEditing(item);
    setDraft(fromItem(item));
    setAddingCategory(false);
    setError("");
    setEditorOpen(true);
  }
  function field(
    key: Exclude<keyof Draft, "contractorRates" | "customerVisible">,
    label: string,
    type = "text",
  ) {
    return (
      <label key={key}>
        {label}
        <input
          type={type}
          min={type === "number" ? "0" : undefined}
          step={type === "number" ? "0.01" : undefined}
          value={draft[key]}
          onChange={(event) =>
            setDraft((current) => ({ ...current, [key]: event.target.value }))
          }
          required={key === "name" || type === "number"}
        />
      </label>
    );
  }
  function unit(key: "unit" | "subUnit" | "materialUnit", label: string) {
    return (
      <label key={key}>
        {label}
        <select
          value={draft[key]}
          onChange={(event) =>
            setDraft((current) => ({ ...current, [key]: event.target.value }))
          }
        >
          {pricingBases.map((basis) => (
            <option key={basis.value} value={basis.value}>
              {basis.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const categoryName = draft.category.trim();
      if (!categoryName) throw new Error("Enter a category.");
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        category:
          editorCategories.find(
            (existing) =>
              existing.toLocaleLowerCase() === categoryName.toLocaleLowerCase(),
          ) || categoryName,
        unit: draft.unit,
        customerRateCents: cents(draft.customerRate),
        customerVisible: draft.customerVisible,
        subUnit: draft.subUnit,
        subRateCents: cents(draft.subRate),
        materialUnit: draft.materialUnit,
        materialRateCents: cents(draft.materialRate),
        contractorRates: draft.contractorRates.map((rate) => ({
          contractorId: rate.contractorId,
          rateCents: cents(rate.rate),
        })),
        ...(editing ? { id: editing.id, revision: editing.revision } : {}),
      };
      let body: PricebookItem;
      if (demo) {
        const id = editing?.id || crypto.randomUUID();
        body = {
          ...payload,
          unit: payload.unit as PricebookItem["unit"],
          subUnit: payload.subUnit as PricebookItem["subUnit"],
          materialUnit: payload.materialUnit as PricebookItem["materialUnit"],
          id,
          code: pricebookCode(id),
          revision: (editing?.revision || 0) + 1,
          active: true,
        };
        writeDemoPricebook([...items.filter((item) => item.id !== id), body]);
      } else {
        const response = await fetch("/api/pricebook", {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        body = await response.json();
        if (!response.ok)
          throw new Error(
            (body as unknown as { error?: string }).error ||
              "Could not save price-book item.",
          );
      }
      setItems((current) =>
        [...current.filter((item) => item.id !== body.id), body].sort(
          (a, b) =>
            a.category.localeCompare(b.category) ||
            a.name.localeCompare(b.name),
        ),
      );
      setCategory("All");
      setSearch("");
      setSelectedId(body.id);
      setDraft(blank);
      setAddingCategory(false);
      setEditing(null);
      setEditorOpen(false);
      setMessage("Price-book item saved.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save price-book item.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(item: PricebookItem) {
    if (
      !window.confirm(
        `Archive ${item.name}? Existing quote lines will stay unchanged.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (demo)
        writeDemoPricebook(items.filter((entry) => entry.id !== item.id));
      else {
        const response = await fetch("/api/pricebook", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id }),
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Could not archive item.");
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setMessage(
        `${item.name} archived. Existing quote lines were not changed.`,
      );
      if (editing?.id === item.id) {
        setEditing(null);
        setDraft(blank);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not archive item.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading pricebook-heading">
        <div>
          <span className="eyebrow">PRICING</span>
          <h1>
            Price book<span className="heading-dot">.</span>
          </h1>
          <p>
            Standard scope and pricing for this organization. Quote items keep
            their own editable copy.
          </p>
        </div>
        {user.role === "admin" && (
          <button className="button primary" type="button" onClick={openNew}>
            <Plus size={16} /> New item
          </button>
        )}
      </div>
      {error && !editorOpen && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="success-note" role="status">
          {message}
        </div>
      )}
      <div className="pricebook-toolbar">
        <label className="pricebook-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search price book"
            placeholder="Search name, code or scope"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span>
          {filtered.length} of {items.length} items
        </span>
      </div>
      <div className="pricebook-categories" aria-label="Price book categories">
        {categories.map((name) => (
          <button
            type="button"
            key={name}
            className={category === name ? "active" : ""}
            aria-pressed={category === name}
            onClick={() => setCategory(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="pricebook-empty">Loading price book…</p>
      ) : items.length === 0 ? (
        <div className="pricebook-empty-state">
          <h2>No price-book items yet</h2>
          <p>
            Save a standard work item once, then add it to quotes with the
            quantity for each job.
          </p>
          {user.role === "admin" && (
            <button
              className="button secondary"
              type="button"
              onClick={openNew}
            >
              Add first item
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <p className="pricebook-empty">No items match these filters.</p>
      ) : (
        <div className="pricebook-workspace">
          <div className="pricebook-list" aria-label="Price-book items">
            <div className="pricebook-list-head">
              <span>Work item</span>
              <span>Quote rate</span>
            </div>
            {filtered.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`pricebook-list-row ${selected?.id === item.id ? "selected" : ""}`}
                aria-pressed={selected?.id === item.id}
                onClick={() => setSelectedId(item.id)}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.code} · {item.category || "General"}
                  </small>
                </span>
                <span>
                  <b>{money(item.customerRateCents)}</b>
                  <small>{rateLabel(item.unit)}</small>
                </span>
              </button>
            ))}
          </div>
          {selected && (
            <aside
              className="pricebook-inspector"
              aria-label="Selected price-book item"
            >
              <span className="pricebook-code">{selected.code}</span>
              {!selected.customerVisible && (
                <span className="pricebook-internal-badge">Internal only</span>
              )}
              <h2>{selected.name}</h2>
              <p>{selected.description || "No default scope description."}</p>
              <dl>
                <div>
                  <dt>{rateLabel(selected.unit)}</dt>
                  <dd>{money(selected.customerRateCents)}</dd>
                </div>
                <div>
                  <dt>{costRateLabel(selected.subUnit)} · Sub</dt>
                  <dd>{money(selected.subRateCents)}</dd>
                </div>
                <div>
                  <dt>{costRateLabel(selected.materialUnit)} · Materials</dt>
                  <dd>{money(selected.materialRateCents)}</dd>
                </div>
              </dl>
              {!!selected.contractorRates.length && (
                <div className="pricebook-contractor-summary">
                  <h3>Contractor rates</h3>
                  {selected.contractorRates.map((rate) => (
                    <div key={rate.contractorId}>
                      <span>
                        {contractors.find(
                          (contractor) => contractor.id === rate.contractorId,
                        )?.name || "Former contractor"}
                      </span>
                      <strong>
                        {money(rate.rateCents)}{" "}
                        {costRateLabel(selected.subUnit)
                          .replace(/^Cost /, "")
                          .toLowerCase()}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
              {user.role === "admin" && (
                <div className="pricebook-inspector-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => openEdit(selected)}
                  >
                    Edit item
                  </button>
                  <button
                    type="button"
                    className="pricebook-archive"
                    disabled={busy}
                    onClick={() => void remove(selected)}
                  >
                    Archive
                  </button>
                </div>
              )}
            </aside>
          )}
        </div>
      )}
      {editorOpen && (
        <Modal
          title={editing ? "Edit price-book item" : "New price-book item"}
          subtitle="Set standard rates here. Each quote can adjust them for the job."
          onClose={() => {
            if (!busy) {
              setEditorOpen(false);
              setError("");
            }
          }}
        >
          <form onSubmit={save}>
            <div className="pricebook-editor-body">
              {error && (
                <div className="alert" role="alert">
                  {error}
                </div>
              )}
              <div className="form-grid">
                {field("name", "Work item")}
                <div className="pricebook-category-field">
                  <label>
                    Category
                    <select
                      aria-label="Category"
                      value={addingCategory ? "__add_new__" : draft.category}
                      onChange={(event) => {
                        const isNew = event.target.value === "__add_new__";
                        setAddingCategory(isNew);
                        setDraft((current) => ({
                          ...current,
                          category: isNew ? "" : event.target.value,
                        }));
                      }}
                    >
                      {editorCategories.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                      <option value="__add_new__">Add new category…</option>
                    </select>
                  </label>
                  {addingCategory && (
                    <label>
                      New category
                      <input
                        aria-label="New category"
                        autoFocus
                        maxLength={100}
                        value={draft.category}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            category: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                  )}
                </div>
              </div>
              <label>
                Default scope description
                <textarea
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
              <fieldset>
                <legend>Quote price</legend>
                <div className="form-grid">
                  {unit("unit", "Price by")}
                  {field(
                    "customerRate",
                    `${rateLabel(draft.unit)} ($)`,
                    "number",
                  )}
                </div>
                <label className="pricebook-visibility-setting">
                  <input
                    type="checkbox"
                    checked={draft.customerVisible}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        customerVisible: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    <strong>Show as a line item on the customer quote</strong>
                    <small>
                      Turn this off for overhead or other internal price
                      components. The amount still counts toward the quote
                      total.
                    </small>
                  </span>
                </label>
              </fieldset>
              <fieldset>
                <legend>Subcontractor cost</legend>
                <div className="form-grid">
                  {unit("subUnit", "Cost by")}
                  {field(
                    "subRate",
                    `${costRateLabel(draft.subUnit)} ($)`,
                    "number",
                  )}
                </div>
              </fieldset>
              <fieldset className="pricebook-contractor-rates">
                <legend>Contractor rates</legend>
                <p>
                  Add rates for specific trade contacts. When this item is added
                  to a quote, the estimator chooses the contractor. All rates
                  use the subcontractor cost basis above.
                </p>
                {draft.contractorRates.map((rate, index) => (
                  <div
                    className="pricebook-contractor-rate-row"
                    key={`${rate.contractorId}-${index}`}
                  >
                    <label>
                      Contractor
                      <select
                        value={rate.contractorId}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            contractorRates: current.contractorRates.map(
                              (entry, position) =>
                                position === index
                                  ? {
                                      ...entry,
                                      contractorId: event.target.value,
                                    }
                                  : entry,
                            ),
                          }))
                        }
                      >
                        {contractors.map((contractor) => (
                          <option key={contractor.id} value={contractor.id}>
                            {contractor.name}
                            {contractor.trade ? ` · ${contractor.trade}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {costRateLabel(draft.subUnit)} ($)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={rate.rate}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            contractorRates: current.contractorRates.map(
                              (entry, position) =>
                                position === index
                                  ? { ...entry, rate: event.target.value }
                                  : entry,
                            ),
                          }))
                        }
                        required
                      />
                    </label>
                    <button
                      type="button"
                      className="button secondary"
                      aria-label={`Remove contractor rate ${index + 1}`}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          contractorRates: current.contractorRates.filter(
                            (_, position) => position !== index,
                          ),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button secondary"
                  disabled={draft.contractorRates.length >= contractors.length}
                  onClick={() => {
                    const next = contractors.find(
                      (contractor) =>
                        !draft.contractorRates.some(
                          (rate) => rate.contractorId === contractor.id,
                        ),
                    );
                    if (next)
                      setDraft((current) => ({
                        ...current,
                        contractorRates: [
                          ...current.contractorRates,
                          { contractorId: next.id, rate: current.subRate },
                        ],
                      }));
                  }}
                >
                  <Plus size={14} /> Add contractor rate
                </button>
                {!contractors.length && (
                  <small>
                    Add trade contacts first to set contractor-specific rates.
                  </small>
                )}
              </fieldset>
              <fieldset>
                <legend>Material cost</legend>
                <div className="form-grid">
                  {unit("materialUnit", "Cost by")}
                  {field(
                    "materialRate",
                    `${costRateLabel(draft.materialUnit)} ($)`,
                    "number",
                  )}
                </div>
              </fieldset>
              <p className="pricebook-code-note">
                Reference code is assigned automatically when this item is
                saved.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="button secondary"
                type="button"
                onClick={() => setEditorOpen(false)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : editing ? "Save changes" : "Create item"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
