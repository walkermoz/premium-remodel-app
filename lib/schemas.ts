import { z } from "zod";
import {
  workTypes,
  activityTypes,
  quoteStatuses,
  alertAudiences,
  doorVisitOutcomes,
  leadStages,
  leadDispositions,
  leadApprovalStates,
} from "./types";
import { isPayment, paymentMethods } from "./activity";
import { workToday } from "./work";
const short = z.string().trim().max(250);
const text = z.string().trim().max(15000);
const date = z
  .string()
  .refine(
    (s) =>
      s === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(s) &&
        !isNaN(Date.parse(s)) &&
        new Date(s).toISOString().slice(0, 10) === s),
    "Enter a valid date",
  );
const amount = z.number().finite().min(0).max(1_000_000_000);
const taskStatus = z.enum(["To do", "In progress", "Done"]);
const projectFields = {
  name: short.min(1),
  address: short,
  client: short,
  clientEmail: z.union([z.email(), z.literal("")]).optional(),
  clientPhone: short.optional(),
  startDate: date,
  endDate: date,
  description: text,
  category: short,
  cover: z.enum([
    "",
    "/images/kitchen.jpg",
    "/images/bathroom.jpg",
    "/images/basement.jpg",
    "/images/outdoor.jpg",
    "/images/home.jpg",
  ]),
  coverAttachmentId: z.union([z.uuid(), z.literal("")]).optional(),
};
const time = z
  .string()
  .regex(/^$|^(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time")
  .default("");
export const schemas = {
  contact: z.object({
    firstName: short.min(1),
    lastName: short.min(1),
    name: short.min(1),
    email: z.union([z.email().max(250), z.literal("")]),
    phone: short.min(1),
    zip: short,
    address: short.min(1),
    source: short.min(1),
  }),
  lead: z
    .object({
      contactId: z.uuid(),
      name: short.min(1),
      project: short.min(1),
      projectDescription: z.string().trim().max(1000),
      status: z.enum(leadStages),
      disposition: z.enum(leadDispositions).optional(),
      notes: text.optional(),
      nextAction: short.optional(),
      nextActionDue: date.optional(),
      draftReply: text.optional(),
      approvalState: z.enum(leadApprovalStates).optional(),
      dispositionHistory: z
        .array(
          z.object({
            at: z.iso.datetime(),
            byId: short.min(1),
            byName: short.min(1),
            from: z.enum(leadDispositions),
            to: z.enum(leadDispositions),
          }),
        )
        .max(100)
        .optional(),
      source: short.min(1),
      submittedAt: z.iso.datetime(),
      quoteDate: date.optional(),
      quoteStartTime: time.optional(),
      quoteEndTime: time.optional(),
      quoteNotes: text.optional(),
      canvasserId: z.uuid().optional(),
      canvasserName: short.optional(),
    })
    .superRefine((lead, ctx) => {
      if (lead.quoteStartTime && !lead.quoteDate)
        ctx.addIssue({
          code: "custom",
          path: ["quoteDate"],
          message: "Choose a date for the consultation.",
        });
      if (lead.quoteEndTime && !lead.quoteStartTime)
        ctx.addIssue({
          code: "custom",
          path: ["quoteStartTime"],
          message: "Add a start time before an end time.",
        });
      if (
        lead.quoteStartTime &&
        lead.quoteEndTime &&
        lead.quoteEndTime <= lead.quoteStartTime
      )
        ctx.addIssue({
          code: "custom",
          path: ["quoteEndTime"],
          message: "End time must be later than start time.",
        });
    }),
  door_visit: z.object({
    address: short.min(1),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    visitedAt: z.iso.datetime(),
    outcome: z.enum(doorVisitOutcomes),
    notes: text,
    canvasserId: short.min(1),
    canvasserName: short.min(1),
    leadId: z.uuid().optional(),
  }),
  alert: z.object({
    message: z.string().trim().min(1, "Write an alert message.").max(500),
    audiences: z
      .array(z.enum(alertAudiences))
      .min(1, "Choose at least one worker group.")
      .max(alertAudiences.length)
      .refine(
        (items) => new Set(items).size === items.length,
        "Choose each worker group once.",
      ),
    durationMinutes: z
      .number()
      .int()
      .min(1)
      .max(525_600, "Alerts can last up to one year."),
    expiresAt: z.iso.datetime().optional(),
  }),
  quote: z
    .object({
      ...projectFields,
      status: z.enum(quoteStatuses),
      leadId: z.union([z.uuid(), z.literal("")]).optional(),
      outcomeAt: z.iso.datetime().optional(),
    })
    .refine((p) => !p.startDate || !p.endDate || p.endDate >= p.startDate, {
      message: "End date must be on or after start date",
      path: ["endDate"],
    }),
  activity: z
    .object({
      projectId: short.min(1),
      activityType: z.enum(activityTypes),
      actorId: short.min(1),
      occurredAt: z.iso
        .datetime()
        .refine(
          (value) => Date.parse(value) <= Date.now() + 60000,
          "Activity cannot be in the future.",
        ),
      summary: short.min(1),
      notes: text.default(""),
      amount: amount.nullable().default(null),
      party: short.default(""),
      paymentMethod: z.enum(["", ...paymentMethods]).default(""),
      contractorId: short.default(""),
      attachmentIds: z.array(short.min(1)).max(3).default([]),
    })
    .superRefine((item, ctx) => {
      if (isPayment(item.activityType)) {
        if (
          item.amount === null ||
          item.amount <= 0 ||
          Math.abs(item.amount * 100 - Math.round(item.amount * 100)) > 0.00001
        )
          ctx.addIssue({
            code: "custom",
            path: ["amount"],
            message:
              "Enter a payment amount greater than zero with at most two decimal places.",
          });
        if (!item.party)
          ctx.addIssue({
            code: "custom",
            path: ["party"],
            message: "Enter who the payment was received from or paid to.",
          });
      } else if (item.amount !== null || item.paymentMethod)
        ctx.addIssue({
          code: "custom",
          path: ["amount"],
          message:
            "Only payment activities can include an amount or payment method.",
        });
    }),
  project: z
    .object({
      ...projectFields,
      completedDate: date.default(""),
      status: z.enum(["Planning", "In progress", "On hold", "Completed"]),
    })
    .refine((p) => !p.startDate || !p.endDate || p.endDate >= p.startDate, {
      message: "End date must be on or after start date",
      path: ["endDate"],
    })
    .refine(
      (p) => !p.completedDate || !p.startDate || p.completedDate >= p.startDate,
      {
        message: "Completion date must be on or after start date",
        path: ["completedDate"],
      },
    )
    .refine((p) => !p.completedDate || p.completedDate <= workToday(), {
      message: "Completion date cannot be in the future",
      path: ["completedDate"],
    }),
  task: z
    .object({
      projectId: short.min(1),
      title: short.min(1),
      description: text,
      contractorId: short,
      dueDate: date,
      workType: z.enum(workTypes).default("Task"),
      startTime: time,
      endTime: time,
      priority: z.enum(["Low", "Medium", "High"]),
      status: taskStatus,
    })
    .superRefine((task, ctx) => {
      if (task.startTime && !task.dueDate)
        ctx.addIssue({
          code: "custom",
          path: ["dueDate"],
          message: "Choose a date before adding a start time.",
        });
      if (task.endTime && !task.startTime)
        ctx.addIssue({
          code: "custom",
          path: ["startTime"],
          message: "Add a start time before an end time.",
        });
      if (task.startTime && task.endTime && task.endTime <= task.startTime)
        ctx.addIssue({
          code: "custom",
          path: ["endTime"],
          message: "End time must be later than start time on the same day.",
        });
    }),
  contractor: z.object({
    name: short.min(1),
    company: short,
    trade: short,
    email: z.union([z.email(), z.literal("")]),
    phone: short,
    notes: text,
  }),
  scope: z.object({
    projectId: short.min(1),
    title: short.min(1),
    quantity: z.number().min(0).max(1_000_000_000),
    unit: short,
    estimate: amount,
    subCost: amount,
    materialCost: amount.default(0),
    contractorId: short,
    status: taskStatus,
  }),
  comment: z
    .object({
      projectId: short.min(1),
      body: text,
      attachmentIds: z.array(short.min(1)).max(3).default([]),
    })
    .refine(
      (note) => !!note.body || note.attachmentIds.length > 0,
      "Write a note or attach a file.",
    ),
};
