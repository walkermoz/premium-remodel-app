"use client";
import { useState } from "react";
import {
  CheckCircle2,
  ArrowRight,
  Plus,
  FileText,
  CalendarDays,
  Pencil,
  Presentation,
} from "lucide-react";
import { Modal } from "./ui";
import {
  jobOperations,
  closeoutIssues,
  formTemplates,
  invoiceDocument,
  authorizationDocument,
  estimateBookingIssue,
  type JobAction,
  type JobForm,
} from "@/lib/job-operations";
import { scopeTotal, projectFinances } from "@/lib/project-finances";
import type { JobSection } from "@/lib/job-workspace";
import type { Project, Quote, Workspace } from "@/lib/types";
import { useRegionalFormat } from "./regional-format-context";
import ProjectPayments from "./project-payments";
import styles from "./job-workspace.module.css";

export type JobOperationInput =
  JobAction | { action: "book-estimate"; quoteId: string };
type Operate = (action: JobOperationInput) => Promise<void>;
function useOperation(onAction: Operate) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return {
    busy,
    error,
    run: async (action: JobOperationInput) => {
      if (busy) return false;
      setBusy(true);
      setError("");
      try {
        await onAction(action);
        return true;
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "Could not save changes.",
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}
function Failure({ message }: { message: string }) {
  return message ? (
    <p className="alert" role="alert">
      {message}
    </p>
  ) : null;
}

export function JobForms({
  project,
  onAction,
  onAgreement,
}: {
  project: Project;
  onAction: Operate;
  onAgreement: () => void;
}) {
  const operation = useOperation(onAction);
  const [selected, setSelected] = useState("");
  const [adding, setAdding] = useState(false);
  const [template, setTemplate] =
    useState<keyof typeof formTemplates>("arrival");
  const [required, setRequired] = useState(false);
  const forms = jobOperations(project).forms;
  const form = forms.find((item) => item.id === selected);
  return (
    <section aria-label="Job forms">
      <header className={styles.sectionHeading}>
        <div>
          <h2>Forms</h2>
          <p>Required forms must be completed before job closeout.</p>
        </div>
        <button
          className="button primary"
          onClick={() => setAdding(true)}
          disabled={project.status === "Completed"}
        >
          <Plus size={16} /> Add form
        </button>
      </header>
      <Failure message={operation.error} />
      <div className={styles.reviewList}>
        {forms.map((item) => (
          <button
            className={styles.sectionLink}
            onClick={() => setSelected(item.id)}
            key={item.id}
          >
            <span>
              <strong>
                {item.title} {item.required && <small>Required</small>}
              </strong>
              <small>
                {item.completedAt
                  ? `Completed by ${item.completedBy}`
                  : "Job checklist"}
              </small>
            </span>
            <span>
              {item.status}
              <ArrowRight size={16} />
            </span>
          </button>
        ))}
      </div>
      {!forms.length && (
        <p className={styles.emptyLine}>
          No forms assigned. Add a checklist or selections form for this job.
        </p>
      )}
      <button className="button secondary" onClick={onAgreement}>
        <FileText size={16} /> Services agreement & signatures
      </button>
      {adding && (
        <Modal title="Add job form" onClose={() => setAdding(false)}>
          <form
            className={styles.operationalForm}
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await operation.run({ action: "add-form", template, required })
              )
                setAdding(false);
            }}
          >
            <label>
              Form
              <select
                value={template}
                onChange={(event) =>
                  setTemplate(event.target.value as keyof typeof formTemplates)
                }
              >
                {Object.entries(formTemplates).map(([id, item]) => (
                  <option key={id} value={id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={required}
                onChange={(event) => setRequired(event.target.checked)}
              />{" "}
              Required before closeout
            </label>
            <Failure message={operation.error} />
            <button className="button primary" disabled={operation.busy}>
              Add form
            </button>
          </form>
        </Modal>
      )}
      {form && (
        <JobFormEditor
          key={form.id}
          form={form}
          readOnly={project.status === "Completed"}
          onAction={onAction}
          onClose={() => setSelected("")}
        />
      )}
    </section>
  );
}
function JobFormEditor({
  form,
  readOnly,
  onAction,
  onClose,
}: {
  form: JobForm;
  readOnly: boolean;
  onAction: Operate;
  onClose: () => void;
}) {
  const operation = useOperation(onAction);
  const [answers, setAnswers] = useState(
    Object.fromEntries(form.questions.map((item) => [item.id, item.answer])),
  );
  const locked = readOnly || form.status === "Complete";
  return (
    <Modal
      title={form.title}
      subtitle={`${form.required ? "Required · " : ""}${form.status}`}
      onClose={onClose}
    >
      <form
        className={styles.operationalForm}
        onSubmit={async (event) => {
          event.preventDefault();
          if (
            await operation.run({
              action: "save-form",
              formId: form.id,
              answers,
              complete: true,
            })
          )
            onClose();
        }}
      >
        {form.questions.map((question) => (
          <label key={question.id}>
            {question.label}
            {question.required && " *"}
            <textarea
              rows={3}
              required={question.required}
              readOnly={locked}
              value={answers[question.id]}
              onChange={(event) =>
                setAnswers({ ...answers, [question.id]: event.target.value })
              }
            />
          </label>
        ))}
        {form.completedAt && (
          <p>
            Submitted by {form.completedBy} on{" "}
            {new Date(form.completedAt).toLocaleString()}.
          </p>
        )}
        <Failure message={operation.error} />
        {!locked && (
          <div className={styles.recordActions}>
            <button
              type="button"
              className="button secondary"
              disabled={operation.busy}
              onClick={async () => {
                if (
                  await operation.run({
                    action: "save-form",
                    formId: form.id,
                    answers,
                    complete: false,
                  })
                )
                  onClose();
              }}
            >
              Save draft
            </button>
            <button className="button primary" disabled={operation.busy}>
              Complete form
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}

export function JobEstimates({
  project,
  workspace,
  onNew,
  onOpen,
  onSave,
  onAction,
  canEdit,
}: {
  project: Project;
  workspace: Workspace;
  onNew: () => void;
  onOpen: (id: string) => void;
  onSave: (quote: Quote, data: Record<string, unknown>) => Promise<void>;
  onAction: Operate;
  canEdit: boolean;
}) {
  const regional = useRegionalFormat();
  const operation = useOperation(onAction);
  const [presenting, setPresenting] = useState(false);
  const options = (workspace.quotes || []).filter(
    (quote) => quote.jobId === project.id && !quote.junkedAt,
  );
  const [filter, setFilter] = useState("All");
  const [error, setError] = useState("");
  const display = options.filter(
    (quote) =>
      filter === "All" ||
      (filter === "Sold"
        ? quote.status === "Accepted"
        : !["Accepted", "Declined", "Expired"].includes(quote.status)),
  );
  return (
    <section aria-label="Job estimates">
      <header className={styles.sectionHeading}>
        <div>
          <h2>Estimates</h2>
          <p>
            Build and present options for this job. Only booked work appears on
            the invoice.
          </p>
        </div>
        <div className={styles.recordActions}>
          <button
            className="button secondary"
            disabled={!options.length}
            onClick={() => setPresenting(true)}
          >
            <Presentation size={16} /> Present
          </button>
          {canEdit && (
            <button
              className="button primary"
              onClick={onNew}
              disabled={project.status === "Completed"}
            >
              <Plus size={16} /> Add estimate
            </button>
          )}
        </div>
      </header>
      <div className={styles.filters}>
        {["All", "Open", "Sold"].map((item) => (
          <button
            key={item}
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <Failure message={operation.error || error} />
      <div className={styles.estimateOptions}>
        {display.map((quote) => (
          <article className={styles.option} key={quote.id}>
            <header>
              <small>ESTIMATE #{quote.quoteNumber}</small>
              <span>
                {quote.bookedJobId
                  ? "Sold · Booked"
                  : quote.status === "Accepted"
                    ? "Sold · Unbooked"
                    : quote.status}
              </span>
            </header>
            <h3>{quote.name}</h3>
            <p>{quote.description}</p>
            <strong className={styles.optionPrice}>
              {regional.money(scopeTotal(workspace.scope, quote.id))}
            </strong>
            <p>
              {
                workspace.scope.filter((item) => item.projectId === quote.id)
                  .length
              }{" "}
              items
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={Boolean(quote.recommended)}
                disabled={!canEdit || quote.status === "Accepted"}
                onChange={async (event) => {
                  setError("");
                  try {
                    await onSave(quote, {
                      ...quote,
                      recommended: event.target.checked,
                    });
                  } catch (error) {
                    setError(
                      error instanceof Error
                        ? error.message
                        : "Could not save recommendation.",
                    );
                  }
                }}
              />{" "}
              Recommend
            </label>
            <footer>
              {canEdit && quote.status !== "Accepted" && !quote.bookedJobId && (
                <button
                  className="button secondary"
                  onClick={async () => {
                    setError("");
                    try {
                      await onSave(quote, {
                        ...quote,
                        junkedAt: new Date().toISOString(),
                      });
                    } catch (error) {
                      setError(
                        error instanceof Error
                          ? error.message
                          : "Could not remove this estimate.",
                      );
                    }
                  }}
                >
                  Remove estimate
                </button>
              )}
              <button
                className="button secondary"
                onClick={() => onOpen(quote.id)}
              >
                <Pencil size={15} />
                {quote.status === "Accepted"
                  ? "View signed estimate"
                  : "Edit & authorize"}
              </button>
              {quote.status === "Accepted" && !quote.bookedJobId && canEdit && (
                <button
                  className="button primary"
                  disabled={
                    operation.busy ||
                    Boolean(estimateBookingIssue(quote, workspace))
                  }
                  onClick={() =>
                    void operation.run({
                      action: "book-estimate",
                      quoteId: quote.id,
                    })
                  }
                >
                  Book to this job
                </button>
              )}
            </footer>
            {quote.status === "Accepted" && !quote.bookedJobId && (
              <p className={styles.emptyLine}>
                {estimateBookingIssue(quote, workspace) ||
                  "Ready to book: signed scope will be copied to this job invoice."}
              </p>
            )}
          </article>
        ))}
      </div>
      {!display.length && (
        <p className={styles.emptyLine}>
          No {filter === "All" ? "" : filter.toLowerCase()} estimate options on
          this job.
        </p>
      )}
      {project.acceptedQuoteScope?.length && !options.length ? (
        <p className={styles.emptyLine}>
          This legacy job already contains accepted work. It remains on the
          invoice; new options can be added here.
        </p>
      ) : null}
      {presenting && (
        <Modal
          title="Estimate options"
          subtitle={`${project.client} · ${project.address}`}
          onClose={() => setPresenting(false)}
        >
          <div className={styles.presentation}>
            {options.map((quote) => (
              <article key={quote.id}>
                <small>
                  {quote.recommended
                    ? "RECOMMENDED"
                    : `OPTION #${quote.quoteNumber}`}
                </small>
                <h2>{quote.name}</h2>
                <strong className={styles.optionPrice}>
                  {regional.money(scopeTotal(workspace.scope, quote.id))}
                </strong>
                <p>{quote.description}</p>
                <ul>
                  {workspace.scope
                    .filter(
                      (item) =>
                        item.projectId === quote.id &&
                        item.customerVisible !== false,
                    )
                    .map((item) => (
                      <li key={item.id}>
                        <strong>{item.title}</strong>
                        <p>{item.details}</p>
                      </li>
                    ))}
                </ul>
                <button
                  className="button primary"
                  onClick={() => {
                    setPresenting(false);
                    onOpen(quote.id);
                  }}
                >
                  Review & authorize this option
                </button>
              </article>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}

export function JobInvoice({
  project,
  workspace,
  onAction,
  onSection,
  onEditItems,
  onPayment,
  onEstimate,
  demo,
  admin,
}: {
  project: Project;
  workspace: Workspace;
  onAction: Operate;
  onSection: (section: JobSection) => void;
  onEditItems: () => void;
  onPayment: (id: string) => void;
  onEstimate: (id: string) => void;
  demo: boolean;
  admin: boolean;
}) {
  const regional = useRegionalFormat();
  const operation = useOperation(onAction);
  const invoice = jobOperations(project).invoice;
  const [summary, setSummary] = useState(invoice.summary);
  const [terms, setTerms] = useState(invoice.paymentTerms);
  const [notes, setNotes] = useState(invoice.paymentNotes);
  const [signing, setSigning] = useState(false);
  const [signatureKind, setSignatureKind] = useState<
    "authorization" | "completion"
  >("completion");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const forms = jobOperations(project).forms.filter((form) => form.required);
  const finances = projectFinances(
    project,
    workspace.scope,
    workspace.activities,
  );
  const sold = (workspace.quotes || []).filter(
    (quote) =>
      quote.jobId === project.id &&
      quote.status === "Accepted" &&
      !quote.bookedJobId,
  );
  const locked =
    invoice.status === "Finalized" || project.status === "Completed";
  const save = () =>
    operation.run({
      action: "invoice",
      summary,
      paymentTerms: terms,
      paymentNotes: notes,
    });
  const acknowledgementCurrent =
    invoice.acknowledgement?.document ===
    invoiceDocument(project, workspace.scope);
  const authorizationCurrent =
    invoice.authorization?.document ===
    authorizationDocument(project, workspace.scope);
  const signatureCurrent =
    signatureKind === "authorization"
      ? authorizationCurrent
      : acknowledgementCurrent;
  const signatureRecord =
    signatureKind === "authorization"
      ? invoice.authorization
      : invoice.acknowledgement;
  return (
    <section aria-label="Job invoice">
      <header className={styles.invoiceToolbar}>
        <div>
          <h2>
            Invoice #
            {project.quoteNumber || project.id.slice(0, 8).toUpperCase()}
          </h2>
          <p>
            {invoice.status} · {project.client}
          </p>
        </div>
        <div>
          <button
            className="button primary"
            onClick={() => onPayment(project.id)}
          >
            Pay / record payment
          </button>
          <button
            className="button secondary"
            disabled={
              (acknowledgementCurrent &&
                (authorizationCurrent || finances.total === 0)) ||
              project.status === "Completed"
            }
            onClick={() => {
              setSignatureKind(
                !authorizationCurrent && finances.total > 0
                  ? "authorization"
                  : "completion",
              );
              setSigning(true);
            }}
          >
            Sign
          </button>
          <button
            className="button secondary"
            onClick={() => onSection("Closeout")}
          >
            Closeout
          </button>
        </div>
      </header>
      <Failure message={operation.error} />
      {Boolean(finances.legacyDifference) && (
        <p className="scope-price-warning">
          Current scope is {regional.money(Math.abs(finances.legacyDifference))}{" "}
          {finances.legacyDifference < 0 ? "below" : "above"} the previous
          contract amount of {regional.money(project.contractPrice || 0)}.
          Review any agreed changes before finalizing the invoice.
        </p>
      )}
      <div className={styles.reviewList}>
        {finances.total > 0 && (
          <button
            className={styles.sectionLink}
            disabled={project.status === "Completed"}
            onClick={() => {
              setSignatureKind("authorization");
              setSigning(true);
            }}
          >
            <span>
              <strong>Customer work authorization</strong>
              <small>
                {authorizationCurrent
                  ? `Signed by ${invoice.authorization!.name}`
                  : "Required for billable work"}
              </small>
            </span>
            <ArrowRight size={16} />
          </button>
        )}
        <button
          className={styles.sectionLink}
          onClick={() => onSection("Forms")}
        >
          <span>
            <strong>Required forms</strong>
            <small>
              {forms.filter((form) => form.status === "Complete").length} of{" "}
              {forms.length} complete
            </small>
          </span>
          <ArrowRight size={16} />
        </button>
        <button
          className={styles.sectionLink}
          onClick={() => {
            setSignatureKind("completion");
            setSigning(true);
          }}
          disabled={!locked || project.status === "Completed"}
        >
          <span>
            <strong>Customer invoice acknowledgement</strong>
            <small>
              {acknowledgementCurrent
                ? `Signed by ${invoice.acknowledgement!.name}`
                : "Required after invoice finalization"}
            </small>
          </span>
          <ArrowRight size={16} />
        </button>
      </div>
      <ProjectPayments
        project={project}
        workspace={workspace}
        demo={demo}
        onLog={() => onPayment(project.id)}
        canCreateCardLink={admin && !demo}
      />
      {sold.map((quote) => (
        <div key={quote.id} className={styles.reviewRow}>
          <div>
            <h3>Sold estimate #{quote.quoteNumber} · awaiting booking</h3>
            <p>
              {estimateBookingIssue(quote, workspace) ||
                "Ready to book to this invoice"}
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => onPayment(quote.id)}
          >
            Record estimate deposit
          </button>
          <button
            className="button secondary"
            onClick={() => onEstimate(quote.id)}
          >
            View estimate
          </button>
        </div>
      ))}
      <form
        className={styles.operationalForm}
        onSubmit={async (event) => {
          event.preventDefault();
          await save();
        }}
      >
        <label>
          Invoice summary · work performed
          <textarea
            required
            rows={4}
            readOnly={locked}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>
        <div className={styles.formColumns}>
          <label>
            Payment terms
            <select
              aria-label="Payment terms"
              value={terms}
              disabled={locked}
              onChange={(event) => setTerms(event.target.value as typeof terms)}
            >
              <option>Collect now</option>
              <option>On account</option>
            </select>
          </label>
          <label>
            Payment / account notes
            <textarea
              readOnly={locked}
              required={terms === "On account" && finances.remaining > 0}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>
        {!locked && (
          <div className={styles.recordActions}>
            <button className="button secondary" disabled={operation.busy}>
              Save invoice
            </button>
            <button
              type="button"
              className="button primary"
              disabled={operation.busy || !summary.trim()}
              onClick={async () => {
                if (await save()) await operation.run({ action: "finalize" });
              }}
            >
              Finalize invoice
            </button>
          </div>
        )}
        {locked && project.status !== "Completed" && (
          <button
            type="button"
            className="button secondary"
            disabled={operation.busy}
            onClick={() => void operation.run({ action: "reopen" })}
          >
            Reopen invoice for editing
          </button>
        )}
      </form>
      <header className={styles.sectionHeading}>
        <h3>Invoice items</h3>
        <button
          className="button secondary"
          disabled={locked}
          onClick={onEditItems}
        >
          Edit invoice items
        </button>
      </header>
      <div className={styles.readonlyScope}>
        {workspace.scope
          .filter(
            (item) =>
              item.projectId === project.id && item.customerVisible !== false,
          )
          .map((item) => (
            <div key={item.id}>
              <span>
                <strong>{item.title}</strong>
                <p>{item.details}</p>
              </span>
              <b>{regional.money(item.estimate)}</b>
            </div>
          ))}
        <div>
          <strong>Invoice total</strong>
          <b>{regional.money(finances.total)}</b>
        </div>
      </div>
      {signing && (
        <Modal
          title={
            signatureKind === "authorization"
              ? "Customer work authorization"
              : "Customer invoice acknowledgement"
          }
          onClose={() => setSigning(false)}
        >
          <form
            className={styles.operationalForm}
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await operation.run({
                  action: "acknowledge",
                  signatureKind,
                  name,
                  consent: true,
                  document:
                    signatureKind === "authorization"
                      ? authorizationDocument(project, workspace.scope)
                      : invoiceDocument(project, workspace.scope),
                })
              ) {
                setSigning(false);
                setName("");
                setConsent(false);
              }
            }}
          >
            <p>
              {project.client} · {project.address}
            </p>
            <p>{invoice.summary}</p>
            <ul>
              {workspace.scope
                .filter(
                  (item) =>
                    item.projectId === project.id &&
                    item.customerVisible !== false,
                )
                .map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong> ·{" "}
                    {regional.money(item.estimate)}
                    <p>{item.details}</p>
                  </li>
                ))}
            </ul>
            <strong>
              Total {regional.money(finances.total)} · Remaining{" "}
              {regional.money(finances.remaining)}
            </strong>
            {signatureCurrent ? (
              <p>
                Signed by {signatureRecord!.name} on{" "}
                {regional.date(signatureRecord!.at)}. Captured by{" "}
                {signatureRecord!.capturedBy}.
              </p>
            ) : (
              <>
                <label>
                  Customer printed signature
                  <input
                    required
                    minLength={2}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />{" "}
                  {signatureKind === "authorization"
                    ? "I am the customer or authorized representative. I authorize the listed work at the price shown and agree to use my typed name as my electronic signature."
                    : "I am the customer or authorized representative. I acknowledge the completed work and invoice shown and agree to use my typed name as my electronic signature."}
                </label>
                <Failure message={operation.error} />
                <button
                  className="button primary"
                  disabled={
                    operation.busy ||
                    !consent ||
                    (signatureKind === "completion" && !locked)
                  }
                >
                  Sign invoice
                </button>
              </>
            )}
          </form>
        </Modal>
      )}
    </section>
  );
}

export function JobAppointments({
  project,
  onAction,
}: {
  project: Project;
  onAction: Operate;
}) {
  const regional = useRegionalFormat();
  const operation = useOperation(onAction);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    date: "",
    start: "09:00",
    end: "10:00",
    technician: "",
  });
  const appointments = jobOperations(project).appointments;
  const [canceling, setCanceling] = useState("");
  const [reason, setReason] = useState("");
  return (
    <section aria-label="Job appointments">
      <header className={styles.sectionHeading}>
        <div>
          <h2>Appointments</h2>
          <p>
            A job can have multiple visits. Complete each visit before closing
            the job.
          </p>
        </div>
        <button
          className="button primary"
          disabled={project.status === "Completed"}
          onClick={() => setAdding(true)}
        >
          <CalendarDays size={16} /> Add appointment
        </button>
      </header>
      <Failure message={operation.error} />
      {appointments.map((appointment) => (
        <article className={styles.reviewRow} key={appointment.id}>
          <div>
            <h3>{appointment.title}</h3>
            <p>
              {regional.date(appointment.date)} · {appointment.start}–
              {appointment.end} · {appointment.technician}
            </p>
            <strong>{appointment.status}</strong>
            {appointment.cancellationReason && (
              <p>{appointment.cancellationReason}</p>
            )}
          </div>
          <div className={styles.recordActions}>
            {["Scheduled", "Dispatched", "Paused"].includes(
              appointment.status,
            ) && (
              <button
                className="button secondary"
                disabled={operation.busy}
                onClick={() => {
                  setCanceling(appointment.id);
                  setReason("");
                }}
              >
                Cancel appointment
              </button>
            )}
            {(appointment.status === "Scheduled" ||
              appointment.status === "Paused") && (
              <button
                className="button secondary"
                disabled={operation.busy}
                onClick={() =>
                  void operation.run({
                    action: "appointment",
                    appointmentId: appointment.id,
                    status: "Dispatched",
                  })
                }
              >
                Dispatch
              </button>
            )}
            {appointment.status === "Dispatched" && (
              <button
                className="button primary"
                disabled={operation.busy}
                onClick={() =>
                  void operation.run({
                    action: "appointment",
                    appointmentId: appointment.id,
                    status: "Arrived",
                  })
                }
              >
                Arrive
              </button>
            )}
            {appointment.status === "Arrived" && (
              <>
                <button
                  className="button secondary"
                  disabled={operation.busy}
                  onClick={() =>
                    void operation.run({
                      action: "appointment",
                      appointmentId: appointment.id,
                      status: "Paused",
                    })
                  }
                >
                  Pause appointment
                </button>
                <button
                  className="button primary"
                  disabled={operation.busy}
                  onClick={() =>
                    void operation.run({
                      action: "appointment",
                      appointmentId: appointment.id,
                      status: "Done",
                    })
                  }
                >
                  Complete appointment
                </button>
              </>
            )}
          </div>
        </article>
      ))}
      {!appointments.length && (
        <p className={styles.emptyLine}>
          No appointments booked. Scheduled work items are listed below.
        </p>
      )}
      {canceling && (
        <Modal title="Cancel appointment" onClose={() => setCanceling("")}>
          <form
            className={styles.operationalForm}
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await operation.run({
                  action: "cancel-appointment",
                  appointmentId: canceling,
                  reason,
                })
              )
                setCanceling("");
            }}
          >
            <label>
              Cancellation reason
              <textarea
                required
                minLength={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <Failure message={operation.error} />
            <button className="button primary" disabled={operation.busy}>
              Confirm cancellation
            </button>
          </form>
        </Modal>
      )}
      {adding && (
        <Modal title="Book appointment" onClose={() => setAdding(false)}>
          <form
            className={styles.operationalForm}
            onSubmit={async (event) => {
              event.preventDefault();
              if (await operation.run({ action: "add-appointment", ...draft }))
                setAdding(false);
            }}
          >
            <label>
              Appointment title
              <input
                required
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </label>
            <label>
              Date
              <input
                required
                type="date"
                value={draft.date}
                onChange={(event) =>
                  setDraft({ ...draft, date: event.target.value })
                }
              />
            </label>
            <div className={styles.formColumns}>
              <label>
                Start
                <input
                  required
                  type="time"
                  value={draft.start}
                  onChange={(event) =>
                    setDraft({ ...draft, start: event.target.value })
                  }
                />
              </label>
              <label>
                End
                <input
                  required
                  type="time"
                  value={draft.end}
                  onChange={(event) =>
                    setDraft({ ...draft, end: event.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Assigned technician / crew
              <input
                required
                value={draft.technician}
                onChange={(event) =>
                  setDraft({ ...draft, technician: event.target.value })
                }
              />
            </label>
            <Failure message={operation.error} />
            <button className="button primary" disabled={operation.busy}>
              Book appointment
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}

export function JobOperationalCloseout({
  project,
  workspace,
  onAction,
  onSection,
}: {
  project: Project;
  workspace: Workspace;
  onAction: Operate;
  onSection: (section: JobSection) => void;
}) {
  const operation = useOperation(onAction);
  const [confirm, setConfirm] = useState(false);
  const issues = closeoutIssues(project, workspace);
  return (
    <section>
      <header className={styles.sectionHeading}>
        <div>
          <h2>Job closeout</h2>
          <p>
            Complete the job after its appointments, required forms, invoice,
            and acknowledgement are ready.
          </p>
        </div>
      </header>
      <Failure message={operation.error} />
      {issues.map((issue) => (
        <button
          className={styles.sectionLink}
          key={issue.title}
          onClick={() => onSection(issue.section)}
        >
          <span>
            <strong>{issue.title}</strong>
          </span>
          <ArrowRight size={16} />
        </button>
      ))}
      {!issues.length && (
        <p className={styles.ready}>
          <CheckCircle2 size={18} /> All closeout requirements are complete.
        </p>
      )}
      <button
        className="button primary"
        disabled={
          Boolean(issues.length) ||
          project.status === "Completed" ||
          operation.busy
        }
        onClick={() => setConfirm(true)}
      >
        {project.status === "Completed" ? "Job completed" : "Complete job"}
      </button>
      {confirm && (
        <Modal title="Complete this job?" onClose={() => setConfirm(false)}>
          <p>
            All appointments must be done. The final invoice and submitted forms
            remain on the job record.
          </p>
          <Failure message={operation.error} />
          <div className={styles.recordActions}>
            <button
              className="button secondary"
              onClick={() => setConfirm(false)}
            >
              Keep open
            </button>
            <button
              className="button primary"
              disabled={operation.busy}
              onClick={async () => {
                if (await operation.run({ action: "complete" }))
                  setConfirm(false);
              }}
            >
              Confirm job completion
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
