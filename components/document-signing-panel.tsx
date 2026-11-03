import type { ReactNode } from "react";
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
}: {
  document: SigningDocumentView;
  step: number;
  actions?: ReactNode;
  children?: ReactNode;
  onEditData?: () => void;
  secondaryActions?: ReactNode;
  className?: string;
}) {
  const complete = document.status === "completed";
  const waiting = ["draft", "ready"].includes(document.status);
  const Icon =
    document.kind === "quote" ? FileText : waiting ? Hourglass : FileSignature;

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
        <details className="workflow-data-bindings">
          <summary>
            Document data
            {document.dataBindings.some((binding) => binding.missing) && (
              <span>
                <CircleAlert size={12} aria-hidden="true" /> Missing information
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
      )}
      {children}
    </section>
  );
}
