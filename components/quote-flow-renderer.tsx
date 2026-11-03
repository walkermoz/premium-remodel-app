"use client";

import type { ReactNode } from "react";
import { Check, FileSignature, LockKeyhole, Upload } from "lucide-react";
import {
  quoteFlowConditionsMatch,
  quoteFlowBlockContract,
  type QuoteFlowAudience,
  type QuoteFlowBlock,
  type QuoteFlowCondition,
  type QuoteFlowDefinition,
} from "@/lib/quote-flow-schema";
import styles from "./quote-flow-renderer.module.css";

type RenderMode = "staff" | "portal" | "device";

function defaultBlock(
  block: QuoteFlowBlock,
  value: unknown,
  onValue?: (block: QuoteFlowBlock, value: unknown) => void,
) {
  const inputProps = {
    value: typeof value === "string" || typeof value === "number" ? value : "",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      onValue?.(block, event.target.value),
    readOnly: !onValue,
  };
  switch (block.type) {
    case "custom_text":
      return <input {...inputProps} placeholder="Enter a response" />;
    case "custom_number":
      return <input {...inputProps} type="number" placeholder="0" />;
    case "custom_currency":
      return (
        <input {...inputProps} type="number" step="0.01" placeholder="$0.00" />
      );
    case "custom_date":
      return <input {...inputProps} type="date" />;
    case "custom_checkbox":
      return (
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={!onValue}
            onChange={(event) => onValue?.(block, event.target.checked)}
          />
          <span>{String(block.config.checkboxLabel || block.label)}</span>
        </label>
      );
    case "custom_select":
    case "custom_multiselect": {
      const options = Array.isArray(block.config.options)
        ? block.config.options.map(String)
        : ["Option one", "Option two"];
      if (block.type === "custom_multiselect")
        return (
          <div className={styles.choiceList}>
            {options.map((option) => (
              <label key={option}>
                <input
                  type="checkbox"
                  disabled={!onValue}
                  checked={Array.isArray(value) && value.includes(option)}
                  onChange={(event) => {
                    const current = Array.isArray(value)
                      ? value.map(String)
                      : [];
                    onValue?.(
                      block,
                      event.target.checked
                        ? [...new Set([...current, option])]
                        : current.filter((item) => item !== option),
                    );
                  }}
                />{" "}
                {option}
              </label>
            ))}
          </div>
        );
      return (
        <select
          value={String(value || "")}
          disabled={!onValue}
          onChange={(event) => onValue?.(block, event.target.value)}
        >
          <option value="">Choose an option</option>
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      );
    }
    case "custom_file":
      return (
        <button type="button" className={styles.fileButton} disabled={!onValue}>
          <Upload size={15} /> Choose file
        </button>
      );
    case "signature":
    case "initials":
      return (
        <div className={styles.signatureTarget}>
          <FileSignature size={20} />
          <span>
            {block.type === "initials" ? "Initial here" : "Sign here"}
          </span>
          <small>
            {String(block.config.signerRoleId || "Configured signer")}
          </small>
        </div>
      );
    case "heading":
      return <h3>{String(block.config.text || block.label)}</h3>;
    case "explanatory_copy":
      return <p>{String(block.config.text || block.description)}</p>;
    case "contact_fields":
      return (
        <div className={styles.fieldPreview}>
          Name · email · phone · address
        </div>
      );
    case "project_fields":
      return (
        <div className={styles.fieldPreview}>
          Project name · type · address · dates
        </div>
      );
    case "quote_items":
      return <div className={styles.fieldPreview}>Quote item workspace</div>;
    case "payment_schedule":
      return (
        <div className={styles.fieldPreview}>
          Deposit · Checkpoint 1 · Checkpoint 2
        </div>
      );
    case "deposit_collection":
      return (
        <div className={styles.fieldPreview}>Online payment · Record check</div>
      );
    case "delivery_controls":
      return (
        <div className={styles.fieldPreview}>
          Email · Customer portal · Sign on this device
        </div>
      );
    case "project_conversion":
      return <div className={styles.fieldPreview}>Create Planning project</div>;
    case "uploaded_pdf":
    case "generated_document":
      return (
        <div className={styles.documentPreview}>Document pages appear here</div>
      );
    default:
      return <div className={styles.fieldPreview}>{block.label}</div>;
  }
}

export default function QuoteFlowRenderer({
  definition,
  audience,
  mode,
  activeStageId,
  values = {},
  resolveCondition = () => undefined,
  onValue,
  renderBlock,
  showNavigation = true,
  showFooter = true,
  blockFilter,
  highlightedBlockId,
}: {
  definition: QuoteFlowDefinition;
  audience: QuoteFlowAudience;
  mode: RenderMode;
  activeStageId?: string;
  values?: Record<string, unknown>;
  resolveCondition?: (condition: QuoteFlowCondition) => unknown;
  onValue?: (block: QuoteFlowBlock, value: unknown) => void;
  renderBlock?: (block: QuoteFlowBlock) => ReactNode | undefined;
  showNavigation?: boolean;
  showFooter?: boolean;
  blockFilter?: (block: QuoteFlowBlock) => boolean;
  highlightedBlockId?: string;
}) {
  const stages = definition.stages.filter(
    (stage) =>
      stage.enabled &&
      (audience === "both" ||
        stage.audience === "both" ||
        stage.audience === audience) &&
      quoteFlowConditionsMatch(stage.conditions, resolveCondition),
  );
  const active =
    stages.find((stage) => stage.id === activeStageId) || stages[0] || null;
  return (
    <section
      className={`${styles.root} ${styles[mode]}`}
      data-render-mode={mode}
    >
      {mode === "device" && (
        <header className={styles.protectedHeader}>
          <strong>SB</strong>
          <div>
            <span>On-device signing</span>
            <small>Protected customer handoff</small>
          </div>
          <p>
            <LockKeyhole size={13} /> Staff workspace hidden
          </p>
        </header>
      )}
      {showNavigation && (
        <nav className={styles.steps} aria-label="Flow stages">
          {stages.map((stage, index) => (
            <div
              key={stage.id}
              className={stage.id === active?.id ? styles.activeStep : ""}
            >
              <span>{index + 1}</span>
              <p>
                <strong>{stage.title}</strong>
                <small>{stage.description}</small>
              </p>
            </div>
          ))}
        </nav>
      )}
      {active ? (
        <div className={styles.canvas}>
          <header>
            <small>
              {active.required ? "Required stage" : "Optional stage"}
            </small>
            <h2>{active.title}</h2>
            {active.description && <p>{active.description}</p>}
          </header>
          <div className={styles.blocks}>
            {active.blocks
              .filter((block) => {
                const presentation =
                  quoteFlowBlockContract(block).presentation[mode];
                return (
                  block.enabled &&
                  presentation !== "hidden" &&
                  (blockFilter?.(block) ?? true) &&
                  (audience === "both" ||
                    block.audience === "both" ||
                    block.audience === audience) &&
                  quoteFlowConditionsMatch(block.conditions, resolveCondition)
                );
              })
              .map((block) => {
                const editable =
                  quoteFlowBlockContract(block).presentation[mode] ===
                  "editable";
                return (
                  <section
                    key={block.id}
                    data-flow-block-id={block.id}
                    className={`${styles.block}${
                      highlightedBlockId === block.id
                        ? ` ${styles.highlightedBlock}`
                        : ""
                    }`}
                  >
                    {!["heading", "explanatory_copy"].includes(block.type) && (
                      <header>
                        <strong>{block.label}</strong>
                        {block.required && <span>Required</span>}
                      </header>
                    )}
                    {block.description &&
                      !["explanatory_copy"].includes(block.type) && (
                        <p>{block.description}</p>
                      )}
                    {renderBlock?.(block) ??
                      defaultBlock(
                        block,
                        values[block.id],
                        editable ? onValue : undefined,
                      )}
                  </section>
                );
              })}
          </div>
          {showFooter && (
            <footer>
              <span>
                <Check size={14} /> Progress is saved to this quote
              </span>
              <span>Use the flow navigation to continue</span>
            </footer>
          )}
        </div>
      ) : (
        <div className={styles.empty}>
          No stages are visible for this audience.
        </div>
      )}
    </section>
  );
}
