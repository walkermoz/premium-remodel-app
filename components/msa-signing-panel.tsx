"use client";

import { useState } from "react";
import {
  Check,
  CheckCircle2,
  FileSignature,
  Hourglass,
} from "lucide-react";
import type { Quote, SignatureStroke } from "@/lib/types";
import { projectMoney } from "@/lib/project-finances";
import { makeMsaPreview } from "@/lib/msa-preview";
import MsaDocument from "./msa-document";
import MsaSignaturePad from "./msa-signature-pad";

export default function MsaSigningPanel({
  quote,
  signerName,
  onSent,
}: {
  quote: Quote;
  signerName: string;
  onSent: () => Promise<void>;
}) {
  const [signerTitle, setSignerTitle] = useState("");
  const [signatureStrokes, setSignatureStrokes] = useState<SignatureStroke[]>(
    [],
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const accepted =
    quote.status === "Accepted" &&
    Boolean(quote.quoteAcceptance) &&
    Boolean(quote.acceptedQuoteScope?.length);
  const detailsReady = Boolean(
    quote.msaPaymentSchedule?.length &&
    quote.msaPermitResponsibility &&
    quote.msaContractTerms,
  );
  const agreement = quote.msaAgreement;
  const preview =
    accepted &&
    detailsReady &&
    quote.contractPrice &&
    quote.acceptedQuoteScope?.length
      ? makeMsaPreview({
          project: quote,
          scope: quote.acceptedQuoteScope,
          price: quote.contractPrice,
          paymentSchedule: quote.msaPaymentSchedule!,
          permitResponsibility: quote.msaPermitResponsibility!,
          terms: quote.msaContractTerms!,
          owner: quote.client.trim(),
          ownerEmail: quote.clientEmail?.trim() || "",
          signerName,
          signerTitle,
        })
      : null;

  async function prepareAgreement() {
    setSending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/msa/${encodeURIComponent(quote.id)}/prepare`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner: quote.client.trim(),
            ownerEmail: quote.clientEmail?.trim() || "",
            signerTitle: signerTitle.trim(),
            signatureStrokes,
          }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "Could not prepare the agreement.");
      await onSent();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not prepare the agreement.",
      );
    } finally {
      setSending(false);
    }
  }

  if (agreement) {
    const signed = agreement.status === "signed";
    const prepared = agreement.status === "prepared";
    return (
      <section
        className={`workflow-completion-panel workflow-document-panel ${signed ? "is-complete" : ""}`}
        aria-label="Agreement signature status"
      >
        <header>
          <div className="workflow-document-marker">
            <span
              className={`workflow-document-step ${signed ? "is-complete" : ""}`}
            >
              {signed ? <Check size={14} aria-hidden="true" /> : "2"}
            </span>
            <span className="workflow-completion-icon">
              {signed ? (
                <CheckCircle2 size={18} aria-hidden="true" />
              ) : (
                <Hourglass size={18} aria-hidden="true" />
              )}
            </span>
          </div>
          <div>
            <span className="project-handoff-eyebrow">MSA document</span>
            <h3>
              {signed
                ? "Agreement signed"
                : prepared
                  ? "Company signature complete"
                  : "Awaiting customer signature"}
            </h3>
            <p>
              {signed
                ? `${agreement.customerSignature?.name || agreement.owner} signed the agreement.`
                : prepared
                  ? accepted
                    ? "The MSA is ready. Choose a customer handoff option above."
                    : "The MSA is ready and will follow the quote in the customer portal."
                  : `The customer portal is active for ${agreement.ownerEmail}.`}
            </p>
          </div>
          {signed && (
            <div className="workflow-document-actions">
              <a
                className="button secondary"
                href={`/api/msa/${encodeURIComponent(quote.id)}/pdf?view=1`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View signed MSA
              </a>
            </div>
          )}
        </header>
        <dl>
          <div>
            <dt>Customer</dt>
            <dd>{agreement.owner}</dd>
          </div>
          <div>
            <dt>Contract</dt>
            <dd>{projectMoney(agreement.price)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              {signed
                ? "Complete"
                : prepared
                  ? "Prepared"
                  : "Available in client portal"}
            </dd>
          </div>
        </dl>
        {error && <p className="alert">{error}</p>}
      </section>
    );
  }

  if (!accepted) {
    return (
      <section
        className="workflow-completion-panel workflow-document-panel is-waiting"
        aria-label="Agreement signature status"
      >
        <header>
          <div className="workflow-document-marker">
            <span className="workflow-document-step">2</span>
            <span className="workflow-completion-icon">
              <Hourglass size={18} aria-hidden="true" />
            </span>
          </div>
          <div>
            <span className="project-handoff-eyebrow">Service agreement</span>
            <h3>Prepare the agreement</h3>
            <p>
              Sign and prepare the MSA in Agreement details. The customer can
              then sign the quote and MSA in one visit.
            </p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section
      className="workflow-completion-panel workflow-document-panel"
      aria-label="Send service agreement"
    >
      <header>
        <div className="workflow-document-marker">
          <span className="workflow-document-step">2</span>
          <span className="workflow-completion-icon">
            <FileSignature size={18} aria-hidden="true" />
          </span>
        </div>
        <div>
          <span className="project-handoff-eyebrow">Service agreement</span>
          <h3>Company signature</h3>
          <p>
            Review the MSA and sign as the company representative. Choose how
            the customer will sign in the next step.
          </p>
        </div>
      </header>
      {!detailsReady && (
        <p className="alert">
          Complete and save Agreement Details before sending the MSA.
        </p>
      )}
      {preview && (
        <div className="workflow-msa-review">
          <div className="workflow-msa-review-heading">
            <h4>Agreement preview</h4>
            <p>
              Review the scope, payment milestones, contract terms, and Notice
              of Cancellation before signing.
            </p>
          </div>
          <div
            className="workflow-msa-document-scroll"
            role="region"
            aria-label="Scrollable master services agreement"
            tabIndex={0}
          >
            <MsaDocument agreement={preview} preview />
          </div>
        </div>
      )}
      <div className="workflow-signing-fields">
        <label>
          Legal owner
          <input value={quote.client} readOnly />
        </label>
        <label>
          Owner email
          <input value={quote.clientEmail || ""} readOnly />
        </label>
        <label>
          Signing staff member
          <input value={signerName} readOnly />
        </label>
        <label>
          Staff title (optional)
          <input
            value={signerTitle}
            maxLength={100}
            placeholder="e.g. CEO & Owner"
            onChange={(event) => setSignerTitle(event.target.value)}
          />
        </label>
      </div>
      <p className="workflow-signature-label">Company member signature</p>
      <MsaSignaturePad onChange={setSignatureStrokes} disabled={sending} />
      {error && <p className="alert">{error}</p>}
      <div className="workflow-completion-actions">
        <button
          type="button"
          className="button primary"
          disabled={
            sending ||
            !detailsReady ||
            !quote.clientEmail ||
            !signatureStrokes.length
          }
          onClick={() => void prepareAgreement()}
        >
          {sending ? "Signing…" : "Sign MSA"}
        </button>
      </div>
    </section>
  );
}
