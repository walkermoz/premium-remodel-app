import { expect, test } from "@playwright/test";
import {
  availableBookingSlots,
  type BookingFormInput,
} from "../lib/booking-types";

const form: BookingFormInput = {
  revision: 0,
  name: "Consultations",
  intro: "",
  enabled: true,
  mode: "reserve",
  services: [
    {
      id: "3eb94aa0-3e63-4c48-87bf-da98278077bc",
      name: "Estimate",
      durationMinutes: 60,
    },
  ],
  weekdays: [1],
  dayStart: "09:00",
  dayEnd: "12:00",
  slotIntervalMinutes: 30,
  leadTimeHours: 24,
  bookingWindowDays: 30,
  serviceAreaZips: [],
};

test("booking availability omits overlaps and respects service duration", () => {
  expect(
    availableBookingSlots({
      form,
      service: form.services[0],
      date: "2026-11-09",
      busy: [{ start: "10:00", end: "11:00" }],
    }),
  ).toEqual([
    { start: "09:00", end: "10:00" },
    { start: "11:00", end: "12:00" },
  ]);
});

test("booking availability closes on disabled weekdays", () => {
  expect(
    availableBookingSlots({
      form,
      service: form.services[0],
      date: "2026-11-10",
      busy: [],
    }),
  ).toEqual([]);
});
