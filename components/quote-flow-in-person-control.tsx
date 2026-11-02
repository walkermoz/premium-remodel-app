"use client";

import { useState } from "react";
import { Check, PenLine } from "lucide-react";
import type { QuoteFlowBlock } from "@/lib/quote-flow-schema";
import styles from "./quote-flow-in-person-control.module.css";

export default function QuoteFlowInPersonControl({
  block,
  value,
  busy,
  onComplete,
  canSignOnBehalf = false,
  onSignOnBehalf,
}: {
  block: QuoteFlowBlock;
  value: unknown;
  busy: boolean;
  onComplete: (input: {
    signedName: string;
    reference: string;
  }) => Promise<void>;
  canSignOnBehalf?: boolean;
  onSignOnBehalf?: (input: {
    signedName: string;
    authorization: string;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState<"in_person" | "on_behalf" | null>(null);
  const signed =
    value && typeof value === "object" && "method" in value
      ? (value as {
          method?: string;
          signedName?: string;
          signedAt?: string;
          witnessedBy?: string;
        })
      : null;
  if (signed && ["in_person", "on_behalf"].includes(signed.method || ""))
    return (
      <div className={styles.complete}>
        <Check size={16} />
        <div>
          <strong>
            {signed.method === "on_behalf"
              ? "Signed on behalf of"
              : "Signed in person by"}{" "}
            {signed.signedName}
          </strong>
          <small>
            Witnessed by {signed.witnessedBy || "an authorized teammate"}
          </small>
        </div>
      </div>
    );
  return (
    <div className={styles.control}>
      <div>
        <PenLine size={17} />
        <span>
          <strong>{block.label}</strong>
          <small>Remote, on-device, or signed in person</small>
        </span>
      </div>
      {!open ? (
        <div className={styles.actions}>
          <button type="button" onClick={() => setOpen("in_person")}>
            Mark signed in person
          </button>
          {canSignOnBehalf && onSignOnBehalf && (
            <button type="button" onClick={() => setOpen("on_behalf")}>
              Sign on behalf
            </button>
          )}
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const signedName = String(data.get("signedName") || "");
            const completion =
              open === "on_behalf" && onSignOnBehalf
                ? onSignOnBehalf({
                    signedName,
                    authorization: String(data.get("authorization") || ""),
                  })
                : onComplete({
                    signedName,
                    reference: String(data.get("reference") || ""),
                  });
            void completion.then(() => setOpen(null));
          }}
        >
          <label>
            Signer name
            <input name="signedName" required minLength={2} maxLength={200} />
          </label>
          {open === "on_behalf" ? (
            <label>
              Authority to sign
              <textarea
                name="authorization"
                required
                minLength={10}
                maxLength={1000}
                placeholder="Document the customer’s authorization"
              />
            </label>
          ) : (
            <label>
              Note or reference
              <input
                name="reference"
                maxLength={300}
                placeholder="Optional check-in or paper reference"
              />
            </label>
          )}
          <div>
            <button type="button" onClick={() => setOpen(null)}>
              Cancel
            </button>
            <button type="submit" disabled={busy}>
              {busy
                ? "Recording…"
                : open === "on_behalf"
                  ? "Confirm delegated signature"
                  : "Confirm in-person signature"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
