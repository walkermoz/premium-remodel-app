import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { test, expect, password } from "./supabase-fixture";
import { buildDiscordLeadMessage } from "@/lib/discord-leads";
import { parseWebsiteLead } from "@/lib/website-lead-input";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const websiteOrigin = "https://www.premiumremodel.com";
const payload = {
  first_name: "Jordan",
  last_name: "Lee",
  email: "jordan.lead@example.com",
  phone: "+19195550123",
  zip: "27513",
  address: "1214 Willowbrook Drive, Cary, NC",
  project: "Kitchen Remodel",
  project_description:
    "We would like new cabinets, countertops, lighting, and flooring while keeping the current layout.",
};

test("website lead intake keeps validated attribution separate from unknown fields", () => {
  const lead_attribution = {
    firstTouch: {
      source: "Google Ads",
      medium: "paid",
      gbraid: "google-ad-id",
      landingPath: "/bathroom",
      capturedAt: "2026-10-25T12:00:00.000Z",
    },
    lastTouch: {
      source: "houzz.com",
      medium: "referral",
      referrer: "https://www.houzz.com/pro/remodeler",
      landingPath: "/contact",
      capturedAt: "2026-10-25T13:00:00.000Z",
    },
  };
  const parsed = parseWebsiteLead({
    ...payload,
    lead_attribution,
    custom_field: "value",
  });
  expect(parsed.leadAttribution).toEqual(lead_attribution);
  expect(parsed.otherSubmittedFields).toEqual({ custom_field: "value" });
  expect(
    parseWebsiteLead({ ...payload, lead_attribution: { invalid: true } })
      .leadAttribution,
  ).toBeUndefined();
});

cloudTest(
  "repeated website submissions keep one lead and one automation run",
  async ({ company, page, request }) => {
    const submissionId = randomUUID();
    const lead = {
      ...payload,
      submission_id: submissionId,
      email: `retry-${submissionId}@example.com`,
    };
    const headers = {
      Origin: websiteOrigin,
      "x-forwarded-for": `playwright-idempotency-${submissionId}`,
    };
    const responses = await Promise.all([
      request.post("/api/leads", { headers, data: lead }),
      request.post("/api/leads", { headers, data: lead }),
    ]);
    expect(responses.map((response) => response.status()).sort()).toEqual([
      200, 201,
    ]);
    expect(
      (
        await request.post("/api/leads", {
          headers,
          data: { ...lead, project: "Bathroom Remodel" },
        })
      ).status(),
    ).toBe(409);

    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers: { Origin: "http://localhost:3100" },
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const workspace = await (await api.get("/api/workspace")).json();
    expect(workspace.contacts).toHaveLength(1);
    expect(workspace.leads).toHaveLength(1);
    expect(workspace.leads[0].id).toBe(submissionId);
    const history = await (
      await api.get("/api/automations/website-leads/runs")
    ).json();
    expect(history.runs).toHaveLength(1);
    expect(history.runs[0].leadId).toBe(submissionId);

    // Editing the shared contact must not turn a harmless form retry into a conflict.
    const editedContact = {
      ...workspace.contacts[0],
      email: "updated-by-staff@example.com",
      updatedAt: new Date().toISOString(),
    };
    expect(
      (
        await company.admin
          .from("remodel_records")
          .update({ data: editedContact, updated_at: editedContact.updatedAt })
          .eq("organization_id", company.organizationId)
          .eq("id", editedContact.id)
      ).error,
    ).toBeNull();
    const replay = await request.post("/api/leads", { headers, data: lead });
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual({ received: true, duplicate: true });
    const updatedLead = (await (await api.get("/api/workspace")).json())
      .leads[0];
    expect(
      (
        await api.patch("/api/workspace", {
          headers: { Origin: "http://localhost:3100" },
          data: {
            kind: "lead",
            id: submissionId,
            updatedAt: updatedLead.updatedAt,
            data: { ...updatedLead, notes: "Staff follow-up" },
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await request.post("/api/leads", { headers, data: lead })).status(),
    ).toBe(200);
    expect(
      (
        await request.post("/api/leads", {
          headers,
          data: { ...lead, address: "A different address" },
        })
      ).status(),
    ).toBe(409);
  },
);

cloudTest(
  "concurrent inquiries share a contact and a failed run rolls back the lead",
  async ({ company, request }) => {
    const email = `parallel-${randomUUID()}@example.com`;
    const inquiries = [randomUUID(), randomUUID()].map((submission_id) => ({
      ...payload,
      submission_id,
      email,
    }));
    const results = await Promise.all(
      inquiries.map((data) =>
        request.post("/api/leads", {
          headers: {
            Origin: websiteOrigin,
            "x-forwarded-for": `parallel-${data.submission_id}`,
          },
          data,
        }),
      ),
    );
    expect(results.map((result) => result.status())).toEqual([201, 201]);
    const contacts = await company.admin
      .from("remodel_records")
      .select("id")
      .eq("organization_id", company.organizationId)
      .eq("kind", "contact");
    const leads = await company.admin
      .from("remodel_records")
      .select("id,data")
      .eq("organization_id", company.organizationId)
      .eq("kind", "lead");
    const runs = await company.admin
      .from("remodel_automation_runs")
      .select("id,lead_id")
      .eq("organization_id", company.organizationId);
    expect(contacts.error || leads.error || runs.error).toBeNull();
    expect(contacts.data).toHaveLength(1);
    expect(leads.data).toHaveLength(2);
    expect(runs.data).toHaveLength(2);
    expect(
      leads.data?.every((row) => row.data.contactId === contacts.data?.[0].id),
    ).toBe(true);

    // The run's non-null project constraint fails after the record inserts.
    // The transaction must leave neither a contact nor a lead behind.
    const failedContactId = randomUUID();
    const failedLeadId = randomUUID();
    const now = new Date().toISOString();
    const failed = await company.admin.rpc("remodel_capture_website_lead", {
      p_organization_id: company.organizationId,
      p_contact: {
        id: failedContactId,
        email: "rollback@example.com",
        updatedAt: now,
      },
      p_lead: {
        id: failedLeadId,
        contactId: failedContactId,
        name: "Rollback test",
        updatedAt: now,
      },
      p_match_existing: false,
      p_steps: [
        { key: "contact", label: "Customer contact", status: "created" },
        { key: "lead", label: "Lead", status: "created" },
      ],
    });
    expect(failed.error).not.toBeNull();
    const remnants = await company.admin
      .from("remodel_records")
      .select("id")
      .eq("organization_id", company.organizationId)
      .in("id", [failedContactId, failedLeadId]);
    expect(remnants.error).toBeNull();
    expect(remnants.data).toHaveLength(0);
  },
);

test("Discord lead notification preserves the form details safely", () => {
  const message = buildDiscordLeadMessage(
    {
      first_name: "Jordan",
      last_name: "@everyone Lee",
      email: "jordan@example.com",
      phone: "+19195550142",
      zip: "27513",
      address: "1214 Willowbrook Drive",
      project: "Kitchen Remodel",
      project_description: "Replace cabinets, counters, and flooring.",
    },
    new Date("2026-09-16T20:00:00.000Z"),
  );

  expect(message.allowed_mentions.parse).toEqual([]);
  expect(message.embeds[0].fields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ value: "Jordan @\u200beveryone Lee" }),
      expect.objectContaining({
        value: "[📞 Call +19195550142](tel:+19195550142)",
      }),
      expect.objectContaining({
        value: "1214 Willowbrook Drive, 27513",
      }),
    ]),
  );
  expect(message.embeds[0].timestamp).toBe("2026-09-16T20:00:00.000Z");
});

test("Discord lead notification omits fields that were not submitted", () => {
  const message = buildDiscordLeadMessage(
    {
      first_name: "Jordan",
      phone: "+19195550142",
    },
    new Date("2026-09-16T20:00:00.000Z"),
  );

  expect(message.embeds[0].fields.map((field) => field.name)).toEqual([
    "👤 Name",
    "📞 Phone",
  ]);
});

test("Discord notification bounds long descriptions without losing the lead", () => {
  const message = buildDiscordLeadMessage({
    phone: "+19195550142",
    project_description: "x".repeat(1500),
  });
  expect(
    message.embeds[0].fields.find(
      (field) => field.name === "📍 Project Description",
    )?.value,
  ).toHaveLength(1024);
});

test("leads page shows linked website inquiry and contact details", async ({
  page,
}) => {
  await page.goto("/demo?view=Leads");
  await expect(page.getByRole("heading", { name: "Leads." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Leads" })).toContainText(
    "Taylor Reed",
  );
  const detail = page.getByRole("article", { name: "Taylor Reed lead" });
  await expect(detail).toContainText("Kitchen Remodel");
  await expect(
    detail.getByRole("link", { name: "taylor@example.com" }),
  ).toHaveAttribute("href", "mailto:taylor@example.com");
  await expect(
    detail.getByRole("link", { name: "+19195550142" }),
  ).toHaveAttribute("href", "tel:+19195550142");
  await page.getByLabel("Search leads").fill("no-match");
  await expect(page.getByText("No matching leads")).toBeVisible();
  await page.getByLabel("Search leads").fill("");
  await page.screenshot({
    path: "artifacts/leads-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(detail).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/leads-mobile.png", fullPage: true });

  await page.evaluate(() =>
    localStorage.setItem("premium-remodel-theme", "dark"),
  );
  await page.setViewportSize({ width: 1365, height: 768 });
  await page.reload();
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Taylor Reed" })).toHaveCSS(
    "color",
    "rgb(231, 237, 244)",
  );
  await expect(detail.locator(".lead-project-brief p")).toHaveCSS(
    "color",
    "rgb(215, 225, 234)",
  );
  await expect(detail.locator(".lead-contact-card dd").last()).toHaveCSS(
    "color",
    "rgb(215, 225, 234)",
  );
  await page.screenshot({
    path: "artifacts/leads-dark.png",
    fullPage: true,
  });
});

test("a lead consultation can be scheduled and appears on the calendar", async ({
  page,
}) => {
  await page.goto("/demo?view=Leads");
  const detail = page.getByRole("article", { name: "Taylor Reed lead" });
  await detail.getByRole("button", { name: "Edit consultation" }).click();

  const dialog = page.getByRole("dialog", { name: "Edit consultation" });
  const consultationDate = new Date();
  consultationDate.setDate(consultationDate.getDate() + 5);
  const dateValue = `${consultationDate.getFullYear()}-${String(consultationDate.getMonth() + 1).padStart(2, "0")}-${String(consultationDate.getDate()).padStart(2, "0")}`;
  await dialog.getByLabel("Consultation date").fill(dateValue);
  await dialog.getByLabel("Start time").fill("10:30");
  await dialog.getByLabel("End time").fill("11:30");
  await dialog
    .getByLabel("Consultation notes")
    .fill("Meet the homeowner at the front entrance.");
  await page.screenshot({
    path: "artifacts/lead-consultation.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/lead-consultation-mobile.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Save consultation" }).click();

  await expect(dialog).toBeHidden();
  await expect(detail).toContainText("CONSULTATION");
  await expect(detail).toContainText(
    "Meet the homeowner at the front entrance.",
  );

  await page.goto("/demo?view=Upcoming&layout=List");
  await expect(
    page.getByRole("button", {
      name: "Consultation · Taylor Reed",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("10:30 AM–11:30 AM")).toBeVisible();
});

test("a lead creates a quote with its available details filled in", async ({
  page,
}) => {
  await page.goto("/demo?view=Leads");
  const detail = page.getByRole("article", { name: "Taylor Reed lead" });
  await detail.getByRole("button", { name: "Create quote" }).click();

  const dialog = page.getByRole("dialog", { name: "New quote" });
  await expect(dialog.getByLabel("Quote name")).toHaveValue(
    "Taylor Reed · Kitchen Remodel",
  );
  await expect(dialog.getByLabel("Customer name")).toHaveValue("Taylor Reed");
  await expect(dialog.getByLabel("Project type")).toHaveValue("Kitchen");
  await expect(dialog.getByLabel("Email")).toHaveValue("taylor@example.com");
  await expect(dialog.getByLabel("Phone")).toHaveValue("+19195550142");
  await expect(dialog.getByLabel("Address")).toHaveValue(
    "1214 Willowbrook Drive, Cary, NC, 27513",
  );
  await expect(dialog.getByLabel("Find or add a contact")).toHaveValue(
    "Taylor Reed",
  );
  await expect(dialog.getByLabel("Linked lead")).toHaveCount(0);
  await expect(dialog.getByLabel("Notes", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Full scope of work")).toHaveCount(0);
  await expect(dialog.locator('input[name="description"]')).toHaveValue(
    /update our cabinets, countertops, lighting, and flooring/i,
  );

  await dialog.getByRole("button", { name: "Create quote" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", {
      name: "Taylor Reed · Kitchen Remodel",
      exact: true,
    }),
  ).toBeVisible();

  await page.goto("/demo?view=Leads");
  const updated = page.getByRole("article", { name: "Taylor Reed lead" });
  await expect(updated.getByLabel("Stage")).toHaveValue("Quote drafted");
  await expect(
    updated.getByRole("button", { name: "Open quote" }),
  ).toBeVisible();
});

cloudTest(
  "public website submissions create private linked contacts and leads",
  async ({ company, page, request }) => {
    const rejected = await request.post("/api/leads", {
      headers: { Origin: "https://untrusted.example" },
      data: payload,
    });
    expect(rejected.status()).toBe(403);

    const preflight = await request.fetch("/api/leads", {
      method: "OPTIONS",
      headers: {
        Origin: "https://plhi-test-walkermozs-projects.vercel.app",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(preflight.status()).toBe(204);
    expect(preflight.headers()["access-control-allow-origin"]).toBe(
      "https://plhi-test-walkermozs-projects.vercel.app",
    );

    const invalid = await request.post("/api/leads", {
      headers: { Origin: websiteOrigin },
      data: { ...payload, email: "not-an-email" },
    });
    expect(invalid.status()).toBe(400);
    expect(invalid.headers()["access-control-allow-origin"]).toBe(
      websiteOrigin,
    );

    const withoutDescription = {
      ...payload,
      project_description: undefined,
    };
    const response = await request.post("/api/leads", {
      headers: { Origin: websiteOrigin },
      data: {
        ...withoutDescription,
        sms_appointment_opt_in: true,
        sms_marketing_opt_in: "true",
        preferred_contact_time: "Morning",
      },
    });
    expect(response.status()).toBe(201);
    expect(response.headers()["access-control-allow-origin"]).toBe(
      websiteOrigin,
    );
    expect(await response.json()).toEqual({ received: true });

    const anonymous = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const anonymousRead = await anonymous.from("remodel_records").select("id");
    expect(anonymousRead.data).toBeNull();
    expect(anonymousRead.error).not.toBeNull();
    expect(
      (
        await anonymous.rpc("remodel_receive_website_lead", {
          p_organization: company.organizationId,
          p_first_name: payload.first_name,
          p_last_name: payload.last_name,
          p_email: payload.email,
          p_phone: payload.phone,
          p_zip: payload.zip,
          p_address: payload.address,
          p_project: payload.project,
          p_project_description: payload.project_description,
        })
      ).error,
    ).not.toBeNull();

    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers: { Origin: "http://localhost:3100" },
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const workspace = await (await api.get("/api/workspace")).json();
    expect(workspace.contacts).toHaveLength(1);
    expect(workspace.leads).toHaveLength(1);
    expect(workspace.contacts[0]).toMatchObject({
      name: "Jordan Lee",
      email: payload.email,
      phone: payload.phone,
      zip: payload.zip,
      address: payload.address,
    });
    expect(workspace.leads[0]).toMatchObject({
      contactId: workspace.contacts[0].id,
      name: "Jordan Lee",
      project: payload.project,
      projectDescription: "",
      smsAppointmentOptIn: true,
      smsMarketingOptIn: false,
      smsConsentEvidence: {
        source: "premiumremodel.com consultation form",
        policyVersion: "2026-10-21",
        privacyUrl: "https://www.premiumremodel.com/privacy-policy",
        termsUrl: "https://www.premiumremodel.com/terms-and-conditions",
        capturedAt: expect.any(String),
        origin: websiteOrigin,
        appointment: true,
        marketing: false,
      },
      otherSubmittedFields: { preferred_contact_time: "Morning" },
      status: "New",
      source: "Website form",
      discordNotification: {
        status: "not_configured",
        attemptedAt: expect.any(String),
      },
      smsAcknowledgement: {
        status: "skipped",
        attemptedAt: expect.any(String),
        detail: "Company texting is not connected",
      },
    });

    const audit = await (await api.get("/api/audit")).json();
    expect(audit.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorName: "System",
          action: "created",
          entityKind: "contact",
          subject: "Jordan Lee",
        }),
        expect.objectContaining({
          actorName: "System",
          action: "created",
          entityKind: "lead",
          subject: "Jordan Lee",
        }),
      ]),
    );

    await page.goto("/?view=Leads");
    const leadDetail = page.getByRole("article", { name: "Jordan Lee lead" });
    await expect(leadDetail.getByText("PROJECT REQUEST")).toHaveCount(0);
    await leadDetail
      .getByRole("button", { name: "Schedule consultation" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Schedule consultation",
    });
    const consultationDate = new Date();
    consultationDate.setDate(consultationDate.getDate() + 6);
    const consultationDateValue = `${consultationDate.getFullYear()}-${String(consultationDate.getMonth() + 1).padStart(2, "0")}-${String(consultationDate.getDate()).padStart(2, "0")}`;
    await dialog.getByLabel("Consultation date").fill(consultationDateValue);
    await dialog.getByLabel("Start time").fill("13:00");
    await dialog.getByLabel("End time").fill("14:00");
    await dialog
      .getByLabel("Consultation notes")
      .fill("Review the kitchen layout and finish options.");
    await dialog.getByRole("button", { name: "Save consultation" }).click();
    await expect(dialog).toBeHidden();

    const updatedWorkspace = await (await api.get("/api/workspace")).json();
    expect(updatedWorkspace.leads[0]).toMatchObject({
      id: workspace.leads[0].id,
      quoteDate: consultationDateValue,
      quoteStartTime: "13:00",
      quoteEndTime: "14:00",
      quoteNotes: "Review the kitchen layout and finish options.",
      discordNotification: {
        status: "not_configured",
        attemptedAt: expect.any(String),
      },
    });

    await page.goto("/?view=Upcoming&layout=List");
    await expect(
      page.getByRole("button", {
        name: "Consultation · Jordan Lee",
        exact: true,
      }),
    ).toBeVisible();
  },
);
