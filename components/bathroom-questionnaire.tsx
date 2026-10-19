"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bath, Check } from "lucide-react";
import {
  buildBathroomScopeRows,
  defaultBathroomQuestionnaire,
  existingBathroomItems,
  proposalOptions,
  showerFeatureOptions,
  type BathroomQuestionnaireAnswers,
  type BathroomQuestionnaireProject,
  type ExistingBathroomItemId,
  type KeepReplaceAnswer,
  type ProposalOptionId,
} from "@/lib/bathroom-questionnaire";

const steps = [
  "Project & existing bath",
  "Shower & plumbing",
  "Glass & finishes",
  "Review",
];

export default function BathroomQuestionnaire({
  project,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  project?: Partial<BathroomQuestionnaireProject>;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (
    answers: BathroomQuestionnaireAnswers,
    rows: ReturnType<typeof buildBathroomScopeRows>,
  ) => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<BathroomQuestionnaireAnswers>(() =>
    defaultBathroomQuestionnaire(project),
  );
  const rows = useMemo(() => buildBathroomScopeRows(answers), [answers]);

  function update(patch: Partial<BathroomQuestionnaireAnswers>) {
    setAnswers((current) => ({ ...current, ...patch }));
  }

  function setExisting(id: ExistingBathroomItemId, value: KeepReplaceAnswer) {
    setAnswers((current) => ({
      ...current,
      existing: { ...current.existing, [id]: value },
    }));
  }

  function setProposal(id: ProposalOptionId, value: boolean) {
    setAnswers((current) => ({
      ...current,
      proposalItems: { ...current.proposalItems, [id]: value },
    }));
  }

  return (
    <form
      className="bathroom-questionnaire"
      onSubmit={(event) => {
        event.preventDefault();
        if (step < steps.length - 1) setStep((current) => current + 1);
        else onSubmit(answers, rows);
      }}
    >
      <div
        className="questionnaire-progress"
        aria-label="Questionnaire progress"
      >
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            className={
              index === step ? "is-current" : index < step ? "is-complete" : ""
            }
            aria-current={index === step ? "step" : undefined}
            disabled={busy || index > step}
            onClick={() => setStep(index)}
          >
            <span>{index < step ? <Check size={12} /> : index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      <div className="questionnaire-body">
        <div className="questionnaire-project-banner">
          <span>
            <Bath size={20} />
          </span>
          <div>
            <strong>Bathroom remodel</strong>
            <p>Answers become detailed, editable rows in the quote.</p>
          </div>
        </div>

        {step === 0 && (
          <div className="questionnaire-step">
            <QuestionSection
              title="Customer & project"
              description="Confirm the details already carried by this quote."
            >
              <div className="questionnaire-grid two-column">
                <TextField
                  label="Customer name"
                  value={answers.customerName}
                  onChange={(customerName) => update({ customerName })}
                />
                <TextField
                  label="Phone"
                  value={answers.customerPhone}
                  onChange={(customerPhone) => update({ customerPhone })}
                  inputMode="tel"
                />
                <TextField
                  label="Email"
                  value={answers.customerEmail}
                  onChange={(customerEmail) => update({ customerEmail })}
                  type="email"
                />
                <TextField
                  label="Project address"
                  value={answers.address}
                  onChange={(address) => update({ address })}
                />
                <TextField
                  label="Preferred start date"
                  value={answers.preferredStartDate}
                  onChange={(preferredStartDate) =>
                    update({ preferredStartDate })
                  }
                  type="date"
                />
                <ChoiceField
                  label="Best way to reach customer"
                  value={answers.bestContactMethod}
                  options={["Call", "Text", "Email"]}
                  onChange={(bestContactMethod) =>
                    update({
                      bestContactMethod:
                        bestContactMethod as BathroomQuestionnaireAnswers["bestContactMethod"],
                    })
                  }
                />
              </div>
            </QuestionSection>

            <QuestionSection
              title="What we understand so far"
              description="Correct any assumption that does not apply."
            >
              <div className="questionnaire-check-list">
                <CheckField
                  checked={answers.removeDividerWall}
                  onChange={(removeDividerWall) =>
                    update({ removeDividerWall })
                  }
                  label="Remove the wall dividing the vanity area from the shower / toilet area."
                />
                <CheckField
                  checked={answers.keepLayout}
                  onChange={(keepLayout) => update({ keepLayout })}
                  label="Keep the vanity, toilet, and shower in their current locations."
                />
                <CheckField
                  checked={answers.tiledShower}
                  onChange={(tiledShower) => update({ tiledShower })}
                  label="Replace the tub/shower with a tiled shower floor, floor-to-ceiling wall tile, and custom glass door."
                />
              </div>
            </QuestionSection>

            <QuestionSection
              title="Measurements"
              description="Enter the units with the measurement, such as 10 ft or 60 in."
            >
              <div className="questionnaire-grid measurement-grid">
                <TextField
                  label="Room length"
                  value={answers.roomLength}
                  onChange={(roomLength) => update({ roomLength })}
                />
                <TextField
                  label="Room width"
                  value={answers.roomWidth}
                  onChange={(roomWidth) => update({ roomWidth })}
                />
                <TextField
                  label="Ceiling height"
                  value={answers.ceilingHeight}
                  onChange={(ceilingHeight) => update({ ceilingHeight })}
                />
                <TextField
                  label="Tub / shower width"
                  value={answers.showerWidth}
                  onChange={(showerWidth) => update({ showerWidth })}
                />
                <TextField
                  label="Tub / shower depth"
                  value={answers.showerDepth}
                  onChange={(showerDepth) => update({ showerDepth })}
                />
              </div>
            </QuestionSection>

            <QuestionSection
              title="Existing bathroom"
              description="For each item, choose keep, replace, or unsure."
            >
              <div className="existing-item-grid">
                {existingBathroomItems.map(([id, label]) => (
                  <fieldset key={id} className="existing-item-choice">
                    <legend>{label}</legend>
                    <div>
                      {(["Keep", "Replace", "Unsure"] as const).map(
                        (choice) => (
                          <label key={choice}>
                            <input
                              type="radio"
                              name={`existing-${id}`}
                              checked={answers.existing[id] === choice}
                              onChange={() => setExisting(id, choice)}
                            />
                            {choice}
                          </label>
                        ),
                      )}
                    </div>
                  </fieldset>
                ))}
              </div>
            </QuestionSection>

            <QuestionSection title="Divider wall">
              <div className="questionnaire-grid two-column">
                <ChoiceField
                  label="Plan for divider wall"
                  value={answers.dividerPlan}
                  options={["Remove", "Keep", "Review on site"]}
                  onChange={(dividerPlan) =>
                    update({
                      dividerPlan:
                        dividerPlan as BathroomQuestionnaireAnswers["dividerPlan"],
                    })
                  }
                />
                <ChoiceField
                  label="Switches, outlets, or plumbing in wall?"
                  value={answers.dividerUtilities}
                  options={["Yes", "No", "Unsure"]}
                  onChange={(dividerUtilities) =>
                    update({
                      dividerUtilities:
                        dividerUtilities as BathroomQuestionnaireAnswers["dividerUtilities"],
                    })
                  }
                />
                <TextAreaField
                  label="What should be patched or refinished where the wall is removed?"
                  value={answers.dividerRepair}
                  onChange={(dividerRepair) => update({ dividerRepair })}
                />
                <TextAreaField
                  label="Other existing conditions"
                  value={answers.existingConditions}
                  onChange={(existingConditions) =>
                    update({ existingConditions })
                  }
                />
              </div>
            </QuestionSection>
          </div>
        )}

        {step === 1 && (
          <div className="questionnaire-step">
            <QuestionSection title="Shower layout & finishes">
              <div className="questionnaire-grid two-column">
                <ChoiceField
                  label="Use current tub / shower footprint?"
                  value={answers.currentFootprint}
                  options={["Yes", "No / change it", "Unsure"]}
                  onChange={(currentFootprint) =>
                    update({
                      currentFootprint:
                        currentFootprint as BathroomQuestionnaireAnswers["currentFootprint"],
                    })
                  }
                />
                <ChoiceField
                  label="Shower base"
                  value={answers.showerBase}
                  options={["Curb", "Curbless", "Undecided"]}
                  onChange={(showerBase) =>
                    update({
                      showerBase:
                        showerBase as BathroomQuestionnaireAnswers["showerBase"],
                    })
                  }
                />
                <ChoiceField
                  label="Drain"
                  value={answers.drain}
                  options={[
                    "Keep current location",
                    "Reposition if needed",
                    "Unsure",
                  ]}
                  onChange={(drain) =>
                    update({
                      drain: drain as BathroomQuestionnaireAnswers["drain"],
                    })
                  }
                />
                <ChoiceField
                  label="Tile supply / allowance"
                  value={answers.tileAllowance}
                  options={[
                    "Customer will supply",
                    "Include allowance",
                    "Undecided",
                  ]}
                  onChange={(tileAllowance) =>
                    update({
                      tileAllowance:
                        tileAllowance as BathroomQuestionnaireAnswers["tileAllowance"],
                    })
                  }
                />
                <TextAreaField
                  label="Tile style, color, and size"
                  value={answers.tileStyle}
                  onChange={(tileStyle) => update({ tileStyle })}
                />
              </div>
            </QuestionSection>

            <QuestionSection
              title="Shower features & plumbing"
              description="Select every feature requested."
            >
              <div className="questionnaire-option-grid">
                {showerFeatureOptions.map((feature) => (
                  <CheckField
                    key={feature}
                    label={feature}
                    checked={answers.showerFeatures.includes(feature)}
                    onChange={(checked) =>
                      update({
                        showerFeatures: checked
                          ? [...answers.showerFeatures, feature]
                          : answers.showerFeatures.filter(
                              (item) => item !== feature,
                            ),
                      })
                    }
                  />
                ))}
              </div>
              <TextField
                label="Other shower feature"
                value={answers.otherShowerFeature}
                onChange={(otherShowerFeature) =>
                  update({ otherShowerFeature })
                }
              />
              <div className="questionnaire-grid two-column">
                <ChoiceField
                  label="Shower valve, trim, and shower head"
                  value={answers.showerFixtures}
                  options={["Reuse existing", "Replace", "Unsure"]}
                  onChange={(showerFixtures) =>
                    update({
                      showerFixtures:
                        showerFixtures as BathroomQuestionnaireAnswers["showerFixtures"],
                    })
                  }
                />
                <TextField
                  label="Preferred fixture finish / brand"
                  value={answers.fixtureFinish}
                  onChange={(fixtureFinish) => update({ fixtureFinish })}
                />
              </div>
            </QuestionSection>
          </div>
        )}

        {step === 2 && (
          <div className="questionnaire-step">
            <QuestionSection title="Custom glass">
              <div className="questionnaire-grid two-column">
                <ChoiceField
                  label="Glass preference"
                  value={answers.glassPreference}
                  options={["Frameless clear glass", "Other", "Undecided"]}
                  onChange={(glassPreference) =>
                    update({
                      glassPreference:
                        glassPreference as BathroomQuestionnaireAnswers["glassPreference"],
                    })
                  }
                />
                <TextField
                  label="Other glass preference"
                  value={answers.glassOther}
                  onChange={(glassOther) => update({ glassOther })}
                  disabled={answers.glassPreference !== "Other"}
                />
                <TextField
                  label="Hardware finish"
                  value={answers.hardwareFinish}
                  onChange={(hardwareFinish) => update({ hardwareFinish })}
                />
                <TextField
                  label="Door swing / opening preference"
                  value={answers.doorSwing}
                  onChange={(doorSwing) => update({ doorSwing })}
                />
              </div>
            </QuestionSection>

            <QuestionSection
              title="Other work to include"
              description="These selections override an unsure existing-item answer and add the work to the quote."
            >
              <div className="questionnaire-option-grid">
                {proposalOptions.map(([id, label]) => (
                  <CheckField
                    key={id}
                    label={label}
                    checked={answers.proposalItems[id]}
                    onChange={(checked) => setProposal(id, checked)}
                  />
                ))}
              </div>
              <TextAreaField
                label="Other work to include"
                value={answers.otherWork}
                onChange={(otherWork) => update({ otherWork })}
              />
            </QuestionSection>

            <QuestionSection
              title="Priorities & notes"
              description="What matters most in this remodel? Include product links or selection notes."
            >
              <TextAreaField
                label="Priorities, inspiration, products, and notes"
                value={answers.priorities}
                onChange={(priorities) => update({ priorities })}
                rows={4}
              />
            </QuestionSection>
          </div>
        )}

        {step === 3 && (
          <div className="questionnaire-step questionnaire-review">
            <QuestionSection
              title="Review generated quote rows"
              description="Every row remains editable after it is added. Prices and costs start at zero."
            >
              <div className="questionnaire-review-summary">
                <strong>{rows.length} quote rows ready</strong>
                <span>
                  {answers.customerName || "Customer"} ·{" "}
                  {answers.address || "No address added"}
                </span>
              </div>
              <ol className="questionnaire-row-preview">
                {rows.map((row) => (
                  <li key={row.id}>
                    <strong>{row.title}</strong>
                    {row.details && <span>{row.details}</span>}
                  </li>
                ))}
              </ol>
            </QuestionSection>
          </div>
        )}

        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
      </div>

      <footer className="modal-footer questionnaire-footer">
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={
            step === 0 ? onCancel : () => setStep((current) => current - 1)
          }
        >
          {step === 0 ? (
            "Cancel"
          ) : (
            <>
              <ArrowLeft size={14} />
              Back
            </>
          )}
        </button>
        <span>
          Step {step + 1} of {steps.length}
        </span>
        <button
          type="submit"
          className="button primary"
          disabled={busy || (step === steps.length - 1 && rows.length === 0)}
        >
          {busy ? (
            "Adding rows…"
          ) : step === steps.length - 1 ? (
            `Add ${rows.length} quote rows`
          ) : (
            <>
              Continue
              <ArrowRight size={14} />
            </>
          )}
        </button>
      </footer>
    </form>
  );
}

function QuestionSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="questionnaire-section">
      <header>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  disabled?: boolean;
}) {
  return (
    <label className="questionnaire-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type={type}
        inputMode={inputMode}
        value={value}
        disabled={disabled}
        maxLength={250}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="questionnaire-field">
      <span>{label}</span>
      <textarea
        aria-label={label}
        rows={rows}
        value={value}
        maxLength={15000}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ChoiceField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="questionnaire-field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="questionnaire-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
