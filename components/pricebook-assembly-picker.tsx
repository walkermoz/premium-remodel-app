"use client";

import { useState } from "react";
import type { PricebookAssembly } from "@/lib/pricebook-assemblies";
import type { PricebookItem } from "@/lib/pricebook";
import styles from "./pricebook-assemblies-panel.module.css";
import { useRegionalFormat } from "./regional-format-context";

export default function PricebookAssemblyPicker({
  assemblies,
  items,
  busy,
  onAdd,
  onClose,
}: {
  assemblies: PricebookAssembly[];
  items: PricebookItem[];
  busy: boolean;
  onAdd: (assembly: PricebookAssembly) => Promise<void>;
  onClose: () => void;
}) {
  const { cents: dollar } = useRegionalFormat();
  const [error, setError] = useState("");
  const itemById = new Map(items.map((item) => [item.id, item]));
  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className={styles.editor}
        role="dialog"
        aria-modal="true"
        aria-label="Use price-book assembly"
      >
        <header>
          <h2>Use an assembly</h2>
          <p>
            This adds a named project to the quote. Its work items can be edited
            individually after adding.
          </p>
        </header>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {assemblies.length ? (
          assemblies.map((assembly) => (
            <article key={assembly.id} className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <small>{assembly.category || "General"}</small>
                  <h3>{assembly.name}</h3>
                  <p>{assembly.description}</p>
                </div>
                <strong>
                  {dollar(
                    assembly.components.reduce(
                      (sum, part) =>
                        sum +
                        (itemById.get(part.pricebookItemId)
                          ?.customerRateCents || 0) *
                          part.quantity,
                      0,
                    ),
                  )}
                </strong>
              </div>
              <ol>
                {assembly.components.map((part, index) => (
                  <li key={index}>
                    <span>
                      {itemById.get(part.pricebookItemId)?.name ||
                        "Archived item"}
                    </span>
                    <span>× {part.quantity}</span>
                  </li>
                ))}
              </ol>
              <div className={styles.actions}>
                <button
                  type="button"
                  className="button primary"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    void onAdd(assembly).catch((cause) =>
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "Could not add assembly.",
                      ),
                    );
                  }}
                >
                  {busy ? "Adding…" : "Add to quote"}
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className={styles.empty}>
            No assemblies yet. Create one in the Price book.
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
