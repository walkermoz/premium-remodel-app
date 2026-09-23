"use client";
import { useState } from "react";
import { Plus, Paperclip, Check } from "lucide-react";
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
}: {
  project: Project;
  workspace: Workspace;
  demo: boolean;
  onLog: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
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
  return (
    <section className="project-payments" aria-label="Checks & payments">
      <div className="section-heading">
        <div>
          <h2>Checks & payments</h2>
          <p>Customer payments collected against the scope total.</p>
        </div>
        <button className="button secondary small-button" onClick={onLog}>
          <Plus size={15} />
          Log payment
        </button>
      </div>
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
