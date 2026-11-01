import { expect, test } from "@playwright/test";
import { businessConfigSchema } from "@/lib/business-config-schema";
import { workToday } from "@/lib/work";

test("organization time zone determines the current work date", () => {
  const instant = new Date("2026-11-01T04:30:00.000Z");
  expect(workToday(instant, "America/New_York")).toBe("2026-11-01");
  expect(workToday(instant, "America/Los_Angeles")).toBe("2026-10-31");
});

test("business configuration rejects unknown time zones", () => {
  expect(
    businessConfigSchema.shape.regional.safeParse({
      country: "US",
      currency: "USD",
      locale: "en-US",
      timezone: "Not/A_Time_Zone",
      serviceArea: "",
    }).success,
  ).toBe(false);
});
