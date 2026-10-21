"use client";
import { useEffect, useState } from "react";
import {
  Plus,
  Paperclip,
  Check,
  CreditCard,
  Copy,
  ExternalLink,
} from "lucide-react";
import { Modal } from "./ui";
import type { Project, Workspace } from "@/lib/types";
import {
  projectFinances,
  projectMoney,
  percentLabel,
} from "@/lib/project-finances";
import { dateLabel } from "@/lib/utils";

export default function ProjectPayments({
  project,
  workspace,
  demo,
  onLog,
  canCreateCardLink,
}: {
  project: Project;
  workspace: Workspace;
  demo: boolean;
  onLog: () => void;
  canCreateCardLink: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [copied, setCopied] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  const [stripeReason, setStripeReason] = useState("");
  useEffect(() => {
    if (!canCreateCardLink) return;
    const controller = new AbortController();
    void fetch("/api/stripe/checkout", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : { enabled: false }))
      .then((config) => {
        if (!controller.signal.aborted) {
          setStripeReady(config.enabled === true);
          setStripeReason(config.reason || "");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStripeReady(false);
      });
    return () => controller.abort();
  }, [canCreateCardLink]);
  const finances = projectFinances(
    project,
    workspace.scope,
    workspace.activities,
  );
  const {
    total,
    collected,
    remaining,
    collectedPercent,
    remainingPercent,
    credit,
    payments,
  } = finances;
  async function createCardLink() {
    setCreating(true);
    setPaymentError("");
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, amount }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not create payment link.");
      setPaymentUrl(result.url);
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "Could not create payment link.",
      );
    } finally {
      setCreating(false);
    }
  }
  async function copyCardLink() {
    try {
      await navigator.clipboard.writeText(paymentUrl);
      setCopied(true);
    } catch {
      setPaymentError("Select and copy the payment link below.");
    }
  }
  return (
    <section className="project-payments" aria-label="Checks & payments">
      <div className="section-heading">
        <div>
          <h2>Checks & payments</h2>
          <p>Customer payments collected against the scope total.</p>
        </div>
        <div className="payment-actions">
          {canCreateCardLink && remaining > 0 && (
            <button
              className="button primary small-button"
              disabled={!stripeReady}
              title={
                stripeReady
                  ? "Create a secure card payment link"
                  : stripeReason || "Stripe payments are being configured"
              }
              onClick={() => {
                setAmount(remaining.toFixed(2));
                setPaymentUrl("");
                setPaymentError("");
                setCopied(false);
                setPaymentDialog(true);
              }}
            >
              <CreditCard size={15} />
              Collect by card
            </button>
          )}
          <button className="button secondary small-button" onClick={onLog}>
            <Plus size={15} />
            Log payment
          </button>
        </div>
      </div>
      {canCreateCardLink && stripeReason && (
        <p className="payment-balance-note" role="status">
          {stripeReason}
        </p>
      )}
      {paymentDialog && (
        <Modal
          title="Collect a card payment"
          subtitle="Create a secure Stripe link for this project."
          onClose={() => setPaymentDialog(false)}
        >
          <div className="card-payment-dialog">
            <p>
              Remaining balance: <strong>{projectMoney(remaining)}</strong>
            </p>
            {!paymentUrl ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void createCardLink();
                }}
              >
                <label htmlFor="card-payment-amount">Amount to collect</label>
                <div className="card-payment-amount">
                  <span>$</span>
                  <input
                    id="card-payment-amount"
                    type="number"
                    min="0.50"
                    max={remaining.toFixed(2)}
                    step="0.01"
                    inputMode="decimal"
                    required
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </div>
                <button
                  className="button primary"
                  type="submit"
                  disabled={creating}
                >
                  {creating ? "Creating link…" : "Create payment link"}
                </button>
              </form>
            ) : (
              <div className="card-payment-link">
                <label htmlFor="card-payment-url">
                  Share this link with your client
                </label>
                <input
                  id="card-payment-url"
                  value={paymentUrl}
                  readOnly
                  onFocus={(event) => event.target.select()}
                />
                <div className="payment-actions">
                  <button
                    className="button primary"
                    onClick={() => void copyCardLink()}
                  >
                    <Copy size={15} />
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <a
                    className="button secondary"
                    href={paymentUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={15} />
                    Open checkout
                  </a>
                </div>
                <p>
                  This link expires in 24 hours. The balance updates after
                  Stripe confirms payment. A link does not count as collected.
                </p>
              </div>
            )}
            {paymentError && (
              <p className="card-payment-error" role="alert">
                {paymentError}
              </p>
            )}
          </div>
        </Modal>
      )}
      <div className="payment-balance-grid">
        <div>
          <span>Collected</span>
          <div>
            <strong>{projectMoney(collected)}</strong>
            <span className="balance-percent">
              {percentLabel(collectedPercent)}
            </span>
          </div>
        </div>
        <div>
          <span>Remaining to collect</span>
          <div>
            <strong>{projectMoney(remaining)}</strong>
            <span className="balance-percent">
              {percentLabel(remainingPercent)}
            </span>
          </div>
        </div>
      </div>
      <div
        className="collection-progress"
        role="progressbar"
        aria-label="Payment collection progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round((collectedPercent || 0) * 100))}
        aria-valuetext={
          total > 0
            ? `${percentLabel(collectedPercent)} collected`
            : "Add scope pricing to calculate progress"
        }
      >
        <i
          style={{ width: `${Math.min(100, (collectedPercent || 0) * 100)}%` }}
        />
      </div>
      <p className="payment-balance-note">
        {total <= 0 ? (
          "Add scope pricing to calculate what is owed and payment percentages."
        ) : credit > 0 ? (
          `${projectMoney(credit)} collected above the scope total.`
        ) : remaining === 0 ? (
          <>
            <Check size={14} />
            Paid in full
          </>
        ) : (
          `Based on ${projectMoney(total)} in scope of work.`
        )}
      </p>
      {payments.length ? (
        <>
          <ul className="payment-history">
            {(expanded ? payments : payments.slice(0, 5)).map((payment) => (
              <li key={payment.id}>
                <div>
                  <strong>
                    {payment.paymentMethod || "Payment"} from {payment.party}
                  </strong>
                  <span>{payment.summary}</span>
                  <small>
                    {dateLabel(payment.occurredAt)} · Collected by{" "}
                    {payment.actorName}
                  </small>
                  {payment.attachmentIds.map((id) => {
                    const file = workspace.attachments.find(
                      (item) => item.id === id,
                    );
                    return file ? (
                      <a
                        key={id}
                        href={
                          demo
                            ? file.path
                            : `/api/files?id=${encodeURIComponent(id)}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        download={demo ? file.name : undefined}
                      >
                        <Paperclip size={12} />
                        {file.name}
                      </a>
                    ) : null;
                  })}
                </div>
                <strong className="payment-history-amount">
                  {projectMoney(payment.amount || 0)}
                </strong>
              </li>
            ))}
          </ul>
          {payments.length > 5 && (
            <button
              className="text-button link"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show less" : `Show all ${payments.length} payments`}
            </button>
          )}
        </>
      ) : (
        <p className="payment-empty">
          No payments logged yet. Record a collected check or other customer
          payment to update the balance.
        </p>
      )}
    </section>
  );
}
