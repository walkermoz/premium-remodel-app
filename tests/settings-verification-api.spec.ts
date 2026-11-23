import { test, expect, password } from "./supabase-fixture";
import type { APIRequestContext } from "@playwright/test";
import {
  defaultOperatingSettings,
  type OperatingSettings,
} from "@/lib/operating-settings";
import type { BusinessConfig } from "@/lib/business-config-schema";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { openSettingsSection } from "./settings-helpers";

const cloud = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const headers = { Origin: "http://localhost:3100" };
async function login(api: APIRequestContext, email: string, pass = password) {
  const response = await api.post("/api/auth", {
    headers,
    data: { action: "login", email, password: pass },
  });
  expect(await response.json()).not.toHaveProperty("error");
  expect(response.status()).toBe(200);
}
async function config(api: APIRequestContext): Promise<BusinessConfig> {
  const response = await api.get("/api/business-config");
  expect(response.status()).toBe(200);
  return response.json();
}
async function saveConfig(api: APIRequestContext, data: BusinessConfig) {
  const response = await api.put("/api/business-config", { headers, data });
  expect(await response.json()).not.toHaveProperty("error");
  expect(response.status()).toBe(200);
  return config(api);
}
async function saveSection<K extends keyof OperatingSettings>(
  api: APIRequestContext,
  section: K,
  value: OperatingSettings[K],
) {
  const current = await (await api.get("/api/operating-settings")).json();
  expect(current.storageReady).toBe(true);
  const response = await api.patch("/api/operating-settings", {
    headers,
    data: { section, value, revision: current.revision },
  });
  expect(await response.json()).not.toHaveProperty("error");
  expect(response.status()).toBe(200);
  return await (await api.get("/api/operating-settings")).json();
}
const projectData = (name = "Settings verification") => ({
  name,
  address: "100 Test Lane",
  client: "QA Client",
  clientEmail: "qa@example.test",
  clientPhone: "",
  startDate: "",
  endDate: "",
  completedDate: "",
  status: "Planning",
  description: "Local verification only",
  category: "Kitchen",
  cover: "",
});
async function create(api: APIRequestContext, kind: string, data: object) {
  const response = await api.post("/api/workspace", {
    headers,
    data: { kind, data },
  });
  const body = await response.json();
  expect(body).not.toHaveProperty("error");
  expect(response.status()).toBe(201);
  return body;
}
async function update(
  api: APIRequestContext,
  kind: string,
  current: { id: string; updatedAt: string },
  changes: object,
) {
  return api.patch("/api/workspace", {
    headers,
    data: {
      kind,
      id: current.id,
      updatedAt: current.updatedAt,
      data: { ...current, ...changes },
    },
  });
}

cloud(
  "all company, compliance and regional fields persist through the actual settings editor",
  async ({ company, page }) => {
    await login(page.request, company.email);
    await page.goto("/?view=Settings#company");
    for (const [label, value] of [
      ["Company name", "QA Remodeling"],
      ["Website", "https://example.test"],
      ["Contact email", "office@example.test"],
      ["Phone", "9195550100"],
    ])
      await page.getByLabel(label, { exact: true }).fill(value);
    await page
      .getByRole("combobox", { name: "Address suggestions", exact: true })
      .selectOption("nationwide");
    await Promise.all([
      page.waitForEvent("load"),
      page
        .getByRole("button", { name: "Save business settings", exact: true })
        .click(),
    ]);
    await expect(page.getByLabel("Company name", { exact: true })).toHaveValue(
      "QA Remodeling",
    );
    await openSettingsSection(page, "Compliance & region");
    const inputs = {
      "Legal business name": "QA Remodeling LLC",
      "SMS program name": "QA Updates",
      "Privacy policy URL": "https://example.test/privacy",
      "Terms URL": "https://example.test/terms",
      "SMS policy version": "qa-v2",
      "Compliance help email": "help@example.test",
      "Compliance help phone": "9195550101",
      "Make checks payable to": "QA Remodeling LLC",
      "Check mailing address": "100 Test Lane",
      "Time zone": "America/Chicago",
      Locale: "en-GB",
      "Service area": "Test County",
    };
    for (const [label, value] of Object.entries(inputs))
      await page.getByLabel(label, { exact: true }).fill(value);
    await Promise.all([
      page.waitForEvent("load"),
      page
        .getByRole("button", { name: "Save business settings", exact: true })
        .click(),
    ]);
    await page.reload();
    for (const [label, value] of Object.entries(inputs))
      await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
    const saved = await config(page.request);
    expect(saved.profile).toMatchObject({
      name: "QA Remodeling",
      email: "office@example.test",
      website: "https://example.test",
      phone: "9195550100",
      addressPriority: "nationwide",
    });
    expect(saved.compliance).toMatchObject({
      legalName: "QA Remodeling LLC",
      helpEmail: "help@example.test",
      helpPhone: "9195550101",
      smsPolicyVersion: "qa-v2",
    });
    expect(saved.regional).toEqual({
      timezone: "America/Chicago",
      locale: "en-GB",
      serviceArea: "Test County",
      country: "US",
      currency: "USD",
    });
    for (const regional of [
      { ...saved.regional, locale: "en_US_invalid" },
      { ...saved.regional, timezone: "Not/A_Zone" },
    ])
      expect(
        (
          await page.request.put("/api/business-config", {
            headers,
            data: { ...saved, regional },
          })
        ).status(),
      ).toBe(400);
  },
);

cloud(
  "every module, quote preference and role setting persists and enforces workspace access",
  async ({ company, page }) => {
    const api = page.request;
    await login(api, company.email);
    let saved = await config(api);
    for (const key of Object.keys(
      saved.modules,
    ) as (keyof BusinessConfig["modules"])[]) {
      saved = await saveConfig(api, {
        ...saved,
        modules: { ...saved.modules, [key]: false },
      });
      expect(saved.modules[key]).toBe(false);
      if (key === "priceBook")
        expect([403, 409]).toContain(
          (await api.get("/api/pricebook")).status(),
        );
      if (key === "payments")
        expect([403, 409]).toContain(
          (await api.get("/api/stripe/connect")).status(),
        );
      if (key === "agreements")
        expect([403, 409]).toContain(
          (await api.get("/api/agreement-templates")).status(),
        );
      if (key === "automations")
        expect([403, 409]).toContain(
          (await api.get("/api/workflows")).status(),
        );
      if (key === "imageGeneration")
        expect(
          (await api.post("/api/generate", { headers, data: {} })).status(),
        ).toBe(403);
      if (key === "media")
        expect(
          (await api.post("/api/media/blog", { headers, data: {} })).status(),
        ).toBe(403);
      if (key === "doorKnocking")
        expect(
          (
            await api.post("/api/workspace", {
              headers,
              data: { kind: "door_visit", data: {} },
            })
          ).status(),
        ).toBe(403);
      saved = await saveConfig(api, {
        ...saved,
        modules: { ...saved.modules, [key]: true },
      });
      expect(saved.modules[key]).toBe(true);
    }
    for (const enabled of [false, true]) {
      const quotePreferences = {
        showInternalCosts: enabled,
        showPriceBookPicker: enabled,
        showCustomerLineItemPrices: enabled,
        paymentProvider: enabled ? ("stripe" as const) : ("manual" as const),
      };
      saved = await saveConfig(api, { ...saved, quotePreferences });
      expect(saved.quotePreferences).toEqual(quotePreferences);
    }
    saved.roleNavigation.office = ["Settings", "Contacts", "Projects"];
    saved.rolePermissions.office = ["connections.manage"];
    saved = await saveConfig(api, saved);
    const ownerPermissions = saved.rolePermissions.owner;
    expect(ownerPermissions.length).toBeGreaterThan(15);
    const member = await company.admin.auth.admin.createUser({
      email: company.memberEmail,
      password,
      email_confirm: true,
    });
    expect(member.error).toBeNull();
    expect(
      (
        await company.admin.from("profiles").insert({
          organization_id: company.organizationId,
          auth_user_id: member.data.user!.id,
          email: company.memberEmail,
          full_name: "QA Office",
          role: "office",
          active: true,
        })
      ).error,
    ).toBeNull();
    await login(api, company.memberEmail);
    // The settings screen requires payments.manage as well as connections.manage.
    for (const method of ["get", "post", "put", "delete"] as const)
      expect(
        (await api[method]("/api/stripe/connect", { headers })).status(),
      ).toBe(403);
    expect((await api.get("/api/organization-lifecycle")).status()).toBe(403);
    expect(
      (
        await api.patch("/api/operating-settings", {
          headers,
          data: {
            section: "invoices",
            value: defaultOperatingSettings().invoices,
            revision: 0,
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await api.put("/api/business-config", {
          headers,
          data: { ...saved, profile: { ...saved.profile, name: "Denied" } },
        })
      ).status(),
    ).toBe(403);
    await page.goto("/?view=Settings#company");
    await expect(page.getByLabel("Company name", { exact: true })).toHaveCount(
      0,
    );
    const names = await page.locator(".workspace-nav button").allTextContents();
    // Server-side APIs also deny records from tabs removed by the role's navigation.
    const deniedQuote = await api.post("/api/workspace", {
      headers,
      data: { kind: "quote", data: { ...projectData(), status: "Draft" } },
    });
    expect(deniedQuote.status()).toBe(403);
    expect(names.join(" ")).not.toContain("Generate");
  },
);

cloud(
  "all six operating sections persist, reject stale saves and retain unrelated sections",
  async ({ company, page, request }) => {
    const api = page.request;
    await login(api, company.email);
    expect((await request.get("/api/operating-settings")).status()).toBe(401);
    const values = defaultOperatingSettings();
    values.hours = {
      ...values.hours,
      enabled: true,
      blockOutside: true,
      exceptions: [
        {
          date: "2026-11-25",
          closed: true,
          start: "08:00",
          end: "17:00",
          note: "Closed for QA",
        },
      ],
    };
    values.customFields = [
      {
        id: "access",
        label: "Access instructions",
        type: "text",
        required: true,
        options: [],
        defaultValue: null,
        targets: ["contact", "quote", "project"],
        transfer: true,
        clientVisible: true,
        archived: false,
      },
      {
        id: "internal",
        label: "Internal memo",
        type: "textarea",
        required: false,
        options: [],
        defaultValue: "Office only",
        targets: ["project"],
        transfer: false,
        clientVisible: false,
        archived: false,
      },
      {
        id: "count",
        label: "Room count",
        type: "number",
        required: false,
        options: [],
        defaultValue: 2,
        targets: ["project"],
        transfer: false,
        clientVisible: true,
        archived: false,
      },
      {
        id: "ok",
        label: "Confirmed",
        type: "boolean",
        required: false,
        options: [],
        defaultValue: false,
        targets: ["project"],
        transfer: false,
        clientVisible: false,
        archived: false,
      },
      {
        id: "finish",
        label: "Finish",
        type: "select",
        required: false,
        options: ["White", "Ivory"],
        defaultValue: "Ivory",
        targets: ["project"],
        transfer: false,
        clientVisible: true,
        archived: false,
      },
      {
        id: "date",
        label: "Desired date",
        type: "date",
        required: false,
        options: [],
        defaultValue: "2026-12-01",
        targets: ["project"],
        transfer: false,
        clientVisible: true,
        archived: false,
      },
    ];
    values.forms = [
      {
        id: "closeout",
        title: "QA Closeout",
        required: true,
        autoAssign: true,
        archived: false,
        fields: [
          {
            id: "checked",
            label: "Inspected",
            type: "boolean",
            required: true,
            options: [],
            defaultValue: null,
          },
        ],
      },
    ];
    values.invoices = {
      title: "QA Invoice",
      dueDays: 7,
      depositPercent: 30,
      customerNote: "QA invoice instructions",
    };
    values.messages = {
      quoteSubject: "QA {{quoteNumber}}",
      quoteBody: "Hi {{firstName}} from {{businessName}}",
      leadSubject: "QA request",
      leadBody: "Thanks {{clientName}}",
      scheduleFooter: "Call our office with changes.",
    };
    values.portal = { ...values.portal, scheduleTimes: false, requests: false };
    for (const section of Object.keys(values) as (keyof OperatingSettings)[]) {
      const result = await saveSection(api, section, values[section]);
      expect(result.settings[section]).toEqual(values[section]);
      const stale = await api.patch("/api/operating-settings", {
        headers,
        data: {
          section,
          value: values[section],
          revision: result.revision - 1,
        },
      });
      expect(stale.status()).toBe(409);
    }
    const result = await (await api.get("/api/operating-settings")).json();
    expect(result.settings).toEqual(values);
    const audit = await company.admin
      .from("remodel_audit_events")
      .select("subject")
      .eq("organization_id", company.organizationId);
    expect(audit.error).toBeNull();
    for (const section of Object.keys(values))
      expect(
        audit.data!.some(
          (entry) => entry.subject === `Operating settings: ${section}`,
        ),
      ).toBe(true);
    await page.goto("/?view=Settings#invoice-defaults");
    await expect(page.getByLabel("Invoice title", { exact: true })).toHaveValue(
      "QA Invoice",
    );
    await expect(page.getByLabel("Default deposit (%)")).toHaveValue("30");
    await openSettingsSection(page, "Message templates");
    await expect(
      page.getByLabel("Quote email subject", { exact: true }),
    ).toHaveValue("QA {{quoteNumber}}");
    await openSettingsSection(page, "Customer portal");
    await expect(
      page.getByLabel("Appointment times in the schedule"),
    ).not.toBeChecked();
  },
);

cloud(
  "display-only hours leave scheduling unrestricted while fields, forms and invoice settings preserve history",
  async ({ company, page }) => {
    const api = page.request;
    await login(api, company.email);
    const defaults = defaultOperatingSettings();
    await saveSection(api, "hours", {
      ...defaults.hours,
      enabled: true,
      blockOutside: true,
      exceptions: [
        {
          date: "2026-11-25",
          closed: true,
          start: "08:00",
          end: "17:00",
          note: "Holiday",
        },
      ],
    });
    const field = {
      id: "access",
      label: "Access",
      type: "text" as const,
      required: true,
      options: [],
      defaultValue: null,
      targets: ["contact", "quote", "project"] as (
        "contact" | "quote" | "project"
      )[],
      transfer: true,
      clientVisible: true,
      archived: false,
    };
    await saveSection(api, "customFields", [field]);
    await saveSection(api, "forms", [
      {
        id: "closeout",
        title: "Closeout",
        required: true,
        autoAssign: true,
        archived: false,
        fields: [
          {
            id: "inspection",
            label: "Inspection",
            type: "boolean",
            required: true,
            options: [],
            defaultValue: null,
          },
        ],
      },
    ]);
    const invoice = {
      title: "QA invoice",
      dueDays: 7,
      depositPercent: 30,
      customerNote: "QA note",
    };
    await saveSection(api, "invoices", invoice);
    const contact = await create(api, "contact", {
      firstName: "QA",
      lastName: "Client",
      name: "QA Client",
      email: "qa@example.test",
      phone: "",
      zip: "",
      address: "",
      source: "Dashboard",
      customValues: { access: "Side gate" },
    });
    const quote = await create(api, "quote", {
      ...projectData("QA quote"),
      status: "Draft",
      contactId: contact.id,
    });
    expect(quote.customValues.access).toBe("Side gate");
    expect(quote.invoiceDefaults).toEqual(invoice);
    let project = await create(api, "project", {
      ...projectData(),
      customValues: { access: "Side gate" },
    });
    expect(project.recordForms).toHaveLength(1);
    expect(project.publicCustomFields).toEqual([
      { id: "access", label: "Access", value: "Side gate" },
    ]);
    const task = {
      projectId: project.id,
      title: "QA work",
      dueDate: "2026-11-24",
      startTime: "09:00",
      endTime: "10:00",
      status: "To do",
      description: "",
      contractorId: "",
      priority: "Medium",
      workType: "Task",
    };
    const valid = await create(api, "task", task);
    for (const times of [
      { dueDate: "2026-11-25" },
      { startTime: "07:00" },
      { endTime: "18:00" },
    ])
      expect(
        (
          await api.post("/api/workspace", {
            headers,
            data: { kind: "task", data: { ...task, ...times } },
          })
        ).status(),
      ).toBe(201);
    await saveSection(api, "hours", {
      ...defaults.hours,
      enabled: true,
      blockOutside: true,
      days: defaults.hours.days.map((day) => ({ ...day, open: false })),
    });
    // Existing bookings may still be completed after business hours change.
    expect(
      (await update(api, "task", valid, { status: "Done" })).status(),
    ).toBe(200);
    expect(
      (await update(api, "project", project, { status: "Completed" })).status(),
    ).toBe(400);
    let completed = await update(api, "project", project, {
      recordForms: project.recordForms.map((form: object) => ({
        ...form,
        answers: { inspection: true },
        status: "complete",
      })),
    });
    expect(completed.status()).toBe(200);
    project = await completed.json();
    expect(project.recordForms[0].completedBy).toBe("Workspace Owner");
    expect(
      (
        await update(api, "project", project, {
          recordForms: project.recordForms.map((form: object) => ({
            ...form,
            answers: { inspection: false },
          })),
        })
      ).status(),
    ).toBe(400);
    completed = await update(api, "project", project, { status: "Completed" });
    expect(completed.status()).toBe(200);
    await saveSection(api, "invoices", {
      ...invoice,
      depositPercent: 60,
      customerNote: "New invoices only",
    });
    const unchanged = await update(api, "quote", quote, {
      description: "Updated notes",
    });
    expect(unchanged.status()).toBe(200);
    expect((await unchanged.json()).invoiceDefaults).toEqual(invoice);
    await saveSection(api, "customFields", [{ ...field, archived: true }]);
    const workspace = await (await api.get("/api/workspace")).json();
    expect(
      workspace.contacts.find((item: { id: string }) => item.id === contact.id)
        .customValues.access,
    ).toBe("Side gate");
  },
);

cloud(
  "all four private brand assets upload, replace, load and remove without exposing storage",
  async ({ company, page, request }) => {
    const api = page.request;
    await login(api, company.email);
    const buffer = await readFile("public/images/kitchen.jpg");
    for (const [path, key] of [
      ["/api/business-logo", "logo"],
      ["/api/business-branding/logo-dark", "image"],
      ["/api/business-branding/logo-mark", "image"],
      ["/api/business-branding/banner", "image"],
    ]) {
      for (let version = 0; version < 2; version++) {
        const uploaded = await api.post(path, {
          headers,
          multipart: {
            [key]: { name: "qa.jpg", mimeType: "image/jpeg", buffer },
          },
        });
        expect(uploaded.status()).toBe(200);
        const image = await api.get(path);
        expect(image.status()).toBe(200);
        expect(image.headers()["content-type"]).toBe("image/png");
        expect((await request.get(path)).status()).toBe(401);
      }
      if (path !== "/api/business-logo")
        expect((await api.delete(path, { headers })).status()).toBe(200);
    }
    const saved = await config(api);
    expect(saved.profile.logoUrl).toBe("/api/business-logo");
    expect(saved.profile.logoDarkUrl).toBe("");
    expect(saved.profile.logoMarkUrl).toBe("");
    expect(saved.profile.bannerUrl).toBe("");
  },
);

cloud(
  "workflow secrets, scoped API keys, account security and organization lifecycle work against local storage",
  async ({ company, page, browser }) => {
    const api = page.request;
    await login(api, company.email);
    const value = `synthetic-local-${randomUUID()}`;
    const secretResponse = await api.put("/api/organization-secrets", {
      headers,
      data: { name: "qa_secret", description: "Local only", value },
    });
    expect(secretResponse.status()).toBe(201);
    const secret = await secretResponse.json();
    const listed = await api.get("/api/organization-secrets");
    expect(await listed.text()).not.toContain(value);
    expect(
      (
        await api.put("/api/organization-secrets", {
          headers,
          data: { id: secret.id, name: "qa_secret", value: `${value}_rotated` },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await api.delete("/api/organization-secrets", {
          headers,
          data: { id: secret.id },
        })
      ).status(),
    ).toBe(200);
    const keyResponse = await api.post("/api/admin/api-keys", {
      headers,
      data: { name: "Local QA", scopes: ["leads.read"], expiresAt: null },
    });
    expect(keyResponse.status()).toBe(201);
    const key = await keyResponse.json();
    const client = await browser.newContext();
    expect(
      (
        await client.request.get("/api/v1/leads", {
          headers: { Authorization: `Bearer ${key.secret}` },
        })
      ).status(),
    ).toBe(200);
    expect((await api.get("/api/admin/api-keys")).status()).toBe(200);
    expect(await (await api.get("/api/admin/api-keys")).text()).not.toContain(
      key.secret,
    );
    expect(
      (
        await api.delete("/api/admin/api-keys", {
          headers,
          data: { id: key.key.id },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await client.request.get("/api/v1/leads", {
          headers: { Authorization: `Bearer ${key.secret}` },
        })
      ).status(),
    ).toBe(401);
    await client.close();
    const identity = await (
      await api.get("/api/organization-lifecycle")
    ).json();
    expect(identity.organization).toHaveProperty("displayName");
    const deletion = await api.post("/api/organization-lifecycle", {
      headers,
      data: {
        action: "request_deletion",
        confirmation: identity.organization.displayName,
      },
    });
    expect(deletion.status()).toBe(201);
    expect(
      (
        await api.post("/api/organization-lifecycle", {
          headers,
          data: { action: "cancel_deletion" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await api.get("/api/organization-lifecycle")).json()).deletion,
    ).toBeNull();
    const exported = await api.post("/api/organization-lifecycle/export", {
      headers,
      timeout: 60000,
    });
    expect(exported.status()).toBe(200);
    expect(exported.headers()["content-type"]).toBe("application/zip");
    expect((await exported.body()).subarray(0, 2).toString()).toBe("PK");
    const changedPassword = "Local-QA-new-passphrase-932!";
    expect(
      (
        await api.post("/api/auth", {
          headers,
          data: {
            action: "password",
            current: "wrong",
            password: changedPassword,
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await api.post("/api/auth", {
          headers,
          data: {
            action: "password",
            current: password,
            password: changedPassword,
          },
        })
      ).status(),
    ).toBe(200);
    await login(api, company.email, changedPassword);
  },
);

cloud(
  "OAuth callbacks return to their settings section and provider status failures stay contained",
  async ({ company, page }) => {
    const api = page.request;
    await login(api, company.email);
    for (const [path, section] of [
      ["google-mail", "email"],
      ["google-calendar", "calendar"],
      ["google-business", "reviews"],
      ["stripe/connect", "stripe"],
    ]) {
      const callback = await api.get(
        `/api/${path}/callback?error=access_denied`,
        { maxRedirects: 0 },
      );
      expect(callback.status()).toBe(302);
      const location = new URL(callback.headers().location);
      expect(location.searchParams.get("view")).toBe("Settings");
      expect(location.hash).toBe(`#${section}`);
    }
    for (const section of ["email", "calendar"]) {
      const param = section === "email" ? "mail" : "calendar";
      await page.goto(`/?view=Settings&${param}=denied#${section}`);
      await expect(
        page
          .getByRole("heading", {
            name: section === "email" ? "Company email" : "Google Calendar",
            exact: true,
          })
          .last(),
      ).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`#${section}$`));
      await page.reload();
      await expect(page).toHaveURL(new RegExp(`#${section}$`));
    }
    await page.route("**/api/google-business", (route) =>
      route.fulfill({
        json: {
          configured: true,
          connected: true,
          email: "qa@example.test",
          locationName: null,
          locationTitle: null,
          canManage: true,
        },
      }),
    );
    await page.goto("/?view=Settings#reviews");
    await expect(
      page.getByText(/^The review dashboard is currently hidden/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open Analytics" }),
    ).toHaveCount(0);
  },
);

cloud(
  "each portal visibility setting protects existing links, deep links and public actions",
  async ({ company, page, browser }) => {
    const api = page.request;
    await login(api, company.email);
    let business = await config(api);
    business.compliance = {
      ...business.compliance,
      legalName: "QA Legal LLC",
      helpEmail: "help@example.test",
      helpPhone: "9195550101",
    };
    business = await saveConfig(api, business);
    const quote = await create(api, "quote", {
      ...projectData("Portal QA"),
      status: "Sent",
    });
    const link = await api.post("/api/client-links", {
      headers,
      data: { projectId: quote.id, kind: "quote" },
    });
    expect(link.status()).toBe(201);
    const url = new URL((await link.json()).url);
    const token = url.pathname.split("/")[2];
    const client = await browser.newContext();
    const customer = await client.newPage();
    const defaults = defaultOperatingSettings().portal;
    for (const [key, section] of [
      ["schedule", "schedule"],
      ["quotes", "quotes"],
      ["agreements", "msa"],
      ["invoices", "invoices"],
      ["payments", "wallet"],
      ["requests", "requests"],
    ] as const) {
      const policy = {
        ...defaults,
        [key]: false,
        ...(key === "invoices" ? { payments: false } : {}),
      };
      await saveSection(api, "portal", policy);
      await customer.goto(`${url.pathname}?view=${section}`);
      await expect(
        customer.getByRole("heading", { name: "Contact us", exact: true }),
      ).toBeVisible();
      await expect(
        customer.getByText("QA Legal LLC", { exact: true }),
      ).toBeVisible();
      await expect(
        customer.getByRole("link", { name: "help@example.test", exact: true }),
      ).toHaveAttribute("href", /mailto:help@example.test/);
      if (key === "quotes") {
        expect(
          (await client.request.get(`/api/client-quote/${token}/pdf`)).status(),
        ).toBe(403);
        expect(
          (
            await client.request.get(`/api/client-quote/${token}/flow`)
          ).status(),
        ).toBe(403);
        expect(
          (
            await client.request.post(`/api/client-quote/${token}/sign`, {
              headers,
              data: {
                signedName: "QA Client",
                quoteUpdatedAt: quote.updatedAt,
                signatureStrokes: [
                  [
                    [0.1, 0.2],
                    [0.5, 0.6],
                  ],
                ],
                acceptedTerms: true,
              },
            })
          ).status(),
        ).toBe(403);
      }
      if (key === "agreements")
        expect(
          (
            await client.request.post(`/api/client-quote/${token}/msa/sign`, {
              headers,
              data: {
                signedName: "QA Client",
                signatureStrokes: [
                  [
                    [0.1, 0.2],
                    [0.5, 0.6],
                  ],
                ],
                termsSha256: "a".repeat(64),
                transactionDate: "2026-11-22",
                agreed: true,
              },
            })
          ).status(),
        ).toBe(403);
      if (key === "payments") {
        expect(
          (
            await client.request.get(`/api/client-quote/${token}/wallet`)
          ).status(),
        ).toBe(403);
        expect(
          (
            await client.request.post(
              `/api/client-quote/${token}/flow/payment`,
              { headers, data: {} },
            )
          ).status(),
        ).toBe(403);
      }
    }
    await saveSection(api, "portal", defaults);
    expect(
      (await client.request.get(`/api/client-quote/${token}/pdf`)).status(),
    ).toBe(200);
    await customer.goto(url.pathname);
    await expect(
      customer.getByRole("heading", { name: "Customer acceptance" }),
    ).toBeVisible();
    await client.close();
  },
);
cloud(
  "schedule-time visibility strips serialized times and custom fields only expose explicitly public answers",
  async ({ company, page, browser }) => {
    const api = page.request;
    await login(api, company.email);
    await saveSection(api, "customFields", [
      {
        id: "public_note",
        label: "Public access",
        type: "text",
        required: false,
        options: [],
        defaultValue: null,
        targets: ["quote", "project"],
        transfer: true,
        clientVisible: true,
        archived: false,
      },
      {
        id: "private_note",
        label: "Private access",
        type: "text",
        required: false,
        options: [],
        defaultValue: null,
        targets: ["quote", "project"],
        transfer: true,
        clientVisible: false,
        archived: false,
      },
    ]);
    const quote = await create(api, "quote", {
      ...projectData("Schedule QA"),
      status: "Sent",
      customValues: {
        public_note: "Use the side gate",
        private_note: "QA-private-office-value",
      },
    });
    const now = new Date().toISOString();
    expect(
      (
        await company.admin
          .from("remodel_records")
          .update({
            kind: "project",
            data: {
              ...quote,
              status: "Planning",
              quoteAcceptedAt: now,
              updatedAt: now,
            },
            updated_at: now,
          })
          .eq("organization_id", company.organizationId)
          .eq("id", quote.id)
      ).error,
    ).toBeNull();
    await create(api, "task", {
      projectId: quote.id,
      title: "QA schedule item",
      dueDate: "2026-11-24",
      startTime: "10:37",
      endTime: "11:43",
      priority: "Medium",
      contractorId: "",
      description: "QA only",
      workType: "Task",
      status: "To do",
    });
    const link = await api.post("/api/client-links", {
      headers,
      data: { projectId: quote.id, kind: "project" },
    });
    expect(link.status()).toBe(201);
    const url = new URL((await link.json()).url);
    const client = await browser.newContext();
    const customer = await client.newPage();
    const portal = defaultOperatingSettings().portal;
    await saveSection(api, "portal", { ...portal, scheduleTimes: false });
    const response = await customer.goto(`${url.pathname}/quote?view=schedule`);
    expect(response!.status()).toBe(200);
    await expect(
      customer.getByText("QA schedule item", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      customer.getByRole("region", { name: "Project details" }),
    ).toContainText("Use the side gate");
    const body = await response!.text();
    expect(body).not.toContain("QA-private-office-value");
    expect(body).not.toContain("10:37");
    expect(body).not.toContain("11:43");
    await saveSection(api, "portal", portal);
    const visible = await customer.goto(`${url.pathname}/quote?view=schedule`);
    expect(await visible!.text()).toContain("10:37");
    const hours = defaultOperatingSettings().hours;
    await saveSection(api, "hours", {
      ...hours,
      enabled: true,
      days: hours.days.map((day) =>
        day.day === 1 ? { ...day, start: "09:30" } : day,
      ),
      exceptions: [
        {
          date: "2030-12-25",
          closed: true,
          start: "08:00",
          end: "17:00",
          note: "Christmas",
        },
      ],
    });
    await customer.setViewportSize({ width: 390, height: 844 });
    await customer.goto(`${url.pathname}/quote?view=contact`);
    const displayedHours = customer.getByRole("region", {
      name: "Business hours",
      exact: true,
    });
    await expect(displayedHours).toBeVisible();
    await expect(displayedHours).toContainText("Monday");
    await expect(displayedHours).toContainText("9:30");
    await expect(displayedHours).toContainText("Christmas");
    expect(
      await customer.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await saveSection(api, "hours", { ...hours, enabled: false });
    await customer.reload();
    await expect(displayedHours).toHaveCount(0);
    await client.close();
  },
);
cloud(
  "agreement and quote-flow settings create, edit, publish, archive and restore actual tenant templates",
  async ({ company, page }) => {
    const api = page.request;
    await login(api, company.email);
    const business = await config(api);
    business.modules.agreements = true;
    await saveConfig(api, business);
    for (const kind of ["agreement-templates", "quote-flow-templates"]) {
      const created = await api.post(`/api/${kind}`, {
        headers,
        data: { name: `QA ${kind}`, description: "Local verification" },
      });
      expect(created.status()).toBe(201);
      let template = await created.json();
      const path = `/api/${kind}/${template.id}`;
      const definition =
        kind === "agreement-templates"
          ? {
              content: {
                ...template.content,
                blocks: [
                  {
                    id: "qa_terms",
                    type: "paragraph",
                    text: "QA service agreement terms",
                  },
                ],
              },
              fields: template.fields,
              signerRoles: template.signerRoles,
            }
          : template.definition;
      const input = {
        revision: template.revision,
        name: `Edited ${template.name}`,
        description: "Updated locally",
        definition,
      };
      const edited = await api.put(path, { headers, data: input });
      expect(edited.status()).toBe(200);
      template = await edited.json();
      expect((await api.put(path, { headers, data: input })).status()).toBe(
        409,
      );
      const published = await api.post(`${path}/publish`, {
        headers,
        data: {
          revision: template.revision,
          changeNote: "Local verification",
          makeDefault: false,
        },
      });
      const body = await published.json();
      expect(body).not.toHaveProperty("error");
      expect(published.status()).toBe(200);
      expect(body.publishedVersion).toBe(1);
      const retrieved = await (await api.get(path)).json();
      expect(retrieved.versions).toHaveLength(1);
      expect((await api.delete(path, { headers })).status()).toBe(200);
      const list = await (await api.get(`/api/${kind}`)).json();
      expect(
        list.templates.some((item: { id: string }) => item.id === template.id),
      ).toBe(false);
      const restored =
        kind === "agreement-templates"
          ? await api.post(`${path}/restore`, { headers })
          : await api.patch(path, { headers, data: { archived: false } });
      expect(restored.status()).toBe(200);
    }
  },
);

cloud(
  "operating defaults remain isolated when the authenticated user switches companies",
  async ({ company, page }) => {
    const api = page.request;
    await login(api, company.email);
    const first = {
      ...defaultOperatingSettings().invoices,
      title: "First company invoice",
    };
    await saveSection(api, "invoices", first);
    const otherId = randomUUID();
    try {
      expect(
        (
          await company.admin
            .from("organizations")
            .insert({ id: otherId, name: "Other QA settings company" })
        ).error,
      ).toBeNull();
      const owner = await company.admin
        .from("profiles")
        .select("id")
        .eq("email", company.email)
        .single();
      expect(owner.error).toBeNull();
      expect(
        (
          await company.admin.from("remodel_memberships").insert({
            organization_id: otherId,
            profile_id: owner.data!.id,
            role: "owner",
            active: true,
          })
        ).error,
      ).toBeNull();
      const other = defaultOperatingSettings();
      other.invoices.title = "Other company invoice";
      expect(
        (
          await company.admin
            .from("remodel_operating_settings")
            .insert({ organization_id: otherId, revision: 1, settings: other })
        ).error,
      ).toBeNull();
      expect(
        (
          await (
            await api.get(`/api/operating-settings?organizationId=${otherId}`)
          ).json()
        ).settings.invoices.title,
      ).toBe(first.title);
      expect(
        (
          await api.post("/api/organizations", {
            headers,
            data: { organizationId: otherId },
          })
        ).status(),
      ).toBe(200);
      await page.goto("/?view=Settings#invoice-defaults");
      await expect(
        page.getByLabel("Invoice title", { exact: true }),
      ).toHaveValue("Other company invoice");
      expect(
        (
          await api.post("/api/organizations", {
            headers,
            data: { organizationId: company.organizationId },
          })
        ).status(),
      ).toBe(200);
      await page.reload();
      await expect(
        page.getByLabel("Invoice title", { exact: true }),
      ).toHaveValue(first.title);
    } finally {
      await company.admin.from("organizations").delete().eq("id", otherId);
    }
  },
);
