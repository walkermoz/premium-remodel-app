"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bath,
  ChefHat,
  Check,
  Fence,
  House,
  Layers2,
  Wrench,
} from "lucide-react";
import styles from "./quote.module.css";

const projectOptions = [
  {
    value: "Bathroom Remodel",
    label: "Bathroom",
    detail: "Remodel",
    icon: Bath,
  },
  {
    value: "Kitchen Remodel",
    label: "Kitchen",
    detail: "Remodel",
    icon: ChefHat,
  },
  {
    value: "Basement & Attic Finishing",
    label: "Basement & attic",
    detail: "Finishing",
    icon: Layers2,
  },
  {
    value: "Deck & Exterior",
    label: "Deck & exterior",
    detail: "Build or remodel",
    icon: Fence,
  },
  {
    value: "Whole Home Remodel",
    label: "Whole home",
    detail: "Remodel",
    icon: House,
  },
  { value: "Other", label: "Other", detail: "Home project", icon: Wrench },
] as const;

type RequestForm = {
  project: string;
  name: string;
  zip: string;
  address: string;
  phone: string;
  email: string;
  projectDescription: string;
};

const emptyForm: RequestForm = {
  project: "",
  name: "",
  zip: "",
  address: "",
  phone: "",
  email: "",
  projectDescription: "",
};

export default function ClientNewRequestForm({
  requestsUrl,
}: {
  requestsUrl: string;
}) {
  const descriptionId = useId();
  const appointmentSmsId = useId();
  const marketingSmsId = useId();
  const [form, setForm] = useState<RequestForm>(emptyForm);
  const [step, setStep] = useState(1);
  const [appointmentSmsOptIn, setAppointmentSmsOptIn] = useState(false);
  const [marketingSmsOptIn, setMarketingSmsOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const submissionId = useRef<string | null>(null);

  function update(name: keyof RequestForm, value: string) {
    submissionId.current = null;
    setForm((previous) => ({ ...previous, [name]: value }));
    if (error) setError("");
  }

  const canSubmit =
    form.name.trim().length > 0 &&
    /^\d{5}(?:-\d{4})?$/.test(form.zip.trim()) &&
    form.address.trim().length > 0 &&
    form.phone.replace(/\D/g, "").length >= 10 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !form.project || !canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      submissionId.current ||= crypto.randomUUID();
      const [firstName, ...lastNameParts] = form.name.trim().split(/\s+/);
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: submissionId.current,
          first_name: firstName,
          last_name: lastNameParts.join(" "),
          email: form.email.trim(),
          phone: "+1" + form.phone.replace(/\D/g, ""),
          zip: form.zip.trim(),
          address: form.address.trim(),
          project: form.project,
          project_description: form.projectDescription.trim(),
          sms_appointment_opt_in: appointmentSmsOptIn,
          sms_marketing_opt_in: marketingSmsOptIn,
        }),
      });
      if (!response.ok) throw new Error("Request delivery failed.");
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again or call us directly.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted)
    return (
      <div className={styles.requestSuccess} role="status">
        <span>
          <Check size={28} aria-hidden="true" />
        </span>
        <h2>Thank You!</h2>
        <p>
          A member of our team will reach out shortly to schedule your free
          in-home visit.
        </p>
        <a href={requestsUrl}>Back to requests</a>
      </div>
    );

  return (
    <form className={styles.requestForm} onSubmit={submit}>
      <div className={styles.requestProgress} aria-label={`Step ${step} of 2`}>
        <div>
          <span>Step {step} of 2</span>
          <span>{step * 50}%</span>
        </div>
        <div className={styles.requestProgressBars}>
          <span className={styles.complete} />
          <span className={step === 2 ? styles.complete : ""} />
        </div>
      </div>
      {step === 1 ? (
        <fieldset className={styles.requestProjectFieldset}>
          <legend>Choose your project type</legend>
          <div className={styles.requestProjects}>
            {projectOptions.map(({ value, label, detail, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={form.project === value}
                onClick={() => update("project", value)}
              >
                <Icon size={32} strokeWidth={1.7} aria-hidden="true" />
                <strong>{label}</strong>
                <small>{detail}</small>
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className={styles.requestContact}>
          <h3>Where should we contact you?</h3>
          <div className={styles.requestFields}>
            <input
              aria-label="Full name"
              placeholder="Full name"
              autoComplete="name"
              required
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
            <input
              aria-label="Zip code"
              placeholder="Zip code"
              autoComplete="postal-code"
              inputMode="numeric"
              required
              value={form.zip}
              onChange={(event) => update("zip", event.target.value)}
            />
            <input
              className={styles.fullWidth}
              aria-label="Street address"
              placeholder="Street address"
              autoComplete="street-address"
              required
              value={form.address}
              onChange={(event) => update("address", event.target.value)}
            />
            <input
              aria-label="Phone number"
              type="tel"
              placeholder="Phone number"
              autoComplete="tel"
              required
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
            />
            <input
              aria-label="Email address"
              type="email"
              placeholder="Email address"
              autoComplete="email"
              required
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
            />
          </div>
          <label
            className={styles.requestDescriptionLabel}
            htmlFor={descriptionId}
          >
            Job description <span>(optional)</span>
          </label>
          <textarea
            id={descriptionId}
            placeholder="Tell us about the work you have in mind"
            rows={2}
            value={form.projectDescription}
            onChange={(event) =>
              update("projectDescription", event.target.value)
            }
          />
          <div className={styles.requestSmsChoices}>
            <label htmlFor={appointmentSmsId}>
              <input
                id={appointmentSmsId}
                type="checkbox"
                checked={appointmentSmsOptIn}
                onChange={(event) => {
                  submissionId.current = null;
                  setAppointmentSmsOptIn(event.target.checked);
                }}
              />{" "}
              I agree to receive texts from Premium Remodel about appointments,
              estimates, scheduling changes, and project updates.
            </label>
            <label htmlFor={marketingSmsId}>
              <input
                id={marketingSmsId}
                type="checkbox"
                checked={marketingSmsOptIn}
                onChange={(event) => {
                  submissionId.current = null;
                  setMarketingSmsOptIn(event.target.checked);
                }}
              />{" "}
              I agree to receive marketing and promotional texts from Premium
              Remodel.
            </label>
          </div>
          <p className={styles.requestSmsNote}>
            Choose which texts to receive from Premium Remodel. Messages may be
            automated. SMS consent is optional and not a condition of purchase.
            Message frequency varies. Message and data rates may apply. Reply
            STOP to unsubscribe or HELP for help.
          </p>
          <p className={styles.requestSmsNote}>
            Read our{" "}
            <a
              href="https://www.premiumremodel.com/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy (opens in a new tab)
            </a>{" "}
            and{" "}
            <a
              href="https://www.premiumremodel.com/terms-and-conditions"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms &amp; Conditions (opens in a new tab)
            </a>
            , including our SMS terms.
          </p>
        </div>
      )}
      {error && (
        <p className={styles.requestError} role="alert">
          {error}
        </p>
      )}
      <div className={styles.requestButtons}>
        {step === 2 && (
          <button
            type="button"
            className={styles.requestBack}
            onClick={() => setStep(1)}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </button>
        )}
        {step === 1 ? (
          <button
            type="button"
            className={styles.requestPrimary}
            disabled={!form.project}
            onClick={() => setStep(2)}
          >
            Continue <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            className={styles.requestPrimary}
            disabled={submitting || !canSubmit}
          >
            {submitting ? "Submitting..." : "Schedule Now"}
          </button>
        )}
      </div>
    </form>
  );
}
