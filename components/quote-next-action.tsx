import type { ReactNode } from "react";
import {
  Check,
  CircleDollarSign,
  FileSignature,
  FolderKanban,
  Send,
} from "lucide-react";
import type { QuoteWorkflowNextAction } from "@/lib/quote-workflow-state";

const icons = {
  complete_quote: FileSignature,
  add_delivery_contact: FileSignature,
  complete_agreement_details: FileSignature,
  company_approval: FileSignature,
  share_packet: Send,
  collect_signatures: FileSignature,
  collect_payment: CircleDollarSign,
  create_project: FolderKanban,
  complete: Check,
} as const;

export default function QuoteNextAction({
  action,
  primary,
  secondary,
}: {
  action: QuoteWorkflowNextAction;
  primary?: ReactNode;
  secondary?: ReactNode;
}) {
  const Icon = icons[action.id];
  return (
    <section
      className={`quote-next-action is-${action.id}`}
      aria-label="Next required action"
    >
      <span className="quote-next-action-icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <div>
        <span>{action.eyebrow}</span>
        <h2>{action.title}</h2>
        <p>{action.detail}</p>
      </div>
      {(primary || secondary) && (
        <div className="quote-next-action-actions">
          {primary}
          {secondary}
        </div>
      )}
    </section>
  );
}
