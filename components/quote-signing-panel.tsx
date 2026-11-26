"use client";

import { useState } from "react";
import { Tablet } from "lucide-react";
import CustomerAcceptance from "@/app/client/[token]/quote/customer-acceptance";
import type { SigningDocumentView } from "@/lib/document-signing";
import type { Quote } from "@/lib/types";
import { useRegionalFormat } from "./regional-format-context";
import DocumentSigningPanel from "./document-signing-panel";

export default function QuoteSigningPanel({
  quote,
  document,
  companyReady,
  demo,
  onSent,
  onEditData,
  businessName,
  compact = false,
  onPreview,
}: {
  quote: Quote;
  document: SigningDocumentView;
  companyReady: boolean;
  demo: boolean;
  onSent: () => Promise<void>;
  onEditData: () => void;
  businessName: string;
  compact?: boolean;
  onPreview?: () => void;
}) {
  const regional = useRegionalFormat();
  const [session, setSession] = useState<{
    token: string;
    quoteUpdatedAt: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const complete = document.status === "completed";
  const pdfUrl = `/api/quotes/${encodeURIComponent(quote.id)}/pdf?view=1`;
  const reviewPdfUrl = session
    ? `/api/client-quote/${encodeURIComponent(session.token)}/pdf?view=1`
    : pdfUrl;

  async function openSigning() {
    if (busy) return;
    if (session) {
      setSession(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/quotes/${encodeURIComponent(quote.id)}/onsite-signing`,
        { method: "POST" },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "Could not start quote signing.");
      const path = new URL(result.url, window.location.origin).pathname.split(
        "/",
      );
      const token = path[path.indexOf("client") + 1];
      if (!token || !result.quoteUpdatedAt)
        throw new Error("Refresh the quote before signing.");
      await onSent();
      setSession({
        token: decodeURIComponent(token),
        quoteUpdatedAt: result.quoteUpdatedAt,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not start quote signing.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <DocumentSigningPanel
      document={document}
      step={1}
      compact={compact}
      onEditData={onEditData}
      actions={
        !complete && (!compact || companyReady) ? (
          <button
            type="button"
            className={compact ? "button secondary" : "button primary"}
            disabled={busy || !companyReady || demo}
            onClick={() => void openSigning()}
          >
            <Tablet size={15} aria-hidden="true" />
            {busy
              ? "Opening…"
              : session
                ? "Close quote signing"
                : "Sign quote on this device"}
          </button>
        ) : undefined
      }
      secondaryActions={
        <>
          {onPreview ? (
            <button
              type="button"
              className="button secondary"
              disabled={demo}
              onClick={onPreview}
            >
              Preview quote
            </button>
          ) : (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              Preview document
            </a>
          )}
          <a href={`/api/quotes/${encodeURIComponent(quote.id)}/pdf`} download>
            {complete ? "Download signed PDF" : "Download PDF"}
          </a>
        </>
      }
    >
      {!compact && !complete && !companyReady && (
        <p className="muted-note">
          Prepare and sign the company agreement below before requesting
          customer signatures.
        </p>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {session && !complete && (
        <section
          className="workflow-inline-msa-signing"
          aria-label="On-device quote signing"
        >
          <h4>Review and sign the quote here</h4>
          <p>
            The customer must review the scope, price, and terms before signing.
            The MSA needs its own signature afterward.
          </p>
          <iframe
            className="quote-document-review"
            title="Quote for customer signature"
            src={reviewPdfUrl}
          />
          <p>
            <a href={reviewPdfUrl} target="_blank" rel="noopener noreferrer">
              Open the full quote PDF
            </a>
          </p>
          <CustomerAcceptance
            token={session.token}
            clientName={quote.client}
            today={regional.date(new Date().toISOString())}
            quoteUpdatedAt={session.quoteUpdatedAt}
            approved={false}
            businessName={businessName}
            locale={regional.locale}
            timeZone={regional.timezone}
            onsite
            onSigned={async () => {
              setSession(null);
              setNotice("Quote signed. Complete the MSA signature below.");
              await onSent();
            }}
          />
        </section>
      )}
    </DocumentSigningPanel>
  );
}
