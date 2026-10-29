"use client";

import { Check } from "lucide-react";

export type QuoteWorkflowStep =
  "quote" | "agreement" | "completion" | "project";

export default function QuoteWorkflowStepper({
  active,
  agreementReady,
  completionReady,
  projectReady,
  onSelect,
}: {
  active: QuoteWorkflowStep;
  agreementReady: boolean;
  completionReady: boolean;
  projectReady: boolean;
  onSelect: (step: QuoteWorkflowStep) => void;
}) {
  const steps: Array<{
    id: QuoteWorkflowStep;
    title: string;
    detail: string;
    complete: boolean;
    disabled?: boolean;
  }> = [
    {
      id: "quote",
      title: "Quote & pricing",
      detail: "Customer, items, costs, and price",
      complete: agreementReady,
    },
    {
      id: "agreement",
      title: "Agreement details",
      detail: "Dates, payments, parties, and terms",
      complete: completionReady,
    },
    {
      id: "completion",
      title: "Send & complete",
      detail: "Email, portal, signatures, and deposit",
      complete: projectReady,
    },
    {
      id: "project",
      title: "Create project",
      detail: "Carry accepted items into Planning",
      complete: false,
      disabled: !projectReady,
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
