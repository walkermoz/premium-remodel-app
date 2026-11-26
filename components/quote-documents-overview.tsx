"use client";

import type { ReactNode } from "react";
import { Check, Copy, Mail } from "lucide-react";
import type { Quote } from "@/lib/types";

export default function QuoteDocumentsOverview({
  quote,
  itemCount,
  complete,
  sendDisabled,
  sendBusy,
  copyBusy,
  copyMessage,
  onEditCustomer,
  onEditQuote,
  onPrepare,
  onSend,
  onCopy,
  children,
}: {
  quote: Quote;
  itemCount: number;
  complete: boolean;
  sendDisabled: boolean;
  sendBusy: boolean;
  copyBusy: boolean;
  copyMessage: string;
  onEditCustomer: () => void;
  onEditQuote: () => void;
  onPrepare: () => void;
  onSend: () => void;
  onCopy: () => void;
  children: ReactNode;
}) {
  const hasEmail = Boolean(quote.clientEmail?.trim());
  const prepared = Boolean(quote.msaAgreement);
  const shared = Boolean(quote.quoteSentAt || quote.quoteOnsiteAt);
  const quoteSigned =
    quote.status === "Accepted" && Boolean(quote.quoteAcceptance);
  const quoteFirst = !prepared && quote.status === "Sent" && !quoteSigned;
  const title = complete
    ? "Both documents are signed"
    : !itemCount
      ? "Finish the quote first"
      : !hasEmail
        ? "Add a customer email"
        : quoteFirst
          ? shared
            ? "Complete the quote signature first"
            : "Review the quote status"
          : !prepared
            ? "Prepare your service agreement"
            : quoteSigned
              ? "The agreement still needs a signature"
              : shared
                ? "Waiting for customer signatures"
                : "Ready to request signatures";
  const detail = complete
    ? "The signed copies are available below. You can now collect the deposit."
    : !itemCount
      ? "Add scope and pricing before preparing the documents."
      : !hasEmail
        ? "An email is needed before preparing and sharing the agreement."
        : quoteFirst
          ? shared
            ? "This quote was shared before an agreement was prepared. Have the customer sign their existing quote link, then prepare the agreement."
            : "Return this unsent quote to Draft in Quote & pricing before preparing the agreement."
          : !prepared
            ? "Confirm payment terms and add your company signature before sending."
            : "One request lets the customer sign the quote, then the service agreement.";
  return (
    <>
      <div className="quote-documents-heading">
        <div>
          <h2>Documents</h2>
          <p>
            Quote and service agreement for {quote.client || "this customer"}.
          </p>
        </div>
        <span>
          {complete ? (
            <>
              <Check size={15} aria-hidden="true" />2 of 2 signed
            </>
          ) : (
            "2 documents"
          )}
        </span>
      </div>
      <div
        className={`quote-documents-next${complete ? " is-complete" : ""}`}
        role="region"
        aria-label="Document next step"
        aria-live="polite"
      >
        <div>
          <strong>{title}</strong>
          <p>{detail}</p>
        </div>
        <div className="quote-documents-next-actions">
          {!complete &&
            (!itemCount ? (
              <button
                type="button"
                className="button primary"
                onClick={onEditQuote}
              >
                Edit quote & pricing
              </button>
            ) : !hasEmail ? (
              <button
                type="button"
                className="button primary"
                onClick={onEditCustomer}
              >
                Add customer email
              </button>
            ) : quoteFirst ? (
              <button
                type="button"
                className="button primary"
                disabled={shared && copyBusy}
                onClick={shared ? onCopy : onEditQuote}
              >
                {shared ? "Copy customer link" : "Review quote & pricing"}
              </button>
            ) : !prepared ? (
              <button
                type="button"
                className="button primary"
                onClick={onPrepare}
              >
                Prepare agreement
              </button>
            ) : (
              <button
                type="button"
                className="button primary"
                disabled={sendDisabled}
                onClick={onSend}
              >
                <Mail size={15} aria-hidden="true" />
                {sendBusy
                  ? "Sending…"
                  : shared
                    ? "Resend signature request"
                    : "Send for signature"}
              </button>
            ))}
          {prepared && (
            <button
              type="button"
              className="button secondary"
              onClick={onPrepare}
            >
              Agreement details
            </button>
          )}
          {shared && !quoteFirst && (
            <button
              type="button"
              className="button secondary"
              disabled={copyBusy}
              onClick={onCopy}
            >
              <Copy size={15} aria-hidden="true" />
              {copyBusy ? "Copying…" : "Copy customer link"}
            </button>
          )}
        </div>
        {copyMessage && <p role="status">{copyMessage}</p>}
      </div>
      <div className="quote-documents-recipient">
        <span>Customer</span>
        <strong>{quote.client || "Not set"}</strong>
        <span>{quote.clientEmail || "Email missing"}</span>
        {!quoteSigned && (
          <button type="button" onClick={onEditCustomer}>
            Edit customer
          </button>
        )}
      </div>
      {children}
      {!complete && (
        <p className="quote-documents-after">
          After both documents are signed, collect the deposit to move this
          quote into Projects.
        </p>
      )}
    </>
  );
}
