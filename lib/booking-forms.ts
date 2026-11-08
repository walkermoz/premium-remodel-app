import "server-only";

import { randomUUID } from "node:crypto";
import { HttpError, type WorkspaceUser } from "./auth";
import {
  availableBookingSlots,
  bookingFormInputSchema,
  type BookingFormDefinition,
  type BookingFormInput,
  type BookingService,
  type BookingSlot,
} from "./booking-types";
import { supabaseAdmin } from "./supabase/server";

export async function getBookingForm(organizationId: string) {
  const { data, error } = await supabaseAdmin()
    .from("remodel_records")
    .select("data")
    .eq("organization_id", organizationId)
    .eq("kind", "booking_form")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.data as BookingFormDefinition | undefined) || null;
}

export async function getPublicBookingForm(publicToken: string) {
  if (!/^[0-9a-f-]{36}$/i.test(publicToken)) return null;
  const { data, error } = await supabaseAdmin()
    .from("remodel_records")
    .select("data")
    .eq("kind", "booking_form")
    .eq("data->>publicToken", publicToken)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const form = data?.data as BookingFormDefinition | undefined;
  return form?.enabled ? form : null;
}

export async function saveBookingForm(
  user: WorkspaceUser,
  raw: BookingFormInput,
) {
  const input = bookingFormInputSchema.parse(raw);
  const current = await getBookingForm(user.organizationId);
  if (current && input.revision !== current.revision)
    throw new HttpError(
      409,
      "This booking form changed in another session. Refresh and try again.",
    );
  const now = new Date().toISOString();
  const form: BookingFormDefinition = {
    ...input,
    id: current?.id || input.id || randomUUID(),
    publicToken: current?.publicToken || randomUUID(),
    organizationId: user.organizationId,
    revision: (current?.revision || 0) + 1,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };
  const { error } = await supabaseAdmin()
    .from("remodel_records")
    .upsert({
      id: form.id,
      organization_id: user.organizationId,
      created_by: current ? undefined : user.id,
      updated_by: user.id,
      kind: "booking_form",
      project_id: null,
      data: form,
      updated_at: now,
    });
  if (error) throw error;
  return form;
}

export async function bookingSlots(
  form: BookingFormDefinition,
  service: BookingService,
  date: string,
) {
  const { data, error } = await supabaseAdmin()
    .from("remodel_records")
    .select("kind,data")
    .eq("organization_id", form.organizationId)
    .in("kind", ["lead", "schedule_entry"]);
  if (error) throw error;
  const busy: BookingSlot[] = [];
  for (const row of data || []) {
    const entry = row.data as {
      quoteDate?: string;
      quoteStartTime?: string;
      quoteEndTime?: string;
      date?: string;
      start?: string;
      end?: string;
    };
    const entryDate = entry.date || entry.quoteDate;
    const start = entry.start || entry.quoteStartTime;
    const end = entry.end || entry.quoteEndTime;
    if (entryDate !== date || !start) continue;
    busy.push({
      start,
      end: end || start,
    });
  }
  return availableBookingSlots({ form, service, date, busy });
}
