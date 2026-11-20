import { z } from "zod";
import { workToday, workTimeZone } from "./work";
import type { Project, Quote, ScopeItem, Workspace } from "./types";
import { projectFinances } from "./project-finances";
import { quoteAcceptanceSchema } from "./quote-signature";
import { msaPaymentAmounts, acceptedScopeSnapshot } from "./msa-draft";

export interface JobForm {
  id: string;
  title: string;
  required: boolean;
  status: "Not started" | "Started" | "Complete";
  questions: Array<{
    id: string;
    label: string;
    required: boolean;
    answer: string;
  }>;
  completedAt?: string;
  completedBy?: string;
}
export interface JobAppointment {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  technician: string;
  status:
    "Scheduled" | "Dispatched" | "Arrived" | "Paused" | "Done" | "Canceled";
  cancellationReason?: string;
}
export interface JobOperations {
  version: 1;
  forms: JobForm[];
  appointments: JobAppointment[];
  invoice: {
    summary: string;
    status: "Draft" | "Finalized";
    paymentTerms: "Collect now" | "On account";
    paymentNotes: string;
    finalizedAt?: string;
    acknowledgement?: {
      name: string;
      at: string;
      capturedBy: string;
      document: string;
    };
    authorization?: {
      name: string;
      at: string;
      capturedBy: string;
      document: string;
    };
  };
  history: Array<{ at: string; by: string; detail: string }>;
}
export const formTemplates = {
  arrival: {
    title: "Arrival checklist",
    questions: [
      "Confirm the scope with the customer",
      "Record existing conditions and site protection",
    ],
  },
  completion: {
    title: "Completion checklist",
    questions: [
      "Confirm the work performed and cleanup",
      "Record the customer walkthrough and outstanding concerns",
    ],
  },
  selections: {
    title: "Customer selections",
    questions: [
      "Selected products, colors, and finishes",
      "Measurements or selections still needed",
    ],
  },
  change: {
    title: "Change documentation",
    questions: ["Requested change and reason", "Effect on price and schedule"],
  },
} as const;
export function makeJobForm(
  template: keyof typeof formTemplates,
  id: string,
  required: boolean,
): JobForm {
  const definition = formTemplates[template];
  return {
    id,
    title: definition.title,
    required,
    status: "Not started",
    questions: definition.questions.map((label, index) => ({
      id: `${id}-${index}`,
      label,
      required: true,
      answer: "",
    })),
  };
}
export function jobOperations(project: Project): JobOperations {
  return structuredClone(
    project.job || {
      version: 1,
      forms: [],
      appointments: [],
      invoice: {
        summary: "",
        status: "Draft",
        paymentTerms: "Collect now",
        paymentNotes: "",
      },
      history: [],
    },
  );
}
export function initialJobOperations(): JobOperations {
  return {
    version: 1,
    forms: [
      makeJobForm("arrival", "arrival", true),
      makeJobForm("completion", "completion", true),
    ],
    appointments: [],
    invoice: {
      summary: "",
      status: "Draft",
      paymentTerms: "Collect now",
      paymentNotes: "",
    },
    history: [],
  };
}
const text = z.string().trim().max(15000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Choose a valid date.",
  );
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const jobActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reschedule-appointment"),
    appointmentId: z.string().max(80),
    date,
    start: time,
    end: time,
    reason: text.min(2),
  }),
  z.object({
    action: z.literal("cancel-appointment"),
    appointmentId: z.string().max(80),
    reason: text.min(2),
  }),
  z.object({
    action: z.literal("add-form"),
    template: z.enum(["arrival", "completion", "selections", "change"]),
    required: z.boolean(),
  }),
  z.object({
    action: z.literal("save-form"),
    formId: z.string().max(80),
    answers: z.record(z.string().max(100), text),
    complete: z.boolean(),
  }),
  z.object({
    action: z.literal("invoice"),
    summary: text,
    paymentTerms: z.enum(["Collect now", "On account"]),
    paymentNotes: text,
  }),
  z.object({ action: z.literal("finalize") }),
  z.object({ action: z.literal("reopen") }),
  z.object({
    action: z.literal("acknowledge"),
    signatureKind: z
      .enum(["authorization", "completion"])
      .default("completion"),
    name: z.string().trim().min(2).max(200),
    consent: z.literal(true),
    document: z.string().max(100000),
  }),
  z.object({
    action: z.literal("add-appointment"),
    title: z.string().trim().min(1).max(200),
    date,
    start: time,
    end: time,
    technician: z.string().trim().min(1).max(200),
  }),
  z.object({
    action: z.literal("appointment"),
    appointmentId: z.string().max(80),
    status: z.enum(["Dispatched", "Arrived", "Paused", "Done"]),
  }),
  z.object({ action: z.literal("complete") }),
]);
export type JobAction = z.input<typeof jobActionSchema>;
export function invoiceDocument(project: Project, scope: ScopeItem[]) {
  const invoice = jobOperations(project).invoice;
  return JSON.stringify({
    id: project.id,
    customer: project.client,
    address: project.address,
    invoice: {
      summary: invoice.summary,
      status: invoice.status,
      paymentTerms: invoice.paymentTerms,
      paymentNotes: invoice.paymentNotes,
      finalizedAt: invoice.finalizedAt,
      authorization: invoice.authorization
        ? {
            name: invoice.authorization.name,
            at: invoice.authorization.at,
            capturedBy: invoice.authorization.capturedBy,
            document: invoice.authorization.document,
          }
        : undefined,
    },
    items: scope
      .filter((item) => item.projectId === project.id)
      .map((item) => ({
        id: item.id,
        title: item.title,
        details: item.details || "",
        amount: item.estimate,
        customerVisible: item.customerVisible !== false,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}
export function authorizationDocument(project: Project, scope: ScopeItem[]) {
  return JSON.stringify({
    id: project.id,
    customer: project.client,
    address: project.address,
    items: scope
      .filter((item) => item.projectId === project.id)
      .map((item) => ({
        id: item.id,
        title: item.title,
        details: item.details || "",
        amount: item.estimate,
        customerVisible: item.customerVisible !== false,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}
export function closeoutIssues(project: Project, workspace: Workspace) {
  const operations = jobOperations(project);
  const issues: Array<{
    title: string;
    section: "Forms" | "Invoice" | "Schedule" | "Estimates";
  }> = [];
  for (const form of operations.forms.filter(
    (form) => form.required && form.status !== "Complete",
  ))
    issues.push({ title: `Complete ${form.title}`, section: "Forms" });
  if (operations.invoice.status !== "Finalized")
    issues.push({
      title: "Finalize the invoice and work summary",
      section: "Invoice",
    });
  if (
    !operations.invoice.acknowledgement ||
    operations.invoice.acknowledgement.document !==
      invoiceDocument(project, workspace.scope)
  )
    issues.push({
      title: "Collect the customer invoice acknowledgement",
      section: "Invoice",
    });
  const balance = projectFinances(
    project,
    workspace.scope,
    workspace.activities,
  ).remaining;
  if (
    workspace.scope.some(
      (item) => item.projectId === project.id && item.estimate > 0,
    ) &&
    operations.invoice.authorization?.document !==
      authorizationDocument(project, workspace.scope)
  )
    issues.push({
      title: "Collect the customer work authorization",
      section: "Invoice",
    });
  if (balance > 0 && operations.invoice.paymentTerms === "Collect now")
    issues.push({
      title: "Collect payment or set documented account terms",
      section: "Invoice",
    });
  if (
    balance > 0 &&
    operations.invoice.paymentTerms === "On account" &&
    !operations.invoice.paymentNotes.trim()
  )
    issues.push({
      title: "Record payment terms for the outstanding balance",
      section: "Invoice",
    });
  if (
    !operations.appointments.some(
      (appointment) => appointment.status === "Done",
    ) ||
    operations.appointments.some(
      (appointment) => !["Done", "Canceled"].includes(appointment.status),
    )
  )
    issues.push({
      title: operations.appointments.length
        ? "Finish the remaining appointments"
        : "Book and complete an appointment",
      section: "Schedule",
    });
  if (
    workspace.tasks.some(
      (task) => task.projectId === project.id && task.status !== "Done",
    )
  )
    issues.push({
      title: "Finish remaining scheduled work",
      section: "Schedule",
    });
  if (
    (workspace.quotes || []).some(
      (quote) =>
        quote.jobId === project.id &&
        quote.status === "Accepted" &&
        !quote.bookedJobId,
    )
  )
    issues.push({
      title: "Book the sold estimate before closeout",
      section: "Estimates",
    });
  for (const quote of (workspace.quotes || []).filter(
    (quote) =>
      quote.jobId === project.id && !quote.junkedAt && !quote.bookedJobId,
  )) {
    if (
      !workspace.scope.some((item) => item.projectId === quote.id) &&
      !workspace.attachments.some((file) => file.projectId === quote.id)
    )
      issues.push({
        title: `Remove or finish empty estimate ${quote.name}`,
        section: "Estimates",
      });
  }
  return issues;
}
export function appointmentConflict(
  project: Project,
  workspace: Workspace,
  appointment: Pick<JobAppointment, "date" | "start" | "end" | "technician">,
  excludingId = "",
) {
  const crew = appointment.technician.trim().toLowerCase();
  for (const job of workspace.projects) {
    if (job.recordType === "project" || job.status === "Completed") continue;
    const appointments =
      job.id === project.id
        ? jobOperations(project).appointments
        : jobOperations(job).appointments;
    const conflict = appointments.find(
      (other) =>
        !(job.id === project.id && other.id === excludingId) &&
        !["Done", "Canceled"].includes(other.status) &&
        other.date === appointment.date &&
        other.technician.trim().toLowerCase() === crew &&
        other.start < appointment.end &&
        other.end > appointment.start,
    );
    if (conflict)
      return `${appointment.technician} already has ${conflict.title} on ${appointment.date} at ${conflict.start}–${conflict.end}. Choose another time or crew.`;
  }
  return "";
}

export function applyJobAction(
  project: Project,
  workspace: Workspace,
  input: JobAction,
  actor: { name: string },
  now: string,
  id: string,
  timezone = workTimeZone,
): Project {
  const action = jobActionSchema.parse(input);
  if (project.recordType === "project")
    throw new Error("Open a job within this project.");
  if (project.status === "Completed")
    throw new Error("Reopen the job before changing its operational records.");
  const next = { ...project, job: jobOperations(project), updatedAt: now };
  const operations = next.job;
  let detail = "";
  switch (action.action) {
    case "add-form":
      if (operations.forms.length >= 50)
        throw new Error("A job supports up to 50 forms.");
      if (operations.invoice.acknowledgement)
        throw new Error("Reopen the invoice before adding forms.");
      operations.forms.push(makeJobForm(action.template, id, action.required));
      detail = `Added ${formTemplates[action.template].title}`;
      break;
    case "save-form": {
      if (
        action.complete &&
        !operations.appointments.some((appointment) =>
          ["Arrived", "Done"].includes(appointment.status),
        )
      )
        throw new Error(
          "Arrive at an appointment before completing field forms. Save a draft until then.",
        );
      const form = operations.forms.find((form) => form.id === action.formId);
      if (!form) throw new Error("Form not found.");
      if (form.status === "Complete")
        throw new Error(
          "Completed forms are retained as the submitted record.",
        );
      form.questions = form.questions.map((question) => ({
        ...question,
        answer: action.answers[question.id] ?? question.answer,
      }));
      if (
        action.complete &&
        form.questions.some(
          (question) => question.required && !question.answer.trim(),
        )
      )
        throw new Error("Answer all required form questions.");
      form.status = action.complete ? "Complete" : "Started";
      if (action.complete) {
        form.completedAt = now;
        form.completedBy = actor.name;
      }
      detail = `${action.complete ? "Completed" : "Saved draft of"} ${form.title}`;
      break;
    }
    case "invoice":
      if (operations.invoice.status === "Finalized")
        throw new Error("Reopen the invoice before editing it.");
      operations.invoice = {
        summary: action.summary,
        paymentTerms: action.paymentTerms,
        paymentNotes: action.paymentNotes,
        status: "Draft",
        authorization: operations.invoice.authorization,
      };
      detail = "Updated invoice summary and payment terms";
      break;
    case "finalize":
      if (
        operations.invoice.paymentTerms === "On account" &&
        projectFinances(project, workspace.scope, workspace.activities)
          .remaining > 0 &&
        !operations.invoice.paymentNotes.trim()
      )
        throw new Error(
          "Record payment terms for the outstanding balance before finalizing.",
        );
      if (!operations.invoice.summary.trim())
        throw new Error("Enter the work performed in the invoice summary.");
      operations.invoice.status = "Finalized";
      operations.invoice.finalizedAt = now;
      delete operations.invoice.acknowledgement;
      detail = "Finalized invoice";
      break;
    case "reopen":
      operations.invoice.status = "Draft";
      delete operations.invoice.finalizedAt;
      delete operations.invoice.acknowledgement;
      detail = "Reopened invoice; a new customer acknowledgement is required";
      break;
    case "acknowledge":
      if (action.signatureKind === "authorization") {
        if (action.document !== authorizationDocument(project, workspace.scope))
          throw new Error(
            "The work scope changed. Review it again before signing.",
          );
        operations.invoice.authorization = {
          name: action.name,
          at: now,
          capturedBy: actor.name,
          document: action.document,
        };
        delete operations.invoice.acknowledgement;
        detail = `Work authorized by ${action.name}`;
        break;
      }
      if (operations.invoice.status !== "Finalized")
        throw new Error(
          "Finalize the invoice before collecting an acknowledgement.",
        );
      if (action.document !== invoiceDocument(project, workspace.scope))
        throw new Error("The invoice changed. Review it again before signing.");
      operations.invoice.acknowledgement = {
        name: action.name,
        at: now,
        capturedBy: actor.name,
        document: action.document,
      };
      detail = `Invoice acknowledged by ${action.name}`;
      break;
    case "reschedule-appointment": {
      const appointment = operations.appointments.find(
        (item) => item.id === action.appointmentId,
      );
      if (!appointment || appointment.status !== "Scheduled")
        throw new Error(
          "Only a scheduled visit can be rescheduled. Retain started visits and book a return appointment.",
        );
      if (action.end <= action.start)
        throw new Error("The appointment end must follow its start.");
      const conflict = appointmentConflict(
        project,
        workspace,
        { ...appointment, ...action },
        appointment.id,
      );
      if (conflict) throw new Error(conflict);
      detail = `Rescheduled ${appointment.title} from ${appointment.date} ${appointment.start}–${appointment.end} to ${action.date} ${action.start}–${action.end}: ${action.reason}`;
      appointment.date = action.date;
      appointment.start = action.start;
      appointment.end = action.end;
      break;
    }
    case "add-appointment":
      if (action.end <= action.start)
        throw new Error("The appointment end must follow its start.");
      {
        const conflict = appointmentConflict(project, workspace, action);
        if (conflict) throw new Error(conflict);
      }
      if (operations.appointments.length >= 100)
        throw new Error("A job supports up to 100 appointments.");
      operations.appointments.push({
        id,
        title: action.title,
        date: action.date,
        start: action.start,
        end: action.end,
        technician: action.technician,
        status: "Scheduled",
      });
      detail = `Scheduled ${action.title}`;
      break;
    case "appointment": {
      const appointment = operations.appointments.find(
        (item) => item.id === action.appointmentId,
      );
      if (!appointment) throw new Error("Appointment not found.");
      const allowed: Record<JobAppointment["status"], string[]> = {
        Scheduled: ["Dispatched"],
        Dispatched: ["Arrived"],
        Arrived: ["Paused", "Done"],
        Paused: ["Dispatched"],
        Done: [],
        Canceled: [],
      };
      if (!allowed[appointment.status].includes(action.status))
        throw new Error("This appointment transition is not available.");
      appointment.status = action.status;
      detail = `${appointment.title}: ${action.status}`;
      break;
    }
    case "cancel-appointment": {
      const appointment = operations.appointments.find(
        (item) => item.id === action.appointmentId,
      );
      if (
        !appointment ||
        ["Done", "Canceled", "Arrived"].includes(appointment.status)
      )
        throw new Error(
          "Pause an active appointment before canceling it. Completed visits are retained.",
        );
      appointment.status = "Canceled";
      appointment.cancellationReason = action.reason;
      detail = `Canceled ${appointment.title}: ${action.reason}`;
      break;
    }
    case "complete": {
      const issues = closeoutIssues(project, workspace);
      if (issues.length)
        throw new Error(issues.map((issue) => issue.title).join(". "));
      next.status = "Completed";
      next.completedDate = workToday(new Date(now), timezone);
      detail = "Completed job";
      break;
    }
  }
  operations.history = [
    { at: now, by: actor.name, detail },
    ...operations.history,
  ].slice(0, 200);
  return next;
}
export function estimateBookingIssue(quote: Quote, workspace: Workspace) {
  if (quote.bookedJobId) return "This estimate is already booked.";
  if (
    quote.status !== "Accepted" ||
    !quoteAcceptanceSchema.safeParse(quote.quoteAcceptance).success ||
    !quote.acceptedQuoteScope?.length
  )
    return "Collect the customer estimate signature first.";
  const agreement = quote.msaAgreement;
  if (
    agreement?.status !== "signed" ||
    !agreement.customerSignature ||
    !agreement.staffSignature ||
    !agreement.termsSha256
  )
    return "Complete the signed services agreement first.";
  const total = quote.acceptedQuoteScope.reduce(
    (sum, item) => sum + Math.round(item.amount * 100),
    0,
  );
  if (
    total !== Math.round((quote.contractPrice || 0) * 100) ||
    total !== Math.round(agreement.price * 100) ||
    JSON.stringify(quote.acceptedQuoteScope) !== JSON.stringify(agreement.scope)
  )
    return "The signed scope and agreement must match.";
  const normalized = (items: NonNullable<Quote["acceptedQuoteScope"]>) =>
    items
      .map((item) =>
        JSON.stringify({
          section: item.section,
          title: item.title,
          details: item.details,
          amount: item.amount,
          customerVisible: item.customerVisible !== false,
        }),
      )
      .sort();
  if (
    JSON.stringify(
      normalized(
        acceptedScopeSnapshot(
          workspace.scope.filter((item) => item.projectId === quote.id),
          quote.category,
        ),
      ),
    ) !== JSON.stringify(normalized(quote.acceptedQuoteScope))
  )
    return "The saved estimate items differ from the signed scope. Ask the office to review the record.";
  const deposit = Math.round(
    (msaPaymentAmounts(agreement.price, agreement.paymentSchedule)[0] || 0) *
      100,
  );
  const paid = (workspace.activities || [])
    .filter(
      (activity) =>
        activity.projectId === quote.id &&
        activity.activityType === "Payment received",
    )
    .reduce(
      (sum, activity) => sum + Math.round((activity.amount || 0) * 100),
      0,
    );
  if (deposit <= 0 || paid < deposit)
    return "Receive the required agreement deposit before booking.";
  return "";
}
