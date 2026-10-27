"use client";

import { useEffect, useState } from "react";
import type { PricebookItem } from "@/lib/pricebook";
import { pricingBases, rateLabel, costRateLabel } from "@/lib/scope-pricing";
import type { User } from "@/lib/types";

type Draft = {
  name: string;
  description: string;
  category: string;
  unit: string;
  customerRate: string;
  subUnit: string;
  subRate: string;
  materialUnit: string;
  materialRate: string;
};
const blank: Draft = {
  name: "",
  description: "",
  category: "",
  unit: "job",
  customerRate: "0",
  subUnit: "job",
  subRate: "0",
  materialUnit: "job",
  materialRate: "0",
};
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
function cents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter a valid dollar amount.");
  return Math.round(Number(value) * 100);
}
function fromItem(item: PricebookItem): Draft {
  return {
    name: item.name,
    description: item.description,
    category: item.category,
    unit: item.unit,
    customerRate: String(item.customerRateCents / 100),
    subUnit: item.subUnit,
    subRate: String(item.subRateCents / 100),
    materialUnit: item.materialUnit,
    materialRate: String(item.materialRateCents / 100),
  };
}

export default function PricebookPanel({ user }: { user: User }) {
  const [items, setItems] = useState<PricebookItem[]>([]);
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState<PricebookItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
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
      );
  }, []);
  function field(key: keyof Draft, label: string, type = "text") {
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
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        category: draft.category.trim(),
        unit: draft.unit,
        customerRateCents: cents(draft.customerRate),
        subUnit: draft.subUnit,
        subRateCents: cents(draft.subRate),
        materialUnit: draft.materialUnit,
        materialRateCents: cents(draft.materialRate),
        ...(editing ? { id: editing.id, revision: editing.revision } : {}),
      };
      const response = await fetch("/api/pricebook", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not save price-book item.");
      setItems((current) =>
        [...current.filter((item) => item.id !== body.id), body].sort(
          (a, b) =>
            a.category.localeCompare(b.category) ||
            a.name.localeCompare(b.name),
        ),
      );
      setDraft(blank);
      setEditing(null);
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
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/pricebook", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not archive item.");
      setItems((current) => current.filter((entry) => entry.id !== item.id));
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
      <div className="page-heading">
        <div>
          <span className="eyebrow">PRICING</span>
          <h1>
            Price book<span className="heading-dot">.</span>
          </h1>
          <p>
            Reusable prices and costs for this organization. Quotes keep a copy
            of the values used when each item was added.
          </p>
        </div>
      </div>
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
      {user.role === "admin" && (
        <div className="settings-section">
          <div className="settings-title">
            <div>
              <h2>
                {editing ? `Edit ${editing.name}` : "Add price-book item"}
              </h2>
              <p>Each price or cost can use its own unit.</p>
            </div>
          </div>
          <form className="settings-form" onSubmit={save}>
            <div className="form-grid">
              {field("name", "Work item")}
              {field("category", "Category")}
            </div>
            <label>
              Description
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
            <div className="form-grid">
              {unit("unit", "Customer price by")}
              {field("customerRate", `${rateLabel(draft.unit)} ($)`, "number")}
            </div>
            <div className="form-grid">
              {unit("subUnit", "Subcontractor cost by")}
              {field(
                "subRate",
                `${costRateLabel(draft.subUnit)} ($)`,
                "number",
              )}
            </div>
            <div className="form-grid">
              {unit("materialUnit", "Material cost by")}
              {field(
                "materialRate",
                `${costRateLabel(draft.materialUnit)} ($)`,
                "number",
              )}
            </div>
            <div className="page-heading-actions">
              <button className="button primary" disabled={busy}>
                {busy ? "Saving…" : editing ? "Save changes" : "Add item"}
              </button>
              {editing && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setEditing(null);
                    setDraft(blank);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}
      <div className="settings-section">
        <div className="settings-title">
          <div>
            <h2>Catalog items</h2>
            <p>{items.length} active items</p>
          </div>
        </div>
        <div className="members-list">
          {items.map((item) => (
            <div className="member-row" key={item.id}>
              <div className="member-info">
                <strong>{item.name}</strong>
                <span>
                  {item.category || "General"} ·{" "}
                  {item.description || "No description"}
                </span>
              </div>
              <span className="member-role">
                {money(item.customerRateCents)} / {item.unit}
              </span>
              {user.role === "admin" && (
                <div className="page-heading-actions">
                  <button
                    className="button secondary"
                    onClick={() => {
                      setEditing(item);
                      setDraft(fromItem(item));
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void remove(item)}
                  >
                    Archive
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
