"use client";

import type { ReactNode } from "react";
import { useRegionalFormat } from "./regional-format-context";
import {
  Check,
  CircleAlert,
  FileSignature,
  FileText,
  Hourglass,
  MoreHorizontal,
} from "lucide-react";
import {
  summarizeDelivery,
  summarizeSignerProgress,
  type SigningDocumentView,
} from "@/lib/document-signing";
import WorkflowStatusBadge from "./workflow-status-badge";

export default function DocumentSigningPanel({
  document,
  step,
  actions,
  children,
  onEditData,
  secondaryActions,
  className = "",
  compact = false,
}: {
  document: SigningDocumentView;
  step: number;
  actions?: ReactNode;
  children?: ReactNode;
  onEditData?: () => void;
  secondaryActions?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const complete = document.status === "completed";
  const regional = useRegionalFormat();
  const waiting = ["draft", "ready"].includes(document.status);
  const Icon =
    document.kind === "quote" ? FileText : waiting ? Hourglass : FileSignature;

  if (compact) {
    const needsPreparation =
      document.kind !== "quote" &&
      document.signers.some(
        (signer) =>
          signer.partyType === "staff" &&
          signer.required &&
          signer.status !== "signed",
      );
    const label = complete
      ? "Signed"
      : needsPreparation
        ? "Needs preparation"
        : waiting
          ? "Not signed"
          : "Awaiting customer";
    return (
      <section
        className={`quote-document-row ${className}`}
        aria-label={`${document.title} signing status`}
      >
        <header>
          <span className="quote-document-row-icon">
            <Icon size={20} aria-hidden="true" />
          </span>
          <div className="quote-document-row-copy">
            <div>
              <h3>
                {document.kind === "quote"
                  ? document.title
                  : "Service agreement"}
              </h3>
              <WorkflowStatusBadge
                status={
                  complete
                    ? "completed"
                    : needsPreparation
                      ? "draft"
                      : document.status
                }
                label={label}
              />
            </div>
            <p>
              {document.signers
                .filter((signer) => signer.required)
                .map(
                  (signer) =>
                    `${signer.partyType === "staff" ? "Company" : signer.label}: ${signer.status === "signed" ? "signed" : "not signed"}`,
                )
                .join(" · ")}
            </p>
          </div>
          <div className="quote-document-row-actions">
            {secondaryActions}
            {actions}
          </div>
        </header>
        <details className="quote-document-audit">
          <summary>Details & history</summary>
          <dl>
            <div>
              <dt>Version</dt>
              <dd>{document.versionLabel}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>{summarizeDelivery(document.delivery)}</dd>
            </div>
          </dl>
          <ul aria-label="Required signers">
            {document.signers.map((signer) => (
              <li key={signer.roleId}>
                <strong>
                  {signer.label}: {signer.name || "Not assigned"}
                </strong>
                <span>
                  {signer.signedAt ? (
                    <time dateTime={signer.signedAt}>
                      Signed {regional.dateTime(signer.signedAt)}
                    </time>
                  ) : (
                    "Signature pending"
                  )}
                </span>
              </li>
            ))}
          </ul>
          {document.dataBindings?.some(
            (binding) => binding.missing && binding.source === "Contact",
          ) &&
            onEditData && (
              <button
                type="button"
                className="button secondary small-button"
                onClick={onEditData}
              >
                Edit customer details
              </button>
            )}
        </details>
        {children}
      </section>
    );
  }

  return (
    <section
      className={`workflow-completion-panel workflow-document-panel ${complete ? "is-complete" : ""} ${waiting ? "is-waiting" : ""} ${className}`.trim()}
      aria-label={`${document.title} signing status`}
    >
      <header>
        <div className="workflow-document-marker">
          <span
            className={`workflow-document-step ${complete ? "is-complete" : ""}`}
          >
            {complete ? <Check size={14} aria-hidden="true" /> : step}
          </span>
          <span className="workflow-completion-icon">
            <Icon size={18} aria-hidden="true" />
          </span>
        </div>
        <div className="workflow-document-copy">
          <span className="project-handoff-eyebrow">{document.eyebrow}</span>
          <div className="workflow-document-title-row">
            <h3>{document.title}</h3>
            <span className="workflow-document-version">
              {document.versionLabel}
            </span>
            <WorkflowStatusBadge
              status={document.status}
              label={document.statusLabel}
            />
          </div>
          <p>{document.statusDetail}</p>
        </div>
        {(actions || secondaryActions) && (
          <div className="workflow-document-actions">
            {actions}
            {secondaryActions && (
              <details className="workflow-document-menu">
                <summary aria-label={`More actions for ${document.title}`}>
                  <MoreHorizontal size={17} aria-hidden="true" />
                </summary>
                <div>{secondaryActions}</div>
              </details>
            )}
          </div>
        )}
      </header>
      <dl>
        <div>
          <dt>Signer progress</dt>
          <dd>{summarizeSignerProgress(document)}</dd>
        </div>
        <div>
          <dt>Document status</dt>
          <dd>{document.statusLabel}</dd>
        </div>
        <div>
          <dt>Delivery & access</dt>
          <dd>{summarizeDelivery(document.delivery)}</dd>
        </div>
      </dl>
      <div className="workflow-signer-progress" aria-label="Required signers">
        {document.signers.map((signer) => (
          <div key={signer.roleId}>
            <span
              className={`workflow-signer-state is-${signer.status}`}
              aria-hidden="true"
            >
              {signer.status === "signed" ? <Check size={11} /> : signer.order}
            </span>
            <p>
              <strong>{signer.label}</strong>
              <small>{signer.name || "Not assigned"}</small>
            </p>
            <span>{signer.status === "signed" ? "Signed" : "Required"}</span>
          </div>
        ))}
      </div>
      {document.delivery.length > 0 && (
        <details className="workflow-delivery-details">
          <summary>Delivery & access details</summary>
          <div>
            {document.delivery.map((item) => (
              <span key={`${item.channel}:${item.status}`}>
                <strong>{item.label}</strong>
                {item.detail && <small>{item.detail}</small>}
              </span>
            ))}
          </div>
        </details>
      )}
      {document.dataBindings && document.dataBindings.length > 0 && (
        <>
          {document.signers.some((signer) => signer.signedAt) && (
            <details className="workflow-delivery-details">
              <summary>Signature history</summary>
              <div>
                {document.signers
                  .filter((signer) => signer.signedAt)
                  .map((signer) => (
                    <span key={signer.roleId}>
                      <strong>
                        {signer.label}: {signer.name}
                      </strong>
                      <small>
                        <time dateTime={signer.signedAt}>
                          {regional.dateTime(signer.signedAt!)}
                        </time>
                      </small>
                    </span>
                  ))}
              </div>
            </details>
          )}
          <details className="workflow-data-bindings">
            <summary>
              Document data
              {document.dataBindings.some((binding) => binding.missing) && (
                <span>
                  <CircleAlert size={12} aria-hidden="true" /> Missing
                  information
                </span>
              )}
            </summary>
            <div>
              {document.dataBindings.map((binding) => (
                <div
                  key={`${document.id}:${binding.key}`}
                  className={binding.missing ? "is-missing" : ""}
                >
                  <p>
                    <strong>{binding.label}</strong>
                    <small>{binding.source}</small>
                  </p>
                  <span>{binding.value || "Missing"}</span>
                </div>
              ))}
            </div>
            {onEditData &&
              document.dataBindings.some((binding) => binding.missing) && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={onEditData}
                >
                  Edit source information
                </button>
              )}
          </details>
        </>
      )}
      {children}
    </section>
  );
}
