import type { ReactNode } from "react";
import { Check, FileSignature, FileText, Hourglass } from "lucide-react";
import {
  summarizeDelivery,
  summarizeSignerProgress,
  type SigningDocumentView,
} from "@/lib/document-signing";

export default function DocumentSigningPanel({
  document,
  step,
  actions,
  children,
  className = "",
}: {
  document: SigningDocumentView;
  step: number;
  actions?: ReactNode;
  children?: ReactNode;
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
            <span
              className={`workflow-document-status is-${document.status.replaceAll("_", "-")}`}
            >
              {document.statusLabel}
            </span>
          </div>
          <p>{document.statusDetail}</p>
        </div>
        {actions && <div className="workflow-document-actions">{actions}</div>}
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
      {children}
    </section>
  );
}
