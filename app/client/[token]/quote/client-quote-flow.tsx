"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import QuoteFlowRenderer from "@/components/quote-flow-renderer";
import QuoteFlowSignatureControl from "@/components/quote-flow-signature-control";
import QuoteFlowFileControl from "@/components/quote-flow-file-control";
import QuoteFlowPaymentControl from "@/components/quote-flow-payment-control";
import {
  quoteFlowConditionsMatch,
  type QuoteFlowCondition,
  type QuoteFlowDefinition,
  type QuoteFlowStage,
} from "@/lib/quote-flow-schema";
import { missingRequiredQuoteFlowBlocks } from "@/lib/quote-flow-progress";
import styles from "./client-quote-flow.module.css";

type PublicFlow = {
  id: string;
  status: "active" | "completed" | "cancelled";
  currentStageId: string;
  definition: QuoteFlowDefinition;
  values: Array<{ stageId: string; blockId: string; value: unknown }>;
};

function stagePresentation(stage: QuoteFlowStage) {
  const premiumCustomerCompletion =
    stage.type === "delivery" &&
    stage.blocks.some(
      (block) => block.config.renderer === "legacy_quote_portal_v1",
    );
  return premiumCustomerCompletion
    ? {
        title: "Customer completion",
        description: "Review and sign every required document in one packet.",
      }
    : { title: stage.title, description: stage.description };
}

export default function ClientQuoteFlow({
  token,
  initial,
  onsite,
  quoteTotal,
  projectType,
  locale,
  currency,
}: {
  token: string;
  initial: PublicFlow;
  onsite: boolean;
  quoteTotal: number;
  projectType: string;
  locale: string;
  currency: string;
}) {
  const [flow, setFlow] = useState(initial);
  const [activeId, setActiveId] = useState(
    initial.definition.stages.some(
      (stage) => stage.id === initial.currentStageId,
    )
      ? initial.currentStageId
      : initial.definition.stages[0]?.id || "",
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [highlightedBlockId, setHighlightedBlockId] = useState("");
  const values = useMemo(
    () =>
      Object.fromEntries(flow.values.map((item) => [item.blockId, item.value])),
    [flow.values],
  );
  function resolve(condition: QuoteFlowCondition) {
    if (condition.field === "quote.total") return quoteTotal;
    if (condition.field === "project.type") return projectType;
    if (
      condition.field === "custom.field" ||
      condition.field === "customer.response"
    )
      return values[condition.fieldKey || ""];
    return undefined;
  }
  const stages = flow.definition.stages.filter(
    (stage) =>
      stage.enabled &&
      ["customer", "both"].includes(stage.audience) &&
      quoteFlowConditionsMatch(stage.conditions, resolve),
  );
  const index = Math.max(
    0,
    stages.findIndex((stage) => stage.id === activeId),
  );
  const active = stages[index];
  const activePresentation = active ? stagePresentation(active) : null;
  function missingRequiredForStage(stage: (typeof stages)[number] | undefined) {
    return missingRequiredQuoteFlowBlocks(stage, {
      values,
      audience: "customer",
      resolveCondition: resolve,
    });
  }
  const missingRequired = missingRequiredForStage(active);

  useEffect(() => {
    if (!highlightedBlockId) return;
    const target = document.querySelector(
      `[data-flow-block-id="${CSS.escape(highlightedBlockId)}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeId, highlightedBlockId]);

  function nextRequiredStep() {
    if (missingRequired.length) {
      setHighlightedBlockId(missingRequired[0].id);
      setError(
        `Complete the required ${missingRequired.length === 1 ? "field" : "fields"}: ${missingRequired.map((block) => block.label).join(", ")}.`,
      );
      return;
    }
    setError("");
    const nextStage = stages
      .slice(index + 1)
      .find((stage) => missingRequiredForStage(stage).length);
    if (nextStage) {
      setActiveId(nextStage.id);
      setHighlightedBlockId(missingRequiredForStage(nextStage)[0].id);
    } else if (index < stages.length - 1) {
      setActiveId(stages[index + 1].id);
      setHighlightedBlockId("");
    }
  }

  async function save(blockId: string, value: unknown) {
    if (!active) return;
    setBusy(blockId);
    setError("");
    try {
      const response = await fetch(
        `/api/client-quote/${encodeURIComponent(token)}/flow`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stageId: active.id, blockId, value }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not save your response.");
      setFlow(body as PublicFlow);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save your response.",
      );
    } finally {
      setBusy("");
    }
  }

  async function upload(blockId: string, file: File) {
    if (!active) return;
    setBusy(blockId);
    setError("");
    try {
      const form = new FormData();
      form.set("stageId", active.id);
      form.set("blockId", blockId);
      form.set("file", file);
      const response = await fetch(
        `/api/client-quote/${encodeURIComponent(token)}/flow/file`,
        { method: "POST", body: form },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not upload file.");
      setFlow(body.flow as PublicFlow);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Could not upload file.";
      setError(message);
      throw new Error(message);
    } finally {
      setBusy("");
    }
  }

  async function payOnline(blockId: string) {
    if (!active) return;
    setBusy(blockId);
    setError("");
    try {
      const response = await fetch(
        `/api/client-quote/${encodeURIComponent(token)}/flow/payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stageId: active.id, blockId }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not start secure checkout.");
      window.location.assign(body.url);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not start secure checkout.",
      );
      setBusy("");
    }
  }

  if (!active) return null;
  return (
    <section className={styles.journey} aria-label="Quote process">
      <header>
        <div>
          <span>YOUR NEXT STEPS</span>
          <h2>{activePresentation?.title}</h2>
          <p>{activePresentation?.description}</p>
        </div>
        <strong>
          Step {index + 1} of {stages.length}
        </strong>
      </header>
      <nav aria-label="Customer quote stages">
        {stages.map((stage, stageIndex) => (
          <button
            type="button"
            key={stage.id}
            className={stage.id === active.id ? styles.active : ""}
            onClick={() => setActiveId(stage.id)}
          >
            <span>
              {stageIndex < index ? <Check size={12} /> : stageIndex + 1}
            </span>
            {stagePresentation(stage).title}
          </button>
        ))}
      </nav>
      <QuoteFlowRenderer
        definition={flow.definition}
        audience="customer"
        mode={onsite ? "device" : "portal"}
        activeStageId={active.id}
        values={values}
        resolveCondition={resolve}
        showNavigation={false}
        showFooter={false}
        highlightedBlockId={highlightedBlockId}
        renderBlock={(block) => {
          if (block.type === "deposit_collection")
            return (
              <QuoteFlowPaymentControl
                block={block}
                value={values[block.id]}
                quoteTotal={quoteTotal}
                locale={locale}
                currency={currency}
                busy={busy === block.id}
                staff={false}
                onPayOnline={() => payOnline(block.id)}
              />
            );
          if (block.type === "custom_file")
            return (
              <QuoteFlowFileControl
                value={values[block.id]}
                busy={busy === block.id}
                onUpload={(file) => upload(block.id, file)}
              />
            );
          if (!["signature", "initials"].includes(block.type)) return undefined;
          return (
            <QuoteFlowSignatureControl
              block={block}
              value={values[block.id]}
              busy={busy === block.id}
              onComplete={(value) => void save(block.id, value)}
            />
          );
        }}
        onValue={(block, value) => void save(block.id, value)}
      />
      {busy && <p className={styles.status}>Saving…</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <footer>
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setActiveId(stages[index - 1].id)}
        >
          <ChevronLeft size={15} /> Previous
        </button>
        <button
          type="button"
          disabled={index >= stages.length - 1 && !missingRequired.length}
          onClick={nextRequiredStep}
        >
          Next required step <ChevronRight size={15} />
        </button>
      </footer>
    </section>
  );
}
