"use client";

import { useState } from "react";
import { Check, Tablet } from "lucide-react";
import type { SigningDocumentView } from "@/lib/document-signing";
import type { Quote } from "@/lib/types";
import { projectMoney } from "@/lib/project-finances";
import { makeMsaPreview } from "@/lib/msa-preview";
import DocumentSigningPanel from "./document-signing-panel";
import MsaDocument from "./msa-document";
import SignatureField, {
  signatureFieldComplete,
  type SignatureFieldValue,
} from "./signature-field";

export default function MsaSigningPanel({
  quote,
  signerName,
  document,
  onSent,
  onEditData,
}: {
  quote: Quote;
  signerName: string;
  document: SigningDocumentView;
  onSent: () => Promise<void>;
  onEditData?: () => void;
}) {
  const [signerTitle, setSignerTitle] = useState("");
  const [staffSignature, setStaffSignature] = useState<SignatureFieldValue>({
    signedName: signerName,
    signatureMethod: "drawn",
    signatureStrokes: [],
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [customerSigningOpen, setCustomerSigningOpen] = useState(false);
  const [customerSigningToken, setCustomerSigningToken] = useState("");
  const [customerSignature, setCustomerSignature] =
    useState<SignatureFieldValue>({
      signedName: quote.client,
      signatureMethod: "drawn",
      signatureStrokes: [],
    });
  const [customerAgreed, setCustomerAgreed] = useState(false);
  const [customerSigningBusy, setCustomerSigningBusy] = useState(false);
  const [customerSigningError, setCustomerSigningError] = useState("");
  const [customerSigningNotice, setCustomerSigningNotice] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [cancellationDate, setCancellationDate] = useState("");
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
            signatureMethod: staffSignature.signatureMethod,
            signatureStrokes: staffSignature.signatureStrokes,
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

  async function openCustomerSigning() {
    if (customerSigningBusy) return;
    if (customerSigningOpen && customerSigningToken) {
      setCustomerSigningOpen(false);
      return;
    }
    setCustomerSigningBusy(true);
    setCustomerSigningError("");
    setCustomerSigningNotice("");
    try {
      const response = await fetch(
        `/api/quotes/${encodeURIComponent(quote.id)}/onsite-signing`,
        { method: "POST" },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "Could not start MSA signing.");
      const signingUrl = new URL(result.url, window.location.origin);
      const segments = signingUrl.pathname.split("/").filter(Boolean);
      const clientIndex = segments.indexOf("client");
      const token = clientIndex >= 0 ? segments[clientIndex + 1] : "";
      if (!token) throw new Error("The signing session could not be opened.");
      setCustomerSigningToken(decodeURIComponent(token));
      setTransactionDate(String(result.transactionDate || ""));
      setCancellationDate(String(result.cancellationDeadline || ""));
      setCustomerSigningOpen(true);
      await onSent();
    } catch (cause) {
      setCustomerSigningError(
        cause instanceof Error ? cause.message : "Could not start MSA signing.",
      );
    } finally {
      setCustomerSigningBusy(false);
    }
  }

  async function signCustomerAgreement() {
    if (
      customerSigningBusy ||
      !customerSigningToken ||
      !agreement ||
      !transactionDate
    )
      return;
    setCustomerSigningBusy(true);
    setCustomerSigningError("");
    setCustomerSigningNotice("");
    try {
      const response = await fetch(
        `/api/client-quote/${encodeURIComponent(customerSigningToken)}/msa/sign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signedName: customerSignature.signedName.trim(),
            signatureMethod: customerSignature.signatureMethod,
            signatureStrokes: customerSignature.signatureStrokes,
            termsSha256: agreement.termsSha256,
            transactionDate,
            agreed: customerAgreed,
          }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "Could not save the MSA signature.");
      if (result.emailWarning) setCustomerSigningNotice(result.emailWarning);
      setCustomerSigningOpen(false);
      await onSent();
    } catch (cause) {
      setCustomerSigningError(
        cause instanceof Error
          ? cause.message
          : "Could not save the MSA signature.",
      );
    } finally {
      setCustomerSigningBusy(false);
    }
  }

  if (agreement) {
    const signed = agreement.status === "signed";
    return (
      <DocumentSigningPanel
        document={document}
        step={2}
        onEditData={onEditData}
        actions={
          !signed && accepted ? (
            <>
              <button
                type="button"
                className="button primary"
                disabled={customerSigningBusy}
                onClick={() => void openCustomerSigning()}
              >
                <Tablet size={15} aria-hidden="true" />
                {customerSigningBusy
                  ? "Opening…"
                  : customerSigningOpen
                    ? "Close signing"
                    : "Sign MSA on this device"}
              </button>
            </>
          ) : null
        }
        secondaryActions={
          <>
            <a
              href={`/api/msa/${encodeURIComponent(quote.id)}/pdf?view=1`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Preview document
            </a>
            {signed && (
              <a href={`/api/msa/${encodeURIComponent(quote.id)}/pdf`} download>
                Download signed PDF
              </a>
            )}
          </>
        }
      >
        <div className="workflow-document-contract-value">
          <span>Contract value</span>
          <strong>{projectMoney(agreement.price)}</strong>
        </div>
        {customerSigningOpen && transactionDate && (
          <section
            className="workflow-inline-msa-signing"
            aria-label="On-device MSA signing"
          >
            <div className="workflow-inline-msa-heading">
              <div>
                <span className="project-handoff-eyebrow">
                  Customer signature
                </span>
                <h4>Review and sign the MSA here</h4>
                <p>
                  The customer can review and sign on this device. The portal
                  link remains active if it was already emailed.
                </p>
              </div>
              <span className="workflow-inline-msa-date">
                Effective date · {transactionDate}
              </span>
            </div>
            <div
              className="workflow-msa-document-scroll"
              role="region"
              aria-label="Scrollable MSA for customer signature"
              tabIndex={0}
            >
              <MsaDocument
                agreement={{
                  ...agreement,
                  status: "sent",
                  transactionDate,
                  cancellationDeadline: cancellationDate,
                }}
                highlightOwnerSignature
              />
            </div>
            <div className="workflow-inline-msa-fields">
              <div>
                <span>Date</span>
                <strong>{transactionDate}</strong>
              </div>
            </div>
            <SignatureField
              value={customerSignature}
              onChange={(value) => {
                setCustomerSignature(value);
                setCustomerSigningError("");
              }}
              disabled={customerSigningBusy}
              nameLabel="Customer print name"
            />
            <label className="workflow-inline-msa-consent">
              <input
                type="checkbox"
                checked={customerAgreed}
                disabled={customerSigningBusy}
                onChange={(event) => setCustomerAgreed(event.target.checked)}
              />
              <span
                className="workflow-inline-msa-consent-box"
                aria-hidden="true"
              >
                <Check size={12} strokeWidth={3} />
              </span>
              <span>
                I reviewed and approve this Master Services Agreement, including
                its exhibits, and intend my electronic signature to sign it.
              </span>
            </label>
            {customerSigningError && (
              <p role="alert" className="alert">
                {customerSigningError}
              </p>
            )}
            {customerSigningNotice && (
              <p role="status" className="alert">
                {customerSigningNotice}
              </p>
            )}
            <div className="workflow-completion-actions">
              <button
                type="button"
                className="button primary"
                disabled={
                  customerSigningBusy ||
                  !customerAgreed ||
                  !signatureFieldComplete(customerSignature)
                }
                onClick={() => void signCustomerAgreement()}
              >
                {customerSigningBusy ? "Saving signature…" : "Sign MSA"}
              </button>
            </div>
          </section>
        )}
        {(error || (!customerSigningOpen && customerSigningError)) && (
          <p className="alert">{error || customerSigningError}</p>
        )}
      </DocumentSigningPanel>
    );
  }

  if (!accepted) {
    return (
      <DocumentSigningPanel
        document={document}
        step={2}
        onEditData={onEditData}
      />
    );
  }

  return (
    <DocumentSigningPanel document={document} step={2} onEditData={onEditData}>
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
      <SignatureField
        value={staffSignature}
        onChange={(value) => {
          setStaffSignature(value);
          setError("");
        }}
        disabled={sending}
        nameLabel="Company representative print name"
        nameReadOnly
      />
      {error && <p className="alert">{error}</p>}
      <div className="workflow-completion-actions">
        <button
          type="button"
          className="button primary"
          disabled={
            sending ||
            !detailsReady ||
            !quote.clientEmail ||
            !signatureFieldComplete(staffSignature)
          }
          onClick={() => void prepareAgreement()}
        >
          {sending ? "Signing…" : "Sign MSA"}
        </button>
      </div>
    </DocumentSigningPanel>
  );
}
