import type { ReactNode } from "react";
import { Check, FileSignature } from "lucide-react";
import {
  summarizeDelivery,
  type DocumentSigningPacketView,
} from "@/lib/document-signing";
import WorkflowStatusBadge from "./workflow-status-badge";

export default function SigningPacketSummary({
  packet,
  actions,
}: {
  packet: DocumentSigningPacketView;
  actions?: ReactNode;
}) {
  const completed = packet.status === "completed";
  const signed = packet.documents.filter(
    (document) => document.status === "completed",
  ).length;
  const requiredSigners = packet.documents.reduce(
    (total, document) =>
      total + document.signers.filter((signer) => signer.required).length,
    0,
  );
  const signedSigners = packet.documents.reduce(
    (total, document) =>
      total +
      document.signers.filter(
        (signer) => signer.required && signer.status === "signed",
      ).length,
    0,
  );

  return (
    <section
      className={`workflow-signing-packet ${completed ? "is-complete" : ""}`}
      aria-label="Customer packet"
    >
      <div className="workflow-signing-packet-heading">
        <span className="workflow-customer-handoff-icon">
          {completed ? (
            <Check size={18} aria-hidden="true" />
          ) : (
            <FileSignature size={18} aria-hidden="true" />
          )}
        </span>
        <div className="workflow-customer-handoff-copy">
          <span className="project-handoff-eyebrow">Customer packet</span>
          <h3>{packet.statusLabel}</h3>
          <p>
            {packet.statusDetail} Every required document uses the same signing
            session.
          </p>
        </div>
        {actions && (
          <div className="workflow-customer-handoff-actions">{actions}</div>
        )}
      </div>
      <dl className="workflow-signing-packet-facts">
        <div>
          <dt>Documents</dt>
          <dd>
            {signed} of {packet.documents.length} complete
          </dd>
        </div>
        <div>
          <dt>Required signatures</dt>
          <dd>
            {signedSigners} of {requiredSigners} signed
          </dd>
        </div>
        <div>
          <dt>Delivery & access</dt>
          <dd>{summarizeDelivery(packet.delivery)}</dd>
        </div>
      </dl>
      <ul className="workflow-signing-packet-documents">
        {packet.documents.map((document) => (
          <li key={document.id}>
            <span
              className={`workflow-document-step ${document.status === "completed" ? "is-complete" : ""}`}
            >
              {document.status === "completed" ? (
                <Check size={12} aria-hidden="true" />
              ) : (
                document.signers.filter(
                  (signer) => signer.required && signer.status === "signed",
                ).length
              )}
            </span>
            <p>
              <strong>{document.title}</strong>
              <small>{document.statusDetail}</small>
            </p>
            <WorkflowStatusBadge
              status={document.status}
              label={document.statusLabel}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
