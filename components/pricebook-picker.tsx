"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { pricebookMatches, type PricebookItem } from "@/lib/pricebook";
import { quantityLabel, rateLabel } from "@/lib/scope-pricing";
import type { Contractor } from "@/lib/types";
import { Modal } from "./ui";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );

export default function PricebookPicker({
  items,
  contractors,
  busy,
  showInternalCosts,
  onClose,
  onAdd,
}: {
  items: PricebookItem[];
  contractors: Contractor[];
  busy: boolean;
  showInternalCosts: boolean;
  onClose: () => void;
  onAdd: (
    item: PricebookItem,
    quantity: number,
    contractorId: string,
  ) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedId, setSelectedId] = useState(items[0]?.id || "");
  const [quantityInput, setQuantityInput] = useState("1");
  const [contractorId, setContractorId] = useState("");
  const [error, setError] = useState("");
  const categories = useMemo(
    () => ["All", ...new Set(items.map((item) => item.category || "General"))],
    [items],
  );
  const filtered = items.filter(
    (item) =>
      (category === "All" || (item.category || "General") === category) &&
      pricebookMatches(item, search),
  );
  const selected =
    filtered.find((item) => item.id === selectedId) || filtered[0] || null;
  const contractorOptions =
    selected?.contractorRates.filter((rate) =>
      contractors.some((contractor) => contractor.id === rate.contractorId),
    ) || [];
  const selectedContractorRate = contractorOptions.find(
    (rate) => rate.contractorId === contractorId,
  );
  const needsContractor = Boolean(
    selected?.contractorRates.length && !selectedContractorRate,
  );
  const quantity = Number(quantityInput);
  const validQuantity =
    Number.isFinite(quantity) && quantity > 0 && quantity <= 1_000_000;
  const quoteCents =
    selected && validQuantity
      ? Math.round(selected.customerRateCents * quantity)
      : 0;
  const subCents =
    selected && !needsContractor
      ? Math.round(
          (selectedContractorRate?.rateCents ?? selected.subRateCents) *
            (selected.subUnit === selected.unit && validQuantity
              ? quantity
              : 1),
        )
      : 0;
  const materialCents = selected
    ? Math.round(
        selected.materialRateCents *
          (selected.materialUnit === selected.unit && validQuantity
            ? quantity
            : 1),
      )
    : 0;

  async function add() {
    if (!selected) return;
    if (!validQuantity) {
      setError("Enter a quantity greater than zero.");
      return;
    }
    if (selected.contractorRates.length && !selectedContractorRate) {
      setError("Choose the contractor whose rate applies to this item.");
      return;
    }
    if (
      quoteCents > 100_000_000_000 ||
      subCents > 100_000_000_000 ||
      materialCents > 100_000_000_000
    ) {
      setError("This quantity exceeds the maximum quote line amount.");
      return;
    }
    setError("");
    try {
      await onAdd(
        selected,
        quantity,
        selectedContractorRate?.contractorId || "",
      );
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add this item.",
      );
    }
  }

  return (
    <Modal
      title="Add from price book"
      subtitle="Choose a standard item, set this job’s quantity, then edit the quote line if needed."
      onClose={onClose}
    >
      <div className="pricebook-picker">
        <div className="pricebook-picker-catalog">
          <label className="pricebook-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search items, codes or scope"
              aria-label="Search price book"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setContractorId("");
                setError("");
              }}
            />
          </label>
          <div
            className="pricebook-categories"
            aria-label="Price book categories"
          >
            {categories.map((name) => (
              <button
                type="button"
                className={category === name ? "active" : ""}
                aria-pressed={category === name}
                key={name}
                onClick={() => {
                  setCategory(name);
                  setContractorId("");
                  setError("");
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="pricebook-picker-list">
            {filtered.length ? (
              filtered.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`pricebook-picker-row ${selectedId === item.id ? "selected" : ""}`}
                  aria-pressed={selectedId === item.id}
                  onClick={() => {
                    setSelectedId(item.id);
                    setQuantityInput("1");
                    setContractorId("");
                    setError("");
                  }}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.code} · {item.category || "General"}
                    </small>
                  </span>
                  <b>{money(item.customerRateCents)}</b>
                </button>
              ))
            ) : (
              <p className="pricebook-empty">
                {items.length
                  ? "No items match this search."
                  : "No price-book items yet. Add one in the Price book first."}
              </p>
            )}
          </div>
        </div>
        <div className="pricebook-picker-detail">
          {selected ? (
            <>
              <span className="pricebook-code">{selected.code}</span>
              <h3>{selected.name}</h3>
              <p>{selected.description || "No default scope description."}</p>
              <div className="pricebook-picker-pricing">
                <div>
                  <span>{rateLabel(selected.unit)}</span>
                  <strong>{money(selected.customerRateCents)}</strong>
                </div>
                <label>
                  {quantityLabel(selected.unit)}
                  <input
                    type="number"
                    min="0.01"
                    max="1000000"
                    step="any"
                    value={quantityInput}
                    onChange={(event) => setQuantityInput(event.target.value)}
                  />
                </label>
                {!!selected.contractorRates.length && (
                  <label className="pricebook-picker-contractor">
                    Which contractor will do this work?
                    <select
                      value={contractorId}
                      onChange={(event) => {
                        setContractorId(event.target.value);
                        setError("");
                      }}
                    >
                      <option value="">Choose a contractor</option>
                      {contractorOptions.map((rate) => (
                        <option
                          key={rate.contractorId}
                          value={rate.contractorId}
                        >
                          {
                            contractors.find(
                              (contractor) =>
                                contractor.id === rate.contractorId,
                            )?.name
                          }{" "}
                          · {money(rate.rateCents)}{" "}
                          {selected.subUnit === "job"
                            ? "flat"
                            : `per ${selected.subUnit}`}
                        </option>
                      ))}
                    </select>
                    {!contractorOptions.length && (
                      <small>
                        No listed contractor is available. Update the price-book
                        item first.
                      </small>
                    )}
                  </label>
                )}
                <div className="pricebook-picker-total">
                  <span>Quote price</span>
                  <strong>{money(quoteCents)}</strong>
                </div>
                {showInternalCosts && (
                  <>
                    <div>
                      <span>Subcontractor cost</span>
                      <strong>
                        {needsContractor
                          ? "Choose a contractor"
                          : money(subCents)}
                      </strong>
                    </div>
                    <div>
                      <span>Material cost</span>
                      <strong>{money(materialCents)}</strong>
                    </div>
                    <div>
                      <span>Estimated profit</span>
                      <strong>
                        {needsContractor
                          ? "—"
                          : money(quoteCents - subCents - materialCents)}
                      </strong>
                    </div>
                  </>
                )}
              </div>
              <small className="pricebook-snapshot-note">
                This quote keeps its own copy. Future price-book changes will
                not alter it.
              </small>
            </>
          ) : (
            <p className="pricebook-empty">
              Select an item to review its pricing.
            </p>
          )}
        </div>
      </div>
      {error && (
        <p className="pricebook-picker-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-footer">
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="button primary"
          disabled={
            !selected ||
            busy ||
            Boolean(
              selected.contractorRates.length && !contractorOptions.length,
            )
          }
          onClick={() => void add()}
        >
          {busy ? "Adding…" : "Add to quote"}
        </button>
      </div>
    </Modal>
  );
}
