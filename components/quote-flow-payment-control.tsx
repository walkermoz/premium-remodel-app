"use client";

import { useMemo, useState } from "react";
import { Check, CreditCard, Landmark } from "lucide-react";
import type { QuoteFlowBlock } from "@/lib/quote-flow-schema";
import styles from "./quote-flow-payment-control.module.css";

function configuredAmount(block: QuoteFlowBlock, quoteTotal: number) {
  const mode = String(block.config.amountMode || "percent");
  if (mode === "fixed") return Number(block.config.amount || 0);
  if (mode === "remaining") return quoteTotal;
  return quoteTotal * (Number(block.config.percent || 100) / 100);
}

export default function QuoteFlowPaymentControl({
  block,
  value,
  quoteTotal,
  locale = "en-US",
  currency = "USD",
  busy,
  staff,
  onRecord,
  onPayOnline,
}: {
  block: QuoteFlowBlock;
  value: unknown;
  quoteTotal: number;
  locale?: string;
  currency?: string;
  busy: boolean;
  staff: boolean;
  onRecord?: (input: {
    amount: number;
    method: "Check" | "Cash" | "Bank transfer" | "Other";
    reference: string;
  }) => Promise<void>;
  onPayOnline?: () => Promise<void>;
}) {
  const amount = useMemo(
    () => configuredAmount(block, quoteTotal),
    [block, quoteTotal],
  );
  const [method, setMethod] = useState<
    "Check" | "Cash" | "Bank transfer" | "Other"
  >("Check");
  const paid =
    value &&
    typeof value === "object" &&
    (value as Record<string, unknown>).status === "paid";
  if (paid)
    return (
      <div className={styles.complete}>
        <Check size={17} />
        <span>
          <strong>Payment received</strong>
          <small>This required payment step is complete.</small>
        </span>
      </div>
    );
  return (
    <div className={styles.control}>
      <div className={styles.summary}>
        <span>Amount due for this step</span>
        <strong>
          {new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
          }).format(amount)}
        </strong>
      </div>
      {staff && onRecord ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void onRecord({
              amount: Number(data.get("amount") || 0),
              method,
              reference: String(data.get("reference") || ""),
            });
          }}
        >
          <label>
            Amount received
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={amount > 0 ? amount.toFixed(2) : ""}
              required
            />
          </label>
          <label>
            Method
            <select
              value={method}
              onChange={(event) =>
                setMethod(event.target.value as typeof method)
              }
            >
              <option>Check</option>
              <option>Cash</option>
              <option>Bank transfer</option>
              <option>Other</option>
            </select>
          </label>
          <label>
            Reference
            <input name="reference" maxLength={300} placeholder="Optional" />
          </label>
          <button type="submit" disabled={busy}>
            <Landmark size={15} /> {busy ? "Recording…" : "Record payment"}
          </button>
        </form>
      ) : (
        <button
          type="button"
          className={styles.pay}
          disabled={busy}
          onClick={() => void onPayOnline?.()}
        >
          <CreditCard size={16} /> {busy ? "Opening…" : "Pay securely online"}
        </button>
      )}
    </div>
  );
}
