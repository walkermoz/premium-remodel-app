"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { PricebookItem } from "@/lib/pricebook";
import type { PricebookAssembly } from "@/lib/pricebook-assemblies";
import type { Contractor } from "@/lib/types";
import {
  readDemoAssemblies,
  writeDemoAssemblies,
} from "@/lib/demo-pricebook-assemblies";
import styles from "./pricebook-assemblies-panel.module.css";

type Draft = Pick<
  PricebookAssembly,
  "name" | "description" | "category" | "components"
>;
const empty: Draft = {
  name: "",
  description: "",
  category: "General",
  components: [],
};
const dollar = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );

export default function PricebookAssembliesPanel({
  items,
  contractors,
  editable,
  demo = false,
}: {
  items: PricebookItem[];
  contractors: Contractor[];
  editable: boolean;
  demo?: boolean;
}) {
  const [assemblies, setAssemblies] = useState<PricebookAssembly[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [editing, setEditing] = useState<PricebookAssembly | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (demo) {
      const timer = setTimeout(() => setAssemblies(readDemoAssemblies()), 0);
      return () => clearTimeout(timer);
    }
    fetch("/api/pricebook/assemblies", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Could not load assemblies.");
        setAssemblies(body);
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not load assemblies.",
        ),
      )
      .finally(() => setLoading(false));
  }, [demo]);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const total = (components: Draft["components"]) =>
    components.reduce(
      (sum, part) =>
        sum +
        (itemById.get(part.pricebookItemId)?.customerRateCents || 0) *
          part.quantity,
      0,
    );
  const changePart = (
    index: number,
    patch: Partial<Draft["components"][number]>,
  ) =>
    setDraft(
      (current) =>
        current && {
          ...current,
          components: current.components.map((part, position) =>
            position === index ? { ...part, ...patch } : part,
          ),
        },
    );
  const movePart = (index: number, offset: number) =>
    setDraft((current) => {
      if (!current) return current;
      const components = [...current.components];
      const [part] = components.splice(index, 1);
      components.splice(index + offset, 0, part);
      return { ...current, components };
    });
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!draft.components.length)
        throw new Error("Add at least one price-book item.");
      if (draft.components.some((part) => !itemById.has(part.pricebookItemId)))
        throw new Error("Replace archived price-book items before saving.");
      let saved: PricebookAssembly;
      if (demo) {
        saved = {
          ...draft,
          id: editing?.id || crypto.randomUUID(),
          revision: (editing?.revision || 0) + 1,
          active: true,
        };
        writeDemoAssemblies([
          ...assemblies.filter((value) => value.id !== saved.id),
          saved,
        ]);
      } else {
        const response = await fetch("/api/pricebook/assemblies", {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...draft,
            ...(editing ? { id: editing.id, revision: editing.revision } : {}),
          }),
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Could not save assembly.");
        saved = body;
      }
      setAssemblies((current) =>
        [...current.filter((value) => value.id !== saved.id), saved].sort(
          (a, b) => a.name.localeCompare(b.name),
        ),
      );
      setDraft(null);
      setEditing(null);
      setNotice("Assembly saved. Future quotes can use this template.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save assembly.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function archive(assembly: PricebookAssembly) {
    if (
      !window.confirm(
        `Archive ${assembly.name}? Quotes already using it will stay unchanged.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (demo)
        writeDemoAssemblies(
          assemblies.filter((value) => value.id !== assembly.id),
        );
      if (!demo) {
        const response = await fetch("/api/pricebook/assemblies", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: assembly.id,
            revision: assembly.revision,
          }),
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Could not archive assembly.");
      }
      setAssemblies((current) =>
        current.filter((value) => value.id !== assembly.id),
      );
      setNotice("Assembly archived. Existing quotes were not changed.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not archive assembly.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.root}>
      <div className={styles.heading}>
        <div>
          <h2>Assemblies</h2>
          <p>
            Combine reusable work items into a kitchen, bathroom, or other
            project template. Each part stays editable on the quote.
          </p>
        </div>
        {editable && (
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setEditing(null);
              setDraft({ ...empty, components: [] });
              setError("");
            }}
          >
            <Plus size={16} /> New assembly
          </button>
        )}
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="success-note" role="status">
          {notice}
        </div>
      )}
      {loading ? (
        <p>Loading assemblies…</p>
      ) : assemblies.length === 0 && !draft ? (
        <p className={styles.empty}>
          No assemblies yet. Build one from your existing price-book items.
        </p>
      ) : null}
      {assemblies.map((assembly) => (
        <article className={styles.card} key={assembly.id}>
          <div className={styles.cardHead}>
            <div>
              <small>
                {assembly.category || "General"} · {assembly.components.length}{" "}
                work items
              </small>
              <h3>{assembly.name}</h3>
              <p>{assembly.description}</p>
            </div>
            <strong>{dollar(total(assembly.components))}</strong>
          </div>
          <ol>
            {assembly.components.map((part, index) => (
              <li key={`${part.pricebookItemId}-${index}`}>
                <span>
                  {itemById.get(part.pricebookItemId)?.name || "Archived item"}
                </span>
                <span>
                  {part.quantity} ×{" "}
                  {dollar(
                    itemById.get(part.pricebookItemId)?.customerRateCents || 0,
                  )}
                </span>
              </li>
            ))}
          </ol>
          {editable && (
            <div className={styles.actions}>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setEditing(assembly);
                  setDraft({
                    name: assembly.name,
                    description: assembly.description,
                    category: assembly.category,
                    components: assembly.components.map((part) => ({
                      ...part,
                    })),
                  });
                  setError("");
                }}
              >
                Edit assembly
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => void archive(assembly)}
              >
                <Trash2 size={14} /> Archive
              </button>
            </div>
          )}
        </article>
      ))}
      {draft && (
        <div
          className={styles.overlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setDraft(null);
          }}
        >
          <form
            className={styles.editor}
            onSubmit={(event) => void save(event)}
            role="dialog"
            aria-modal="true"
            aria-label="Assembly editor"
          >
            <header>
              <h2>{editing ? "Edit assembly" : "New assembly"}</h2>
              <p>
                Pick the parts and quantities. Rates are copied into each quote
                when the assembly is used.
              </p>
            </header>
            <div className={styles.fields}>
              <label>
                Project name
                <input
                  required
                  maxLength={160}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                  placeholder="Bathroom remodel"
                />
              </label>
              <label>
                Category
                <input
                  maxLength={100}
                  value={draft.category}
                  onChange={(event) =>
                    setDraft({ ...draft, category: event.target.value })
                  }
                  placeholder="Bathrooms"
                />
              </label>
            </div>
            <label>
              Template note
              <textarea
                maxLength={4000}
                rows={3}
                value={draft.description}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
                placeholder="Brief overview of this scope"
              />
            </label>
            <div className={styles.partsTitle}>
              <strong>Work items</strong>
              <span>
                Estimated quote price: {dollar(total(draft.components))}
              </span>
            </div>
            <div className={styles.parts}>
              {draft.components.map((part, index) => {
                const item = itemById.get(part.pricebookItemId);
                return (
                  <div className={styles.part} key={index}>
                    <label>
                      Price-book item
                      <select
                        value={part.pricebookItemId}
                        onChange={(event) =>
                          changePart(index, {
                            pricebookItemId: event.target.value,
                            contractorId: undefined,
                          })
                        }
                      >
                        {!item && (
                          <option value={part.pricebookItemId}>
                            Archived item — replace
                          </option>
                        )}
                        {items.map((option) => (
                          <option value={option.id} key={option.id}>
                            {option.category} · {option.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Quantity
                      <input
                        type="number"
                        min="0.01"
                        max="1000000"
                        step="any"
                        required
                        value={part.quantity}
                        onChange={(event) =>
                          changePart(index, {
                            quantity: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    {item?.contractorRates.length ? (
                      <label>
                        Contractor
                        <select
                          required
                          value={part.contractorId || ""}
                          onChange={(event) =>
                            changePart(index, {
                              contractorId: event.target.value || undefined,
                            })
                          }
                        >
                          <option value="">Choose contractor</option>
                          {item.contractorRates.map((rate) => (
                            <option
                              value={rate.contractorId}
                              key={rate.contractorId}
                            >
                              {contractors.find(
                                (contractor) =>
                                  contractor.id === rate.contractorId,
                              )?.name || "Former contractor"}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <div className={styles.partActions}>
                      <button
                        type="button"
                        aria-label="Move item up"
                        disabled={index === 0}
                        onClick={() => movePart(index, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label="Move item down"
                        disabled={index === draft.components.length - 1}
                        onClick={() => movePart(index, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove item"
                        onClick={() =>
                          setDraft(
                            (current) =>
                              current && {
                                ...current,
                                components: current.components.filter(
                                  (_, position) => position !== index,
                                ),
                              },
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={!items.length}
              onClick={() =>
                setDraft(
                  (current) =>
                    current && {
                      ...current,
                      components: [
                        ...current.components,
                        { pricebookItemId: items[0].id, quantity: 1 },
                      ],
                    },
                )
              }
            >
              <Plus size={15} /> Add work item
            </button>
            <footer className={styles.actions}>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={busy || !draft.components.length}
              >
                {busy ? "Saving…" : "Save assembly"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
