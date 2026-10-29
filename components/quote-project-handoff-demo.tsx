"use client";

import { useState } from "react";
import {
  ArrowRight,
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  CreditCard,
  FileSignature,
  FolderKanban,
  Globe2,
  Landmark,
  ListChecks,
  Mail,
  MessageSquare,
  PenLine,
  Tablet,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { projectMoney } from "@/lib/project-finances";
import type { Quote } from "@/lib/types";

type PreviewStage =
  "quote-signature" | "agreement-signature" | "deposit" | "ready" | "created";
type ActionDialog = "signature" | "deposit" | null;
type ActionMode = "tablet" | "in-person" | "check" | "other" | null;
type WorkflowStep = "quote" | "agreement" | "completion" | "project";

export default function QuoteProjectHandoffDemo({
  quote,
  itemCount,
  fileCount,
  agreementDetails,
}: {
  quote: Quote;
  itemCount: number;
  fileCount: number;
  agreementDetails?: React.ReactNode;
}) {
  const [stage, setStage] = useState<PreviewStage>("quote-signature");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("completion");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [actionDialog, setActionDialog] = useState<ActionDialog>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const completed =
    stage === "quote-signature"
      ? 1
      : stage === "agreement-signature"
        ? 2
        : stage === "deposit"
          ? 3
          : 4;
  const deposit = 8_400;
  const quoteSigned = stage !== "quote-signature";
  const agreementSigned = !["quote-signature", "agreement-signature"].includes(
    stage,
  );
  const depositReceived = stage === "ready";
  const projectItems = (quote.acceptedQuoteScope || []).filter(
    (item) => item.customerVisible !== false,
  );

  const closeActionDialog = () => {
    setActionDialog(null);
    setActionMode(null);
  };

  const completeSignature = () => {
    setStage(stage === "quote-signature" ? "agreement-signature" : "deposit");
    closeActionDialog();
  };

  const completeDeposit = () => {
    setStage("ready");
    setWorkflowStep("project");
    closeActionDialog();
  };

  if (!quote.quoteSentAt) return null;

  const workflow = (
    <QuoteWorkflowStepper
      active={workflowStep}
      stage={stage}
      onSelect={setWorkflowStep}
    />
  );

  if (workflowStep === "quote") {
    return workflow;
  }

  if (workflowStep === "agreement") {
    return (
      <>
        {workflow}
        <AgreementPreparationStep
          quote={quote}
          onContinue={() => setWorkflowStep("completion")}
        />
        {agreementDetails && (
          <div className="workflow-agreement-content">{agreementDetails}</div>
        )}
      </>
    );
  }

  if (stage === "created") {
    return (
      <>
        {workflow}
        <section className="handoff-created-demo" aria-live="polite">
          <span className="handoff-created-icon" aria-hidden="true">
            <Check size={22} />
          </span>
          <div className="handoff-created-copy">
            <span className="project-handoff-eyebrow">Project created</span>
            <h2>{quote.name}</h2>
            <p>
              The signed quote, agreement, deposit, files, and{" "}
              {projectItems.length} quote items are now in Projects. This
              project starts in Planning.
            </p>
          </div>
          <button
            type="button"
            className="handoff-demo-reset"
            onClick={() => {
              setStage("quote-signature");
              setWorkflowStep("completion");
            }}
          >
            Reset demo
          </button>
          <div className="handoff-created-flow">
            <section
              className="handoff-created-items"
              aria-label="Items carried from quote"
            >
              <header>
                <div>
                  <span className="handoff-created-next">Items from quote</span>
                  <h3>Ready to plan</h3>
                </div>
                <strong>{projectItems.length} items</strong>
              </header>
              <ul>
                {projectItems.map((item, index) => (
                  <li key={`${item.section}-${item.title}`}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.section} · Ready to schedule</small>
                    </div>
                    <CheckCircle2 size={16} aria-label="Carried over" />
                  </li>
                ))}
              </ul>
            </section>
            <aside className="handoff-created-plan">
              <span className="handoff-created-next">Continue setup</span>
              <h3>Plan the carried-over items</h3>
              <p>
                Review each item, add dates, and assign the team. Nothing needs
                to be entered again.
              </p>
              <div className="handoff-created-actions">
                <button className="button primary" type="button">
                  <ListChecks size={15} /> Review items
                </button>
                <button className="button secondary" type="button">
                  <CalendarDays size={15} /> Set schedule
                </button>
                <button className="button secondary" type="button">
                  <Users size={15} /> Assign team
                </button>
              </div>
            </aside>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      {workflow}
      <section
        className={`project-handoff-demo${stage === "ready" ? " is-ready" : ""}`}
        aria-labelledby="handoff-demo-title"
      >
        <header className="project-handoff-header">
          <div>
            <span className="project-handoff-eyebrow">
              {workflowStep === "completion"
                ? "Customer completion"
                : "Quote → Project"}
            </span>
            <h2 id="handoff-demo-title">
              {workflowStep === "completion"
                ? "Send & complete"
                : "Project setup"}
            </h2>
            <p>
              {workflowStep === "completion"
                ? "Deliver the quote and agreement through email and the client portal, then track signatures and the deposit in one place."
                : "Review the completed customer commitments and handoff before creating the project."}
            </p>
          </div>
          <div
            className="project-handoff-progress"
            aria-label={`${completed} of 4 setup steps complete`}
          >
            <strong>{completed} of 4 complete</strong>
            <span aria-hidden="true">
              <i style={{ width: `${(completed / 4) * 100}%` }} />
            </span>
          </div>
        </header>
        {workflowStep === "completion" && (
          <section
            className="handoff-communication"
            aria-label="Customer delivery and communication"
          >
            <div>
              <span className="handoff-communication-icon">
                <Mail size={16} aria-hidden="true" />
              </span>
              <div>
                <small>Email delivery</small>
                <strong>Sent to {quote.clientEmail}</strong>
              </div>
              <button type="button" className="text-button">
                Resend
              </button>
            </div>
            <div>
              <span className="handoff-communication-icon">
                <Globe2 size={16} aria-hidden="true" />
              </span>
              <div>
                <small>Client portal</small>
                <strong>Quote and agreement available</strong>
              </div>
              <button type="button" className="text-button">
                Open portal
              </button>
            </div>
            <button type="button" className="button secondary">
              <MessageSquare size={15} /> Customer conversation
            </button>
          </section>
        )}
        <div className="project-handoff-body">
          <section
            className="project-handoff-readiness"
            aria-labelledby="handoff-readiness-title"
          >
            <SectionHeading
              number="1"
              title="Confirm readiness"
              detail="Customer commitments required before work begins."
              id="handoff-readiness-title"
            />
            <ol className="project-handoff-steps">
              <HandoffStep
                icon={<ClipboardCheck size={18} />}
                title="Quote sent"
                detail="Sent to Taylor Reed · Oct 24"
                complete
              />
              <HandoffStep
                icon={<FileSignature size={18} />}
                title="Quote accepted and signed"
                detail={
                  quoteSigned
                    ? "Signed by Taylor Reed · Oct 26"
                    : "Waiting for Taylor Reed"
                }
                complete={quoteSigned}
              />
              <HandoffStep
                icon={<PenLine size={18} />}
                title="Service agreement signed"
                detail={
                  agreementSigned
                    ? "Signed by Taylor Reed and Alex Morgan · Oct 27"
                    : "Customer signature required"
                }
                complete={agreementSigned}
              />
              <HandoffStep
                icon={<WalletCards size={18} />}
                title="Deposit received"
                detail={
                  depositReceived
                    ? `${projectMoney(deposit)} received by check`
                    : `${projectMoney(deposit)} remaining`
                }
                complete={depositReceived}
              />
            </ol>
          </section>

          <aside
            className="project-handoff-transfer"
            aria-labelledby="handoff-transfer-title"
          >
            <SectionHeading
              number="2"
              title="Review handoff"
              detail="Everything below stays with the project."
              id="handoff-transfer-title"
            />
            <dl className="project-handoff-transfer-list">
              <div>
                <dt>Customer</dt>
                <dd>{quote.client}</dd>
              </div>
              <div>
                <dt>Contract</dt>
                <dd>{projectMoney(quote.contractPrice || 0)}</dd>
              </div>
              <div>
                <dt>Items</dt>
                <dd>{itemCount} carried over</dd>
              </div>
              <div>
                <dt>Files</dt>
                <dd>{fileCount || 2} attached</dd>
              </div>
            </dl>
            <div className="project-handoff-destination">
              <FolderKanban size={17} aria-hidden="true" />
              <div>
                <span>Destination</span>
                <strong>Projects · Planning</strong>
              </div>
            </div>
          </aside>
        </div>
        <footer className="project-handoff-footer">
          <SectionHeading
            number="3"
            title={
              stage === "ready"
                ? "Create the project"
                : stage === "deposit"
                  ? "Record the deposit"
                  : stage === "agreement-signature"
                    ? "Complete the service agreement"
                    : "Collect the customer signature"
            }
            detail={
              stage === "ready"
                ? "Review the project name and schedule before the quote leaves Quotes."
                : stage === "deposit"
                  ? "Record an online or in-person payment before work begins."
                  : "Use a remote link, the service tablet, or record an in-person signature."
            }
          />
          {stage === "ready" ? (
            <button
              type="button"
              className="button primary"
              onClick={() => setReviewOpen(true)}
            >
              Review project setup <ArrowRight size={15} />
            </button>
          ) : stage === "deposit" ? (
            <button
              type="button"
              className="button primary"
              onClick={() => setActionDialog("deposit")}
            >
              Deposit options <ArrowRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              className="button primary"
              onClick={() => setActionDialog("signature")}
            >
              Signature options <ArrowRight size={15} />
            </button>
          )}
        </footer>
      </section>

      {reviewOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReviewOpen(false);
          }}
        >
          <form
            className="modal project-handoff-modal"
            aria-label="Create project from quote"
            onSubmit={(event) => {
              event.preventDefault();
              setReviewOpen(false);
              setStage("created");
              setWorkflowStep("project");
            }}
          >
            <header>
              <div>
                <span className="project-handoff-eyebrow">Final review</span>
                <h2>Create project</h2>
                <p>
                  Confirm the project name and initial schedule. Everything
                  already collected stays with this record.
                </p>
              </div>
            </header>
            <div className="project-handoff-modal-body">
              <div className="project-handoff-modal-grid">
                <section>
                  <h3>Project details</h3>
                  <div className="form-fields">
                    <label>
                      Project name
                      <input
                        name="projectName"
                        defaultValue={quote.name}
                        required
                        autoFocus
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        Planned start
                        <input
                          name="startDate"
                          type="date"
                          defaultValue={quote.startDate}
                        />
                      </label>
                      <label>
                        Target completion
                        <input
                          name="endDate"
                          type="date"
                          defaultValue={quote.endDate}
                        />
                      </label>
                    </div>
                  </div>
                </section>
                <aside>
                  <h3>Handoff summary</h3>
                  <dl className="project-handoff-summary">
                    <div>
                      <dt>Customer</dt>
                      <dd>{quote.client}</dd>
                    </div>
                    <div>
                      <dt>Address</dt>
                      <dd>{quote.address}</dd>
                    </div>
                    <div>
                      <dt>Contract</dt>
                      <dd>{projectMoney(quote.contractPrice || 0)}</dd>
                    </div>
                    <div>
                      <dt>Moves with it</dt>
                      <dd>
                        {itemCount} items · {fileCount || 2} files
                      </dd>
                    </div>
                  </dl>
                  <div className="project-handoff-note">
                    <FolderKanban size={18} aria-hidden="true" />
                    <p>
                      Starts in <strong>Planning</strong> and opens in Projects
                      immediately.
                    </p>
                  </div>
                </aside>
              </div>
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setReviewOpen(false)}
              >
                Keep as quote
              </button>
              <button type="submit" className="button primary">
                <Check size={16} /> Create project
              </button>
            </footer>
          </form>
        </div>
      )}

      {actionDialog && (
        <HandoffActionDialog
          kind={actionDialog}
          mode={actionMode}
          signatureSubject={
            stage === "quote-signature" ? "quote" : "service agreement"
          }
          customer={quote.client}
          deposit={deposit}
          onModeChange={setActionMode}
          onClose={closeActionDialog}
          onComplete={
            actionDialog === "signature" ? completeSignature : completeDeposit
          }
        />
      )}
    </>
  );
}

function QuoteWorkflowStepper({
  active,
  stage,
  onSelect,
}: {
  active: WorkflowStep;
  stage: PreviewStage;
  onSelect: (step: WorkflowStep) => void;
}) {
  const completionFinished = stage === "ready" || stage === "created";
  const steps: Array<{
    id: WorkflowStep;
    title: string;
    detail: string;
    complete: boolean;
    disabled?: boolean;
  }> = [
    {
      id: "quote",
      title: "Quote & pricing",
      detail: "Customer, items, costs, and price",
      complete: true,
    },
    {
      id: "agreement",
      title: "Agreement details",
      detail: "Dates, payments, parties, and terms",
      complete: true,
    },
    {
      id: "completion",
      title: "Send & complete",
      detail: "Email, portal, signatures, and deposit",
      complete: completionFinished,
    },
    {
      id: "project",
      title: "Create project",
      detail: "Carry the accepted items into Planning",
      complete: stage === "created",
      disabled: !completionFinished,
    },
  ];

  return (
    <nav className="quote-workflow-stepper" aria-label="Quote workflow">
      <header>
        <span>Quote workflow</span>
        <strong>One record from estimate to project</strong>
      </header>
      <ol>
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={`${active === step.id ? "is-active" : ""}${step.complete ? " is-complete" : ""}`}
          >
            <button
              type="button"
              disabled={step.disabled}
              aria-current={active === step.id ? "step" : undefined}
              onClick={() => onSelect(step.id)}
            >
              <span aria-hidden="true">
                {step.complete ? <Check size={13} /> : index + 1}
              </span>
              <div>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </div>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function AgreementPreparationStep({
  quote,
  onContinue,
}: {
  quote: Quote;
  onContinue: () => void;
}) {
  const agreement = quote.msaAgreement;

  return (
    <section className="workflow-preparation-step">
      <header>
        <div>
          <span className="project-handoff-eyebrow">Step 2 · Complete</span>
          <h2>Agreement details</h2>
          <p>
            Use the approved quote to prepare the service agreement without
            re-entering the customer or items.
          </p>
        </div>
        <span className="workflow-step-complete">
          <CheckCircle2 size={15} /> Ready
        </span>
      </header>

      <div className="workflow-agreement-review">
        <dl>
          <div>
            <dt>Project dates</dt>
            <dd>Start and target completion included</dd>
          </div>
          <div>
            <dt>Payment schedule</dt>
            <dd>
              {agreement?.paymentSchedule.length || 4} milestones · 20% deposit
            </dd>
          </div>
          <div>
            <dt>Signing parties</dt>
            <dd>{quote.client} and company representative</dd>
          </div>
        </dl>
        <div className="workflow-agreement-terms">
          <span>Included in the agreement</span>
          <ul>
            <li>
              <Check size={13} /> Approved quote items and customer price
            </li>
            <li>
              <Check size={13} /> Exclusions, allowances, and site access
            </li>
            <li>
              <Check size={13} /> Permit responsibility and payment terms
            </li>
          </ul>
        </div>
      </div>

      <footer>
        <p>The agreement is packaged with the quote for one customer review.</p>
        <button type="button" className="button primary" onClick={onContinue}>
          Continue to send & complete
          <ArrowRight size={15} />
        </button>
      </footer>
    </section>
  );
}

function HandoffActionDialog({
  kind,
  mode,
  signatureSubject,
  customer,
  deposit,
  onModeChange,
  onClose,
  onComplete,
}: {
  kind: Exclude<ActionDialog, null>;
  mode: ActionMode;
  signatureSubject: "quote" | "service agreement";
  customer: string;
  deposit: number;
  onModeChange: (mode: ActionMode) => void;
  onClose: () => void;
  onComplete: () => void;
}) {
  const signature = kind === "signature";
  const title = signature
    ? `Complete ${signatureSubject} signature`
    : "Record customer deposit";

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="modal project-handoff-action-modal"
        aria-label={title}
        onSubmit={(event) => {
          event.preventDefault();
          onComplete();
        }}
      >
        <header className="handoff-action-header">
          <div>
            <span className="project-handoff-eyebrow">
              {signature ? "Customer signature" : "Deposit received"}
            </span>
            <h2>{title}</h2>
            <p>
              {signature
                ? "Choose how the customer is signing today."
                : "Choose how the deposit was collected."}
            </p>
          </div>
          <button
            type="button"
            className="handoff-action-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="handoff-action-body">
          {!mode && signature && (
            <div className="handoff-action-choices">
              <ActionChoice
                icon={<Mail size={20} />}
                title="Send signing link"
                detail="Customer signs from their own phone or computer."
              />
              <ActionChoice
                icon={<Tablet size={20} />}
                title="Sign on service tablet"
                detail="Hand the tablet to the customer and capture the signature now."
                onClick={() => onModeChange("tablet")}
                primary
              />
              <ActionChoice
                icon={<PenLine size={20} />}
                title="Mark signed in person"
                detail="Use when a paper copy or another in-person signature was collected."
                onClick={() => onModeChange("in-person")}
              />
            </div>
          )}

          {!mode && !signature && (
            <div className="handoff-action-choices">
              <ActionChoice
                icon={<CreditCard size={20} />}
                title="Send payment link"
                detail="Customer pays online by the configured payment method."
              />
              <ActionChoice
                icon={<Banknote size={20} />}
                title="Record check"
                detail="Save the check number, amount, and received date."
                onClick={() => onModeChange("check")}
                primary
              />
              <ActionChoice
                icon={<Landmark size={20} />}
                title="Record another payment"
                detail="Cash, bank transfer, or another offline method."
                onClick={() => onModeChange("other")}
              />
            </div>
          )}

          {mode === "tablet" && (
            <div className="handoff-action-form">
              <div className="handoff-mode-intro">
                <Tablet size={20} />
                <div>
                  <strong>Service tablet signature</strong>
                  <span>Ask {customer} to review and sign below.</span>
                </div>
              </div>
              <label>
                Signed by
                <input defaultValue={customer} required />
              </label>
              <div
                className="handoff-signature-pad"
                role="img"
                aria-label="Signature pad"
              >
                <span>Sign here</span>
                <i />
              </div>
              <label className="handoff-confirmation-check">
                <input type="checkbox" required />
                Customer reviewed the {signatureSubject} before signing.
              </label>
            </div>
          )}

          {mode === "in-person" && (
            <div className="handoff-action-form">
              <div className="handoff-mode-intro">
                <PenLine size={20} />
                <div>
                  <strong>In-person signature</strong>
                  <span>
                    Record who signed and where the signed copy is stored.
                  </span>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  Signed by
                  <input defaultValue={customer} required />
                </label>
                <label>
                  Date signed
                  <input type="date" defaultValue="2026-10-29" required />
                </label>
              </div>
              <label>
                Documentation
                <select defaultValue="paper-copy">
                  <option value="paper-copy">Paper copy retained</option>
                  <option value="customer-copy">
                    Customer retained the original
                  </option>
                  <option value="uploaded-copy">Signed copy uploaded</option>
                </select>
              </label>
              <label>
                Note
                <textarea placeholder="Optional signature note" />
              </label>
            </div>
          )}

          {mode === "check" && (
            <div className="handoff-action-form">
              <div className="handoff-mode-intro">
                <Banknote size={20} />
                <div>
                  <strong>Check deposit</strong>
                  <span>
                    Record the physical check before starting the project.
                  </span>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  Amount received
                  <input type="number" defaultValue={deposit} required />
                </label>
                <label>
                  Check number
                  <input placeholder="e.g. 1842" required />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Received from
                  <input defaultValue={customer} required />
                </label>
                <label>
                  Date received
                  <input type="date" defaultValue="2026-10-29" required />
                </label>
              </div>
            </div>
          )}

          {mode === "other" && (
            <div className="handoff-action-form">
              <div className="handoff-mode-intro">
                <Landmark size={20} />
                <div>
                  <strong>Offline deposit</strong>
                  <span>Record another payment method and its reference.</span>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  Payment method
                  <select defaultValue="bank-transfer">
                    <option value="bank-transfer">Bank transfer</option>
                    <option value="cash">Cash</option>
                    <option value="money-order">Money order</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  Amount received
                  <input type="number" defaultValue={deposit} required />
                </label>
              </div>
              <label>
                Reference or note
                <input placeholder="Transaction reference or receipt note" />
              </label>
            </div>
          )}
        </div>

        <footer className="modal-footer">
          <button
            type="button"
            className="button secondary"
            onClick={() => (mode ? onModeChange(null) : onClose())}
          >
            {mode ? "Back" : "Cancel"}
          </button>
          {mode && (
            <button type="submit" className="button primary">
              <Check size={16} />
              {signature ? "Save signature" : "Record deposit"}
            </button>
          )}
        </footer>
      </form>
    </div>
  );
}

function ActionChoice({
  icon,
  title,
  detail,
  onClick,
  primary = false,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick?: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={`handoff-action-choice${primary ? " is-primary" : ""}`}
      onClick={onClick}
    >
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <ArrowRight size={16} aria-hidden="true" />
    </button>
  );
}

function SectionHeading({
  number,
  title,
  detail,
  id,
}: {
  number: string;
  title: string;
  detail: string;
  id?: string;
}) {
  return (
    <div className="project-handoff-section-heading">
      <span aria-hidden="true">{number}</span>
      <div>
        <strong id={id}>{title}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function HandoffStep({
  icon,
  title,
  detail,
  complete,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  complete: boolean;
}) {
  return (
    <li className={complete ? "is-complete" : ""}>
      <span className="project-handoff-step-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <span className="project-handoff-step-state">
        {complete ? (
          <>
            <CheckCircle2 size={15} /> Complete
          </>
        ) : (
          <>
            <Circle size={14} /> Waiting
          </>
        )}
      </span>
    </li>
  );
}
