import { z } from "zod";
import {
  apiError,
  appOrigin,
  checkOriginOrBearer,
  HttpError,
  limitAttempts,
  requireRequestUser,
} from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { doorVisitOutcomes } from "@/lib/types";
import { workToday } from "@/lib/work";
import { syncOrganizationGoogleCalendars } from "@/lib/google-calendar";
import { after } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^$|^(?:[01]\d|2[0-3]):[0-5]\d$/);
const inputSchema = z
  .object({
    address: z.string().trim().min(1).max(250),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    visitedAt: z.iso.datetime(),
    outcome: z.enum(doorVisitOutcomes),
    notes: z.string().trim().max(4000).default(""),
    createLead: z.boolean().default(false),
    firstName: z.string().trim().max(100).default(""),
    lastName: z.string().trim().max(100).default(""),
    email: z.union([z.email().max(250), z.literal("")]).default(""),
    phone: z.string().trim().max(30).default(""),
    zip: z.string().trim().max(10).default(""),
    project: z.string().trim().max(100).default(""),
    projectDescription: z.string().trim().max(1000).default(""),
    scheduleQuote: z.boolean().default(false),
    quoteDate: z.union([date, z.literal("")]).default(""),
    quoteStartTime: time.default(""),
    quoteEndTime: time.default(""),
    quoteNotes: z.string().trim().max(1000).default(""),
  })
  .superRefine((data, ctx) => {
    if (Date.parse(data.visitedAt) > Date.now() + 5 * 60_000)
      ctx.addIssue({
        code: "custom",
        path: ["visitedAt"],
        message: "Visit time cannot be in the future.",
      });
    if (!data.createLead) return;
    if (!data.firstName)
      ctx.addIssue({
        code: "custom",
        path: ["firstName"],
        message: "Enter the homeowner’s first name.",
      });
    if (!data.phone && !data.email)
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Add a phone number or email for the lead.",
      });
    if (data.phone && data.phone.replace(/\D/g, "").length < 10)
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Enter a valid phone number.",
      });
    if (!data.project)
      ctx.addIssue({
        code: "custom",
        path: ["project"],
        message: "Choose the type of work they are interested in.",
      });
    if (data.projectDescription.length < 10)
      ctx.addIssue({
        code: "custom",
        path: ["projectDescription"],
        message: "Add a short description of the requested work.",
      });
    if (data.scheduleQuote && (!data.quoteDate || !data.quoteStartTime))
      ctx.addIssue({
        code: "custom",
        path: ["quoteDate"],
        message: "Choose a date and start time for the consultation.",
      });
    if (data.scheduleQuote && data.quoteDate && data.quoteDate < workToday())
      ctx.addIssue({
        code: "custom",
        path: ["quoteDate"],
        message: "Consultations cannot be scheduled in the past.",
      });
    if (
      data.scheduleQuote &&
      data.quoteEndTime &&
      data.quoteEndTime <= data.quoteStartTime
    )
      ctx.addIssue({
        code: "custom",
        path: ["quoteEndTime"],
        message: "The end time must be later than the start time.",
      });
  });

export async function POST(request: Request) {
  try {
    checkOriginOrBearer(request);
    const user = await requireRequestUser(request);
    const data = inputSchema.parse(await request.json());
    await limitAttempts(`door-visit:${user.id}`, 120);
    if (Date.parse(data.visitedAt) < Date.now() - 366 * 24 * 60 * 60_000)
      throw new HttpError(400, "Visit time must be within the last year.");
    const { data: created, error } = await supabaseAdmin().rpc(
      "remodel_create_door_visit",
      {
        p_organization: user.organizationId,
        p_actor: user.id,
        p_address: data.address,
        p_latitude: data.latitude,
        p_longitude: data.longitude,
        p_visited_at: data.visitedAt,
        p_outcome: data.outcome,
        p_notes: data.notes,
        p_first_name: data.createLead ? data.firstName : null,
        p_last_name: data.createLead ? data.lastName : null,
        p_email: data.createLead ? data.email.toLowerCase() : null,
        p_phone: data.createLead ? data.phone : null,
        p_zip: data.createLead ? data.zip : null,
        p_project: data.createLead ? data.project : null,
        p_project_description: data.createLead ? data.projectDescription : null,
        p_quote_date:
          data.createLead && data.scheduleQuote ? data.quoteDate : null,
        p_quote_start_time:
          data.createLead && data.scheduleQuote ? data.quoteStartTime : null,
        p_quote_end_time:
          data.createLead && data.scheduleQuote ? data.quoteEndTime : null,
        p_quote_notes:
          data.createLead && data.scheduleQuote ? data.quoteNotes : null,
      },
    );
    if (error) throw error;
    if (!created?.visit) throw new Error("The saved visit was not returned.");
    if (data.createLead && data.scheduleQuote) {
      const origin = appOrigin(request);
      after(() =>
        syncOrganizationGoogleCalendars(user.organizationId, origin).catch(
          (syncError) =>
            console.error(
              "Automatic Google Calendar sync failed",
              syncError instanceof Error ? syncError.name : "CalendarSyncError",
            ),
        ),
      );
    }
    return Response.json(created, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
