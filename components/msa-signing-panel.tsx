"use client";

import { useState } from "react";
import { CheckCircle2, FileSignature, Hourglass } from "lucide-react";
import type { Quote, SignatureStroke } from "@/lib/types";
import { projectMoney } from "@/lib/project-finances";
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

  async function sendAgreement(retry = false) {
    if (!quote.clientEmail) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/msa/${encodeURIComponent(quote.id)}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner: quote.client.trim(),
            ownerEmail: quote.clientEmail.trim(),
            signerTitle: signerTitle.trim(),
            signatureStrokes,
            retry,
          }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "Could not send the agreement.");
      await onSent();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not send the agreement.",
      );
    } finally {
      setSending(false);
    }
  }

  if (agreement) {
    const signed = agreement.status === "signed";
    return (
      <section
        className="workflow-completion-panel"
        aria-label="Agreement signature status"
      >
        <header>
          <span className="workflow-completion-icon">
            {signed ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <Hourglass size={18} aria-hidden="true" />
            )}
          </span>
          <div>
            <span className="project-handoff-eyebrow">Service agreement</span>
            <h3>
              {signed ? "Agreement signed" : "Awaiting customer signature"}
            </h3>
            <p>
              {signed
                ? `${agreement.customerSignature?.name || agreement.owner} signed the agreement.`
                : `The agreement was sent to ${agreement.ownerEmail}.`}
            </p>
          </div>
          {signed ? (
            <a
              className="button secondary"
              href={`/api/msa/${encodeURIComponent(quote.id)}/pdf`}
            >
              Download signed MSA
            </a>
          ) : agreement.status === "prepared" ? (
            <button
              type="button"
              className="button primary"
              disabled={sending}
              onClick={() => void sendAgreement(true)}
            >
              {sending ? "Sending…" : "Retry email"}
            </button>
          ) : null}
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
            <dd>{signed ? "Complete" : "Sent through client portal"}</dd>
          </div>
        </dl>
        {error && <p className="alert">{error}</p>}
      </section>
    );
  }

  if (!accepted) {
    return (
      <section
        className="workflow-completion-panel is-waiting"
        aria-label="Agreement signature status"
      >
        <header>
          <span className="workflow-completion-icon">
            <Hourglass size={18} aria-hidden="true" />
          </span>
          <div>
            <span className="project-handoff-eyebrow">Service agreement</span>
            <h3>Waiting for quote acceptance</h3>
            <p>
              Once the customer signs the quote in the portal, the prepared MSA
              can be signed by staff and sent from this step.
            </p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section
      className="workflow-completion-panel"
      aria-label="Send service agreement"
    >
      <header>
        <span className="workflow-completion-icon">
          <FileSignature size={18} aria-hidden="true" />
        </span>
        <div>
          <span className="project-handoff-eyebrow">Service agreement</span>
          <h3>Sign and send the prepared MSA</h3>
          <p>
            The customer receives it in the same private portal used for the
            quote.
          </p>
        </div>
      </header>
      {!detailsReady && (
        <p className="alert">
          Complete and save Agreement Details before sending the MSA.
        </p>
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
          Staff title
          <input
            value={signerTitle}
            maxLength={100}
            placeholder="e.g. CEO & Owner"
            onChange={(event) => setSignerTitle(event.target.value)}
          />
        </label>
      </div>
      <p className="workflow-signature-label">Staff signature</p>
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
            !signerTitle.trim() ||
            !signatureStrokes.length
          }
          onClick={() => void sendAgreement()}
        >
          {sending ? "Sending…" : "Sign and email MSA"}
        </button>
      </div>
    </section>
  );
}
