"use client";

import { Check } from "lucide-react";
import type { QuoteFlowStage } from "@/lib/quote-flow-schema";

export type QuoteWorkflowStep =
  "quote" | "agreement" | "company" | "customer" | "deposit" | "project";

export default function QuoteWorkflowStepper({
  active,
  quoteReady,
  agreementReady,
  companyReady,
  customerReady,
  depositReady,
  projectReady,
  configuredStages,
  completionByStageId,
  onSelect,
}: {
  active: string;
  quoteReady: boolean;
  agreementReady: boolean;
  companyReady: boolean;
  customerReady: boolean;
  depositReady: boolean;
  projectReady: boolean;
  configuredStages?: QuoteFlowStage[];
  completionByStageId?: Record<string, boolean>;
  onSelect: (step: string) => void;
}) {
  const legacySteps: Array<{
    id: string;
    title: string;
    detail: string;
    complete: boolean;
    disabled?: boolean;
  }> = [
    {
      id: "quote",
      title: "Quote & pricing",
      detail: "Customer, items, costs, and price",
      complete: quoteReady,
    },
    {
      id: "agreement",
      title: "Documents",
      detail: "Agreement details and company signatures",
      complete: companyReady,
    },
    {
      id: "customer",
      title: "Customer signatures",
      detail: "Share the packet and collect customer signatures",
      complete: customerReady,
    },
    {
      id: "deposit",
      title: "Deposit",
      detail: "Collect or record the required payment",
      complete: depositReady,
    },
    {
      id: "project",
      title: "Create project",
      detail: "Carry accepted items into Planning",
      complete: false,
      disabled: !projectReady,
    },
  ];
  const completeForStage = (stage: QuoteFlowStage) => {
    if (stage.type === "quote_builder") return quoteReady;
    if (stage.type === "agreement_details") return agreementReady;
    if (stage.type === "signature_collection") return companyReady;
    if (
      ["delivery", "initials_collection", "customer_confirmation"].includes(
        stage.type,
      )
    )
      return customerReady;
    if (stage.type === "deposit_payment") return depositReady;
    if (stage.type === "project_conversion") return projectReady;
    return false;
  };
  const steps = configuredStages?.length
    ? configuredStages.map((stage) => {
        const premiumCompletion =
          stage.type === "delivery" &&
          stage.blocks.some(
            (block) => block.config.renderer === "legacy_quote_portal_v1",
          );
        return {
          id: stage.id,
          title:
            stage.type === "signature_collection"
              ? "Company signatures"
              : premiumCompletion
                ? "Customer signatures"
                : stage.title,
          detail: premiumCompletion
            ? "Share the packet and collect customer signatures"
            : stage.type === "signature_collection"
              ? "Review and add required company signatures"
              : stage.description,
          complete: completionByStageId?.[stage.id] ?? completeForStage(stage),
          disabled: stage.type === "project_conversion" && !projectReady,
        };
      })
    : legacySteps;

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
              aria-expanded={active === step.id}
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
