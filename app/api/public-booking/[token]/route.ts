import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { apiError, HttpError, limitAttempts } from "@/lib/auth";
import { getWebsiteLeadAutomation } from "@/lib/automation-store";
import { bookingSlots, getPublicBookingForm } from "@/lib/booking-forms";
import { publicBookingInputSchema } from "@/lib/booking-types";
import { getBusinessConfigForOrganization } from "@/lib/business-config";
import { websiteSmsConsentEvidence } from "@/lib/sms-consent";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Contact, Lead } from "@/lib/types";
import { workToday } from "@/lib/work";
import { processWorkflowEvent } from "@/lib/workflows/engine";
import { createWorkflowEvent } from "@/lib/workflows/events";

export const runtime = "nodejs";
export const maxDuration = 60;

function noStore(payload: unknown, init?: ResponseInit) {
  const response = Response.json(payload, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function zonedNowValue(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: string) =>
    Number(parts.find((item) => item.type === type)?.value || 0);
  return Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
  );
}

function afterLeadTime(
  date: string,
  start: string,
  timeZone: string,
  leadTimeHours: number,
) {
  return (
    Date.parse(`${date}T${start}:00Z`) >=
    zonedNowValue(timeZone) + leadTimeHours * 60 * 60_000
  );
}

function scheduleEntryId(organizationId: string, date: string, start: string) {
  const hex = createHash("sha256")
    .update(`${organizationId}:${date}:${start}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function scheduleMarkers(start: string, end: string) {
  const toMinutes = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  };
  const markers: string[] = [];
  for (let minute = toMinutes(start); minute < toMinutes(end); minute += 15)
    markers.push(
      `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
    );
  return markers;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const form = await getPublicBookingForm(token);
    if (!form) throw new HttpError(404, "This booking page is not available.");
    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    const serviceId = url.searchParams.get("serviceId");
    if (date || serviceId) {
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !serviceId)
        throw new HttpError(400, "Choose a service and date.");
      const service = form.services.find((item) => item.id === serviceId);
      if (!service) throw new HttpError(400, "Choose an available service.");
      const business = await getBusinessConfigForOrganization(
        form.organizationId,
      );
      const today = workToday(new Date(), business.regional.timezone);
      const end = new Date(`${today}T12:00:00Z`);
      end.setUTCDate(end.getUTCDate() + form.bookingWindowDays);
      if (date < today || date > end.toISOString().slice(0, 10))
        throw new HttpError(400, "Choose a date in the booking window.");
      const slots = (await bookingSlots(form, service, date)).filter((slot) =>
        afterLeadTime(
          date,
          slot.start,
          business.regional.timezone,
          form.leadTimeHours,
        ),
      );
      return noStore({ slots });
    }
    const business = await getBusinessConfigForOrganization(
      form.organizationId,
    );
    return noStore({
      form: {
        name: form.name,
        intro: form.intro,
        mode: form.mode,
        services: form.services,
        weekdays: form.weekdays,
        bookingWindowDays: form.bookingWindowDays,
        serviceAreaZips: form.serviceAreaZips,
      },
      business: {
        name: business.profile.name,
        phone: business.profile.phone,
        email: business.profile.email,
        smsReady: Boolean(
          business.compliance.smsPolicyVersion &&
          business.compliance.privacyUrl &&
          business.compliance.termsUrl,
        ),
        privacyUrl: business.compliance.privacyUrl,
        termsUrl: business.compliance.termsUrl,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const form = await getPublicBookingForm(token);
    if (!form) throw new HttpError(404, "This booking page is not available.");
    const input = publicBookingInputSchema.parse(await request.json());
    const service = form.services.find((item) => item.id === input.serviceId);
    if (!service) throw new HttpError(400, "Choose an available service.");
    if (
      form.serviceAreaZips.length &&
      !form.serviceAreaZips.includes(input.zip)
    )
      throw new HttpError(400, "This ZIP code is outside the service area.");
    const forwarded =
      request.headers.get("x-vercel-forwarded-for") ||
      request.headers.get("x-forwarded-for") ||
      "unknown";
    await Promise.all([
      limitAttempts(
        `public-booking:ip:${forwarded.split(",")[0].trim().slice(0, 80)}`,
        12,
      ),
      ...(input.email
        ? [
            limitAttempts(
              `public-booking:email:${input.email.toLowerCase()}`,
              4,
            ),
          ]
        : []),
    ]);
    const business = await getBusinessConfigForOrganization(
      form.organizationId,
    );
    const today = workToday(new Date(), business.regional.timezone);
    const lastDate = new Date(`${today}T12:00:00Z`);
    lastDate.setUTCDate(lastDate.getUTCDate() + form.bookingWindowDays);
    if (input.date < today || input.date > lastDate.toISOString().slice(0, 10))
      throw new HttpError(400, "Choose a date in the booking window.");
    const slots = (await bookingSlots(form, service, input.date)).filter(
      (slot) =>
        afterLeadTime(
          input.date,
          slot.start,
          business.regional.timezone,
          form.leadTimeHours,
        ),
    );
    const slot = slots.find((item) => item.start === input.start);
    if (!slot) throw new HttpError(409, "That time is no longer available.");
    const existing = await supabaseAdmin()
      .from("remodel_records")
      .select("id,data")
      .eq("organization_id", form.organizationId)
      .eq("kind", "lead")
      .eq("id", input.submissionId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return noStore({ received: true, duplicate: true });

    const now = new Date().toISOString();
    const phoneDigits = input.phone.replace(/\D/g, "");
    const phone = phoneDigits
      ? `+${phoneDigits.length === 10 ? `1${phoneDigits}` : phoneDigits}`
      : "";
    if (phone && !/^\+[1-9]\d{9,14}$/.test(phone))
      throw new HttpError(400, "Enter a valid phone number.");
    const name = `${input.firstName} ${input.lastName}`.trim();
    const automation = await getWebsiteLeadAutomation(form.organizationId);
    const contact: Contact = {
      id: randomUUID(),
      firstName: input.firstName,
      lastName: input.lastName,
      name,
      email: input.email.toLowerCase(),
      phone,
      address: input.address,
      zip: input.zip,
      source: "Online booking",
      createdAt: now,
      updatedAt: now,
    };
    const smsReady = Boolean(
      business.compliance.smsPolicyVersion &&
      business.compliance.privacyUrl &&
      business.compliance.termsUrl,
    );
    if (input.smsAppointmentOptIn && !smsReady)
      throw new HttpError(400, "Text consent is not configured.");
    const lead: Lead = {
      id: input.submissionId,
      contactId: contact.id,
      name,
      project: service.name,
      projectDescription: input.details,
      status: automation.initialStage,
      disposition: automation.initialDisposition,
      approvalState: "none",
      smsAppointmentOptIn: input.smsAppointmentOptIn,
      smsMarketingOptIn: false,
      ...(input.smsAppointmentOptIn
        ? {
            smsConsentEvidence: websiteSmsConsentEvidence(
              {
                capturedAt: now,
                origin: new URL(request.url).origin,
                appointment: true,
                marketing: false,
              },
              {
                source: `${business.profile.name} online booking`,
                policyVersion: business.compliance.smsPolicyVersion,
                privacyUrl: business.compliance.privacyUrl,
                termsUrl: business.compliance.termsUrl,
              },
            ),
          }
        : {}),
      otherSubmittedFields: {
        bookingForm: form.name,
        bookingMode: form.mode,
        serviceDurationMinutes: String(service.durationMinutes),
      },
      source: "Online booking",
      submittedAt: now,
      quoteDate: input.date,
      quoteStartTime: slot.start,
      quoteEndTime: slot.end,
      quoteNotes:
        form.mode === "request"
          ? "Requested online; confirm with customer."
          : "Reserved online.",
      createdAt: now,
      updatedAt: now,
    };
    const event = createWorkflowEvent({
      organizationId: form.organizationId,
      type: "website.form.submitted",
      objectType: "lead",
      objectId: lead.id,
      actor: { type: "contact", name },
      occurredAt: now,
      idempotencyKey: `online-booking:${lead.id}`,
      payload: {
        firstName: input.firstName,
        lastName: input.lastName,
        name,
        email: contact.email,
        phone,
        zip: input.zip,
        address: input.address,
        project: service.name,
        description: input.details,
        smsAppointmentOptIn: input.smsAppointmentOptIn,
        smsMarketingOptIn: false,
        smsConsentEvidence: lead.smsConsentEvidence,
        otherSubmittedFields: lead.otherSubmittedFields,
        booking: {
          date: input.date,
          start: slot.start,
          end: slot.end,
          mode: form.mode,
        },
      },
    });
    const admin = supabaseAdmin();
    const entryIds = scheduleMarkers(slot.start, slot.end).map((marker) =>
      scheduleEntryId(form.organizationId, input.date, marker),
    );
    const { error: reserveError } = await admin.from("remodel_records").insert(
      entryIds.map((entryId) => ({
        id: entryId,
        organization_id: form.organizationId,
        created_by: null,
        updated_by: null,
        kind: "schedule_entry",
        project_id: null,
        data: {
          id: entryId,
          leadId: lead.id,
          formId: form.id,
          serviceId: service.id,
          date: input.date,
          start: slot.start,
          end: slot.end,
          state: form.mode === "reserve" ? "reserved" : "requested",
          createdAt: now,
          updatedAt: now,
        },
        updated_at: now,
      })),
    );
    if (reserveError?.code === "23505")
      throw new HttpError(409, "That time was just booked. Choose another.");
    if (reserveError) throw reserveError;
    const { data: capture, error } = await admin
      .rpc("remodel_capture_workflow_website_lead", {
        p_organization_id: form.organizationId,
        p_contact: contact,
        p_lead: lead,
        p_match_existing: automation.matchExistingContacts,
        p_event: event,
      })
      .single();
    if (error) {
      await admin
        .from("remodel_records")
        .delete()
        .eq("organization_id", form.organizationId)
        .eq("kind", "schedule_entry")
        .in("id", entryIds);
      throw error;
    }
    const eventId = z.object({ eventId: z.string() }).parse(capture).eventId;
    try {
      await processWorkflowEvent(eventId, { mode: "execute" });
    } catch (workflowError) {
      console.error("Online booking workflow will retry.", workflowError);
    }
    return noStore(
      {
        received: true,
        booking: {
          date: input.date,
          start: slot.start,
          end: slot.end,
          mode: form.mode,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
