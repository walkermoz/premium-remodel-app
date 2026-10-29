"use client";

import { useEffect, useState } from "react";
import { FileSignature, Plus, Trash2 } from "lucide-react";
import {
  defaultMsaContractTerms,
  defaultMsaPaymentSchedule,
  msaPaymentAmounts,
  msaPrefill,
} from "@/lib/msa-draft";
import type {
  MsaContractTerms,
  MsaPaymentStep,
  MsaPermitResponsibility,
  Project,
  Quote,
  ScopeItem,
} from "@/lib/types";
import { dateLabel } from "@/lib/utils";
import { projectMoney } from "@/lib/project-finances";
import MsaSignaturePad from "./msa-signature-pad";
import type { SignatureStroke } from "@/lib/types";
import styles from "./msa-draft-panel.module.css";

export default function MsaDraftPanel({
  project,
  items,
  onSaveTerms,
  signer,
  showSigning = true,
  canSendAgreement = true,
}: {
  project: Project | Quote;
  items: ScopeItem[];
  onSaveTerms: (terms: {
    msaPaymentSchedule: MsaPaymentStep[];
    msaPermitResponsibility: MsaPermitResponsibility;
    msaContractTerms: MsaContractTerms;
  }) => Promise<void>;
  signer: { name: string };
  showSigning?: boolean;
  canSendAgreement?: boolean;
}) {
  const [historical, setHistorical] = useState<{
    price: number;
    scope: ReturnType<typeof msaPrefill>["scope"];
    quoteNumber: string;
  } | null>(null);
  const [historicalError, setHistoricalError] = useState("");
  const [confirmedHistorical, setConfirmedHistorical] = useState(false);
  const recordedTotal = project.acceptedQuoteScope?.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const needsHistorical =
    canSendAgreement &&
    (!project.acceptedQuoteScope?.length ||
      !project.contractPrice ||
      Math.round((recordedTotal || 0) * 100) !==
        Math.round((project.contractPrice || 0) * 100));
  useEffect(() => {
    if (!needsHistorical) return;
    let active = true;
    fetch(`/api/msa/${encodeURIComponent(project.id)}/send`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || "Accepted quote snapshot is unavailable.",
          );
        if (active) setHistorical(result);
      })
      .catch((cause) => {
        if (active)
          setHistoricalError(
            cause instanceof Error
              ? cause.message
              : "Accepted quote snapshot is unavailable.",
          );
      });
    return () => {
      active = false;
    };
  }, [needsHistorical, project.id]);
  const draftBase = msaPrefill(project, items);
  const draft =
    historical && needsHistorical
      ? {
          ...draftBase,
          contractPrice: historical.price,
          scope: historical.scope,
          quoteNumber: historical.quoteNumber,
          priceSource: "accepted scope" as const,
          scopeSource: "accepted quote" as const,
        }
      : draftBase;
  const [steps, setSteps] = useState<MsaPaymentStep[]>(draft.paymentSchedule);
  const [permit, setPermit] = useState<MsaPermitResponsibility>(
    draft.permitResponsibility,
  );
  const savedContractTerms: MsaContractTerms = {
    exclusions: draft.exclusions,
    allowances: draft.allowances,
    retainage: draft.retainage,
    buildersRisk: draft.buildersRisk,
    siteAccess: draft.siteAccess,
    plans: draft.plans,
  };
  const [contractTerms, setContractTerms] =
    useState<MsaContractTerms>(savedContractTerms);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [owner, setOwner] = useState(
    project.msaAgreement?.owner || draft.owner,
  );
  const [ownerEmail, setOwnerEmail] = useState(
    project.msaAgreement?.ownerEmail || draft.email,
  );
  const [signerTitle, setSignerTitle] = useState(
    project.msaAgreement?.staffSignature.title || "",
  );
  const [signatureStrokes, setSignatureStrokes] = useState<SignatureStroke[]>(
    [],
  );
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const percentTotal = steps.reduce((sum, step) => sum + step.percent, 0);
  const validSchedule =
    steps.length > 0 &&
    steps.length <= 12 &&
    steps.every(
      (step) =>
        step.milestone.trim().length >= 2 &&
        step.milestone.trim().length <= 200 &&
        Number.isFinite(step.percent) &&
        step.percent > 0 &&
        step.percent <= 100,
    ) &&
    Math.abs(percentTotal - 100) < 0.001;
  const amounts =
    validSchedule && draft.contractPrice
      ? msaPaymentAmounts(draft.contractPrice, steps)
      : [];
  const hasUnsavedTerms =
    JSON.stringify(steps) !== JSON.stringify(draft.paymentSchedule) ||
    permit !== draft.permitResponsibility ||
    JSON.stringify(contractTerms) !== JSON.stringify(savedContractTerms);
  const validContractTerms = Object.values(contractTerms).every(
    (value) => value.trim().length > 0 && value.length <= 15000,
  );
  const needsQuotedTerms =
    /^Review (?:exclusions|the allowance amounts)/i.test(
      contractTerms.exclusions,
    ) ||
    /^Review (?:exclusions|the allowance amounts)/i.test(
      contractTerms.allowances,
    );
  const price = draft.contractPrice
    ? projectMoney(draft.contractPrice)
    : "Needs a price";
  const fields = [
    ["Owner candidate", draft.owner || "Needs a name"],
    ["Phone", draft.phone || "Not recorded"],
    ["Email", draft.email || "Not recorded"],
    ["Project", draft.project || "Needs a description"],
    ["Quote", draft.quoteNumber ? `#${draft.quoteNumber}` : "Not recorded"],
    ["Premises", draft.address || "Needs an address"],
    ["Company signer", draft.companySigner],
    ["Deposit collection", draft.depositCollection],
    ["Exhibit G mailing address", draft.cancellationAddress],
    ["Effective date", draft.effectiveDate],
    [
      "Contract price",
      `${price}${draft.priceSource === "current scope" || draft.priceSource === "accepted scope" ? " · verify against accepted quote" : ""}`,
    ],
    [
      "Estimated start",
      draft.startDate ? dateLabel(draft.startDate) : "Not set",
    ],
    [
      "Estimated completion",
      draft.completionDate ? dateLabel(draft.completionDate) : "Not set",
    ],
  ];
  const contractFields: Array<[keyof MsaContractTerms, string]> = [
    ["exclusions", "Excluded work"],
    ["allowances", "Material allowances"],
    ["retainage", "Retainage"],
    ["buildersRisk", "Builder’s risk"],
    ["siteAccess", "Site and access"],
    ["plans", "Plans and specifications"],
  ];

  function updateContractTerm(key: keyof MsaContractTerms, value: string) {
    setContractTerms((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setSaveError("");
  }

  function updateStep(id: string, changes: Partial<MsaPaymentStep>) {
    setSteps((current) =>
      current.map((step) => (step.id === id ? { ...step, ...changes } : step)),
    );
    setSaved(false);
    setSaveError("");
  }

  async function saveTerms() {
    if (!validSchedule || !validContractTerms) {
      setSaveError(
        "Complete all contract terms and enter 1–12 milestones totaling 100%.",
      );
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const msaContractTerms: MsaContractTerms = {
        exclusions: contractTerms.exclusions.trim(),
        allowances: contractTerms.allowances.trim(),
        retainage: contractTerms.retainage.trim(),
        buildersRisk: contractTerms.buildersRisk.trim(),
        siteAccess: contractTerms.siteAccess.trim(),
        plans: contractTerms.plans.trim(),
      };
      await onSaveTerms({
        msaPaymentSchedule: steps.map((step) => ({
          ...step,
          milestone: step.milestone.trim(),
        })),
        msaPermitResponsibility: permit,
        msaContractTerms,
      });
      setSaved(true);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save MSA terms.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function sendAgreement() {
    if (hasUnsavedTerms && project.msaAgreement?.status !== "prepared") {
      setSendError("Save the MSA terms before signing and sending.");
      return;
    }
    if (
      !signatureStrokes.length &&
      project.msaAgreement?.status !== "prepared"
    ) {
      setSendError("Draw your signature before sending.");
      return;
    }
    setSending(true);
    setSendError("");
    try {
      const response = await fetch(
        `/api/msa/${encodeURIComponent(project.id)}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner: owner.trim(),
            ownerEmail: ownerEmail.trim(),
            signerTitle: signerTitle.trim(),
            signatureStrokes,
            retry: project.msaAgreement?.status === "prepared",
            confirmedHistoricalScope: confirmedHistorical,
          }),
        },
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Could not send the agreement.");
      }
      window.location.reload();
    } catch (cause) {
      setSendError(
        cause instanceof Error
          ? cause.message
          : "Could not send the agreement.",
      );
      setSending(false);
    }
  }

  if (project.msaAgreement) {
    const agreement = project.msaAgreement;
    const rows = msaPaymentAmounts(agreement.price, agreement.paymentSchedule);
    return (
      <section className={styles.panel} aria-label="Master services agreement">
        <div className={styles.heading}>
          <div className={styles.title}>
            <FileSignature size={21} aria-hidden="true" />
            <div>
              <h2>Master services agreement</h2>
              <p>
                {agreement.status === "signed"
                  ? "Signed agreement"
                  : agreement.status === "sent"
                    ? "Awaiting owner signature"
                    : "Prepared agreement"}
              </p>
            </div>
          </div>
        </div>
        <dl className={styles.fields}>
          <div>
            <dt>Owner</dt>
            <dd>
              {agreement.owner} · {agreement.ownerEmail}
            </dd>
          </div>
          <div>
            <dt>Contract price</dt>
            <dd>{projectMoney(agreement.price)}</dd>
          </div>
          <div>
            <dt>Contractor signer</dt>
            <dd>
              {agreement.staffSignature.name}, {agreement.staffSignature.title}
            </dd>
          </div>
          {agreement.customerSignature && (
            <div>
              <dt>Owner signed</dt>
              <dd>
                {agreement.customerSignature.name} · {agreement.transactionDate}
              </dd>
            </div>
          )}
        </dl>
        <h3>Payment milestones</h3>
        <ol>
          {agreement.paymentSchedule.map((step, index) => (
            <li key={step.id}>
              {step.milestone} · {step.percent}% · {projectMoney(rows[index])}
            </li>
          ))}
        </ol>
        {agreement.status === "prepared" && (
          <>
            <p role="alert">
              Email delivery was not confirmed. Check Gmail Sent before
              retrying. This prepared agreement is frozen; project edits will
              not change it.
            </p>
            <button
              type="button"
              className="button primary small-button"
              disabled={sending}
              onClick={() => void sendAgreement()}
            >
              {sending ? "Sending…" : "Retry sending MSA"}
            </button>
            {sendError && (
              <p role="alert" className={styles.error}>
                {sendError}
              </p>
            )}
          </>
        )}
        {agreement.status === "sent" && (
          <p>
            Sent to {agreement.ownerEmail}. The customer can sign from their
            private quote link.
          </p>
        )}
        {agreement.status === "signed" && (
          <a
            className="button secondary small-button"
            href={`/api/msa/${encodeURIComponent(project.id)}/pdf`}
          >
            Download signed MSA
          </a>
        )}
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label="MSA preparation">
      <div className={styles.heading}>
        <div className={styles.title}>
          <FileSignature size={21} aria-hidden="true" />
          <div>
            <h2>Master services agreement</h2>
            <p>Draft information pulled from this quote.</p>
          </div>
        </div>
      </div>
      <p className={styles.warning}>
        This is preparation for the MSA, not a completed agreement. Confirm the
        details and payment terms before sending it for signature.
      </p>
      <dl className={styles.fields}>
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.terms}>
        <div className={styles.termsHeading}>
          <h3>Payment milestones</h3>
          <span>
            {draft.scheduleSource === "saved"
              ? "Saved schedule"
              : "Suggested default"}
          </span>
        </div>
        <p>
          Change the checkpoints or percentages for this project. They must
          total 100%.
        </p>
        <div className={styles.milestones}>
          {steps.map((step, index) => (
            <div className={styles.milestone} key={step.id}>
              <label>
                {index === 0 ? "Deposit" : `Checkpoint ${index}`}
                <input
                  type="text"
                  maxLength={200}
                  value={step.milestone}
                  onChange={(event) =>
                    updateStep(step.id, { milestone: event.target.value })
                  }
                />
              </label>
              <label>
                Percent
                <input
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={Number.isFinite(step.percent) ? step.percent : ""}
                  onChange={(event) =>
                    updateStep(step.id, {
                      percent:
                        event.target.value === ""
                          ? NaN
                          : Number(event.target.value),
                    })
                  }
                />
              </label>
              <span className={styles.amount}>
                {amounts[index] !== undefined
                  ? projectMoney(amounts[index])
                  : "—"}
              </span>
              <button
                type="button"
                className={styles.remove}
                aria-label={
                  index === 0 ? "Remove deposit" : `Remove checkpoint ${index}`
                }
                disabled={steps.length === 1}
                onClick={() => {
                  setSteps((current) =>
                    current.filter((row) => row.id !== step.id),
                  );
                  setSaved(false);
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <div className={styles.scheduleFooter}>
          <button
            type="button"
            className="button secondary small-button"
            disabled={steps.length >= 12}
            onClick={() => {
              setSteps((current) => [
                ...current,
                { id: crypto.randomUUID(), milestone: "", percent: 0 },
              ]);
              setSaved(false);
            }}
          >
            <Plus size={15} aria-hidden="true" /> Add checkpoint
          </button>
          <span className={!validSchedule ? styles.invalidTotal : ""}>
            Total{" "}
            {Number.isFinite(percentTotal) ? percentTotal.toFixed(2) : "—"}%
          </span>
        </div>
        <label className={styles.permit}>
          Permit responsibility
          <select
            value={permit}
            onChange={(event) => {
              setPermit(event.target.value as MsaPermitResponsibility);
              setSaved(false);
            }}
          >
            <option>Owner obtains and pays</option>
            <option>Premium Remodel obtains; owner pays fees</option>
            <option>Premium Remodel obtains and pays</option>
          </select>
        </label>
        <details className={styles.details}>
          <summary>Other contract terms</summary>
          <p>
            These start with your standard defaults. Review and adjust them for
            this project before sending the MSA.
          </p>
          <div className={styles.contractTerms}>
            {contractFields.map(([key, label]) => (
              <label key={key}>
                {label}
                <textarea
                  value={contractTerms[key]}
                  maxLength={15000}
                  rows={3}
                  onChange={(event) =>
                    updateContractTerm(key, event.target.value)
                  }
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            className="button secondary small-button"
            onClick={() => {
              setContractTerms(defaultMsaContractTerms(project, draft.scope));
              setSaved(false);
            }}
          >
            Reset contract defaults
          </button>
        </details>
        <div className={styles.actions}>
          <button
            type="button"
            className="button primary small-button"
            disabled={saving || !validSchedule || !validContractTerms}
            onClick={() => void saveTerms()}
          >
            {saving ? "Saving…" : "Save MSA terms"}
          </button>
          <button
            type="button"
            className="button secondary small-button"
            onClick={() => {
              setSteps(defaultMsaPaymentSchedule(project));
              setSaved(false);
            }}
          >
            Reset payment defaults
          </button>
          {saved && <span role="status">Saved</span>}
        </div>
        {saveError && (
          <p role="alert" className={styles.error}>
            {saveError}
          </p>
        )}
      </div>
      {showSigning && (
        <div className={styles.terms}>
          <h3>Sign and send</h3>
          <>
            {needsHistorical && historical && (
              <div>
                <p>
                  The saved accepted-scope fields need verification. The
                  agreement will use the original client quote snapshot:{" "}
                  {historical.scope.length} items totaling{" "}
                  {projectMoney(historical.price)}.
                </p>
                <ul>
                  {historical.scope.map((item, index) => (
                    <li key={index}>
                      {item.section} · {item.title} —{" "}
                      {projectMoney(item.amount)}
                    </li>
                  ))}
                </ul>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmedHistorical}
                    onChange={(event) =>
                      setConfirmedHistorical(event.target.checked)
                    }
                  />{" "}
                  I checked this scope and price against the accepted quote.
                </label>
              </div>
            )}
            {historicalError && (
              <p role="alert" className={styles.error}>
                {historicalError}
              </p>
            )}
            <p>
              Confirm the legal property owner, then sign as the staff member
              sending the agreement.
            </p>
            {needsQuotedTerms && (
              <p role="alert" className={styles.error}>
                Open Other contract terms and replace the quoted exclusion or
                allowance review prompts with the actual accepted terms before
                sending.
              </p>
            )}
            <div className={styles.contractTerms}>
              <label>
                Legal owner name
                <input
                  value={owner}
                  maxLength={150}
                  onChange={(event) => setOwner(event.target.value)}
                />
              </label>
              <label>
                Owner email
                <input
                  type="email"
                  value={ownerEmail}
                  maxLength={320}
                  onChange={(event) => setOwnerEmail(event.target.value)}
                />
              </label>
              <label>
                Signing staff member
                <input value={signer.name} readOnly />
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
            <p>Staff signature</p>
            <MsaSignaturePad
              onChange={setSignatureStrokes}
              disabled={sending}
            />
            <button
              type="button"
              className="button primary small-button"
              disabled={
                sending ||
                !validSchedule ||
                !validContractTerms ||
                needsQuotedTerms ||
                hasUnsavedTerms ||
                (needsHistorical && (!historical || !confirmedHistorical)) ||
                !owner.trim() ||
                !signerTitle.trim() ||
                !ownerEmail.trim()
              }
              onClick={() => void sendAgreement()}
            >
              {sending ? "Sending…" : "Sign and email MSA"}
            </button>
            {sendError && (
              <p role="alert" className={styles.error}>
                {sendError}
              </p>
            )}
          </>
        </div>
      )}
      <details className={styles.details}>
        <summary>
          Scope for Exhibit B{" "}
          <span>
            {draft.scope.length} items · {draft.scopeSource}
          </span>
        </summary>
        {draft.description && <p>{draft.description}</p>}
        {draft.scope.length ? (
          <ol>
            {draft.scope.map((item, index) => (
              <li key={`${item.section}-${item.title}-${index}`}>
                <strong>{item.title}</strong>
                <span>{item.section}</span>
                {item.details && <p>{item.details}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p>No items are recorded for this project.</p>
        )}
      </details>
    </section>
  );
}
