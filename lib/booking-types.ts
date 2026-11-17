import { z } from "zod";

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const bookingServiceSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  durationMinutes: z.number().int().min(30).max(480).multipleOf(15),
});

export const bookingFormInputSchema = z
  .object({
    id: z.uuid().optional(),
    revision: z.number().int().nonnegative().default(0),
    name: z.string().trim().min(1).max(100),
    intro: z.string().trim().max(600).default(""),
    enabled: z.boolean().default(false),
    mode: z.enum(["request", "reserve"]).default("request"),
    services: z.array(bookingServiceSchema).min(1).max(12),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    dayStart: time,
    dayEnd: time,
    slotIntervalMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    leadTimeHours: z.number().int().min(0).max(336),
    bookingWindowDays: z.number().int().min(1).max(120),
    serviceAreaZips: z
      .array(z.string().regex(/^\d{5}$/))
      .max(200)
      .default([]),
  })
  .refine((value) => value.dayEnd > value.dayStart, {
    path: ["dayEnd"],
    message: "Availability must end after it starts.",
  });

export type BookingFormInput = z.infer<typeof bookingFormInputSchema>;
export type BookingService = z.infer<typeof bookingServiceSchema>;

export interface BookingFormDefinition extends BookingFormInput {
  id: string;
  publicToken: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookingSlot {
  start: string;
  end: string;
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function clock(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function availableBookingSlots({
  form,
  service,
  date,
  busy,
}: {
  form: BookingFormInput;
  service: BookingService;
  date: string;
  busy: BookingSlot[];
}) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (!form.weekdays.includes(day)) return [];
  const open = minutes(form.dayStart);
  const close = minutes(form.dayEnd);
  const duration = service.durationMinutes;
  const slots: BookingSlot[] = [];
  for (
    let start = open;
    start + duration <= close;
    start += form.slotIntervalMinutes
  ) {
    const end = start + duration;
    const overlaps = busy.some(
      (item) => start < minutes(item.end) && end > minutes(item.start),
    );
    if (!overlaps) slots.push({ start: clock(start), end: clock(end) });
  }
  return slots;
}

export const publicBookingInputSchema = z
  .object({
    submissionId: z.uuid(),
    serviceId: z.uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start: time,
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().max(100).default(""),
    email: z.union([z.email().max(250), z.literal("")]).default(""),
    phone: z.string().trim().max(30).default(""),
    address: z.string().trim().max(250).default(""),
    zip: z
      .string()
      .trim()
      .regex(/^\d{5}$/),
    details: z.string().trim().max(5000).default(""),
    smsAppointmentOptIn: z.boolean().default(false),
  })
  .refine((value) => Boolean(value.email || value.phone), {
    path: ["email"],
    message: "Enter an email address or phone number.",
  });
