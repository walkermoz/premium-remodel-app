import { expect, test } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  assignForm,
  defaultOperatingSettings,
  normalizeRecordForms,
  operatingSettingsSchema,
  renderMessageTemplate,
  validateOperatingChange,
  type OperatingSettings,
} from "@/lib/operating-settings";
import {
  applyOperatingRecord,
  operatingProjectHandoff,
} from "@/lib/operating-records";
import {
  portalFlowBlockAllowed,
  portalViewAllowed,
  visibleSchedule,
} from "@/lib/portal-visibility";
import { defaultMsaPaymentSchedule } from "@/lib/msa-draft";
import { prepareMsa } from "@/lib/msa-contract";
import { defaultMsaContractTerms } from "@/lib/msa-draft";
import { clientContractInvoice } from "@/lib/client-invoice";
import { renderLeadAcknowledgement } from "@/lib/email-template";
import { homeownerScheduleSmsMessage } from "@/lib/task-sms-message";
import { demoWorkspace } from "@/lib/demo";
import type { Quote } from "@/lib/types";
const at = "2026-11-21T12:00:00.000Z";
function configured() {
  const s = defaultOperatingSettings();
  s.customFields = [
    {
      id: "access",
      label: "Access instructions",
      type: "text",
      required: true,
      defaultValue: null,
      options: [],
      targets: ["contact", "quote", "project"],
      transfer: true,
      clientVisible: true,
      archived: false,
    },
    {
      id: "internal",
      label: "Internal code",
      type: "number",
      required: false,
      defaultValue: null,
      options: [],
      targets: ["project"],
      transfer: false,
      clientVisible: false,
      archived: false,
    },
  ];
  s.forms = [
    {
      id: "closeout",
      title: "Closeout inspection",
      archived: false,
      autoAssign: true,
      required: true,
      fields: [
        {
          id: "checked",
          label: "Inspection passed",
          type: "boolean",
          required: true,
          options: [],
          defaultValue: null,
        },
      ],
    },
  ];
  return s;
}
test("portal hours never block staff or automated bookings, including legacy blocking settings", () => {
  const settings = defaultOperatingSettings();
  settings.hours.enabled = true;
  settings.hours.blockOutside = true;
  settings.hours.days = settings.hours.days.map((day) => ({
    ...day,
    open: false,
  }));
  for (const kind of ["task", "lead"]) {
    const record =
      kind === "task"
        ? { dueDate: "2026-11-22", startTime: "23:00", endTime: "23:30" }
        : {
            quoteDate: "2026-11-22",
            quoteStartTime: "23:00",
            quoteEndTime: "23:30",
          };
    expect(() =>
      applyOperatingRecord(settings, kind, record, null, "Staff", at),
    ).not.toThrow();
    expect(() =>
      applyOperatingRecord(settings, kind, record, record, "Workflow", at),
    ).not.toThrow();
  }
});
test("custom fields validate types, transfer only opted-in values and publish an explicit whitelist", () => {
  const s = configured();
  expect(() =>
    applyOperatingRecord(s, "project", {}, null, "Staff", at),
  ).toThrow("Access instructions is required");
  const saved = applyOperatingRecord(
    s,
    "project",
    { customValues: { access: "Side gate", internal: 42 } },
    null,
    "Staff",
    at,
  );
  expect(saved.publicCustomFields).toEqual([
    { id: "access", label: "Access instructions", value: "Side gate" },
  ]);
  expect(() =>
    applyOperatingRecord(
      s,
      "project",
      { customValues: { access: "Gate", internal: "wrong" } },
      null,
      "Staff",
      at,
    ),
  ).toThrow("must be a number");
  const quote = applyOperatingRecord(s, "quote", {}, null, "Staff", at, {
    access: "Garage code",
    internal: 42,
  });
  expect(quote.customValues).toEqual({ access: "Garage code" });
  const handoff = operatingProjectHandoff(s, {
    ...quote,
    customValues: { access: "Garage code", internal: 42 },
  });
  expect(handoff.customValues).toEqual({
    access: "Garage code",
    internal: null,
  });
  expect(handoff.recordForms).toHaveLength(1);
});
test("legacy unrelated edits retain old custom values and new required fields do not break them", () => {
  const s = configured(),
    old = { customValues: { internal: 10 }, status: "Planning" };
  expect(() =>
    applyOperatingRecord(
      s,
      "project",
      { ...old, description: "Updated" },
      old,
      "Staff",
      at,
    ),
  ).not.toThrow();
  expect(() =>
    applyOperatingRecord(
      s,
      "project",
      { ...old, customValues: { internal: 12 } },
      old,
      "Staff",
      at,
    ),
  ).toThrow("required");
});
test("saved fields keep stable identities, types and historical dropdown options", () => {
  const s = configured();
  expect(() => validateOperatingChange(s, "customFields", [])).toThrow(
    "Saved fields",
  );
  expect(() =>
    validateOperatingChange(
      s,
      "customFields",
      s.customFields.map((f) => ({ ...f, type: "date" })),
    ),
  ).toThrow();
  expect(
    validateOperatingChange(
      s,
      "customFields",
      s.customFields.map((f) => ({ ...f, archived: true })),
    ).customFields.every((f) => f.archived),
  ).toBe(true);
});
test("assigned form snapshots survive edits, required answers gate completion, completed history is immutable", () => {
  const s = configured(),
    assigned = assignForm(s.forms[0], "response_one");
  s.forms[0].title = "Changed template";
  s.forms[0].fields[0].label = "New question";
  expect(() =>
    normalizeRecordForms(
      s,
      [{ ...assigned, status: "complete" }],
      [],
      "Staff",
      at,
    ),
  ).toThrow("required");
  const complete = normalizeRecordForms(
    s,
    [{ ...assigned, answers: { checked: true }, status: "complete" }],
    [assigned],
    "Staff",
    at,
  )[0];
  expect(complete.title).toBe("Closeout inspection");
  expect(complete.fields[0].label).toBe("Inspection passed");
  expect(complete.completedBy).toBe("Staff");
  expect(() =>
    normalizeRecordForms(
      s,
      [{ ...complete, answers: { checked: false } }],
      [complete],
      "Other",
      at,
    ),
  ).toThrow("locked");
  expect(() => normalizeRecordForms(s, [], [complete], "Staff", at)).toThrow(
    "history",
  );
  const project = {
    status: "Planning",
    customValues: { access: "Gate" },
    recordForms: [assigned],
  };
  expect(() =>
    applyOperatingRecord(
      s,
      "project",
      { ...project, status: "Completed" },
      project,
      "Staff",
      at,
    ),
  ).toThrow("Complete all required");
  expect(() =>
    applyOperatingRecord(
      s,
      "project",
      { ...project, status: "Completed", recordForms: [complete] },
      project,
      "Staff",
      at,
    ),
  ).not.toThrow();
});
test("new form metadata is authoritative and archived templates cannot be assigned", () => {
  const s = configured(),
    form = assignForm(s.forms[0], "response_one");
  const saved = normalizeRecordForms(
    s,
    [
      {
        ...form,
        title: "Spoofed",
        required: false,
        fields: [],
        completedBy: "Spoofed",
      },
    ],
    [],
    "Staff",
    at,
  )[0];
  expect(saved.title).toBe("Closeout inspection");
  expect(saved.required).toBe(true);
  expect(saved.completedBy).toBeUndefined();
  s.forms[0].archived = true;
  expect(() => normalizeRecordForms(s, [form], [], "Staff", at)).toThrow(
    "not available",
  );
  expect(() =>
    normalizeRecordForms(s, [form], [form], "Staff", at),
  ).not.toThrow();
});
test("invoice defaults snapshot on creation and agreement terms retain issued defaults", () => {
  const s = defaultOperatingSettings();
  s.invoices = {
    title: "Remodel invoice",
    dueDays: 7,
    depositPercent: 30,
    customerNote: "Checks payable to Premium Remodel",
  };
  const quote = applyOperatingRecord(s, "quote", {}, null, "Staff", at);
  s.invoices.depositPercent = 60;
  expect(
    applyOperatingRecord(s, "quote", {}, quote, "Staff", at).invoiceDefaults,
  ).toMatchObject({ depositPercent: 30 });
  expect(
    defaultMsaPaymentSchedule({
      category: "Kitchen",
      name: "Kitchen",
      invoiceDefaults: quote.invoiceDefaults as OperatingSettings["invoices"],
    }).map((x) => x.percent),
  ).toEqual([30, 35, 21, 14]);
  const project = {
    ...demoWorkspace().projects[0],
    ...quote,
    status: "Accepted",
    client: "Taylor Customer",
    clientEmail: "taylor@example.com",
    contractPrice: 1000,
    quoteAcceptedAt: at,
    acceptedQuoteScope: [
      { section: "Work", title: "Cabinets", details: "", amount: 1000 },
    ],
    msaPermitResponsibility: "Owner obtains and pays",
  } as Quote;
  project.msaPaymentSchedule = defaultMsaPaymentSchedule(project);
  project.msaContractTerms = defaultMsaContractTerms(
    project,
    project.acceptedQuoteScope!,
  );
  const agreement = prepareMsa(
    project,
    [],
    {
      owner: "Taylor Customer",
      ownerEmail: "taylor@example.com",
      signerTitle: "Manager",
      signatureStrokes: [
        [
          [0.1, 0.2],
          [0.2, 0.3],
        ],
      ],
    },
    { id: "staff", name: "Staff" },
    at,
  );
  project.invoiceDefaults!.customerNote = "Changed later";
  expect(agreement.invoiceDefaults?.customerNote).toBe(
    "Checks payable to Premium Remodel",
  );
  expect(
    clientContractInvoice(
      { ...agreement, status: "signed", transactionDate: "2026-11-21" },
      0,
    ),
  ).toMatchObject({
    title: "Remodel invoice",
    depositDueDate: "2026-11-28",
    depositCents: 30000,
    customerNote: "Checks payable to Premium Remodel",
  });
});
test("message templates validate variables and render safe text through the actual email and SMS formatters", () => {
  const s = defaultOperatingSettings();
  expect(
    operatingSettingsSchema.safeParse({
      ...s,
      messages: { ...s.messages, quoteSubject: "Hello\r\nBcc: someone" },
    }).success,
  ).toBe(false);
  expect(
    operatingSettingsSchema.safeParse({
      ...s,
      messages: { ...s.messages, leadBody: "{{unsupported}}" },
    }).success,
  ).toBe(false);
  const body = renderMessageTemplate(
    "Hello {{firstName}} from {{businessName}}",
    { firstName: "<img src=x>", businessName: "Premium Remodel" },
  );
  const email = renderLeadAcknowledgement({
    business: { name: "Premium Remodel", website: "", email: "", phone: "" },
    subject: "Request received",
    message: body,
  });
  expect(email.html).not.toContain("<img src=x>");
  expect(email.html).toContain("&lt;img src=x&gt;");
  expect(email.text).toContain(body);
  const w = demoWorkspace();
  expect(
    homeownerScheduleSmsMessage(
      [w.tasks[0]],
      w.projects[0],
      w.contacts[0],
      "Premium Remodel",
      "Call the office for changes.",
    ),
  ).toContain("Call the office for changes.");
});
test("portal policy applies to deep links, payment blocks and serialized schedule times", () => {
  const p = defaultOperatingSettings().portal;
  p.scheduleTimes = false;
  p.agreements = false;
  p.payments = false;
  expect(portalViewAllowed(p, "msa")).toBe(false);
  expect(portalViewAllowed(p, "wallet")).toBe(false);
  expect(portalViewAllowed(p, "contact")).toBe(true);
  expect(portalFlowBlockAllowed(p, "signature_collection", "signature")).toBe(
    false,
  );
  expect(
    portalFlowBlockAllowed(p, "deposit_payment", "deposit_collection"),
  ).toBe(false);
  expect(portalFlowBlockAllowed(p, "quote_builder", "scope_of_work")).toBe(
    true,
  );
  const items = [{ title: "Inspection", startTime: "09:00", endTime: "10:00" }];
  expect(JSON.stringify(visibleSchedule(items, p))).not.toContain("09:00");
  p.schedule = false;
  expect(visibleSchedule(items, p)).toEqual([]);
  expect(
    operatingSettingsSchema.safeParse({
      ...defaultOperatingSettings(),
      portal: { ...p, invoices: false, payments: true },
    }).success,
  ).toBe(false);
});
test("operating settings migration denies direct client access and compare-and-swap isolates organizations", async () => {
  const db = new PGlite();
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create table organizations(id uuid primary key);insert into organizations values ('${a}'),('${b}');`,
    );
    const sql = await readFile(
      "supabase/migrations/202611210001_operating_settings.sql",
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    await db.query(
      "insert into remodel_operating_settings(organization_id,settings) values($1,$2),($3,$4)",
      [
        a,
        JSON.stringify(defaultOperatingSettings()),
        b,
        JSON.stringify(defaultOperatingSettings()),
      ],
    );
    await db.exec("set role authenticated");
    await expect(
      db.query("select * from remodel_operating_settings"),
    ).rejects.toThrow("permission denied");
    await db.exec("reset role;set role anon");
    await expect(
      db.query("update remodel_operating_settings set revision=2"),
    ).rejects.toThrow("permission denied");
    await db.exec("reset role;set role service_role");
    expect(
      (
        await db.query(
          "update remodel_operating_settings set revision=revision+1 where organization_id=$1 and revision=$2 returning revision",
          [a, 1],
        )
      ).rows,
    ).toEqual([{ revision: 2 }]);
    expect(
      (
        await db.query(
          "update remodel_operating_settings set revision=revision+1 where organization_id=$1 and revision=$2 returning revision",
          [a, 1],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await db.query(
          "select revision from remodel_operating_settings where organization_id=$1",
          [b],
        )
      ).rows,
    ).toEqual([{ revision: 1 }]);
  } finally {
    await db.close();
  }
});
test("operating settings endpoints require authenticated membership", async ({
  request,
}) => {
  expect((await request.get("/api/operating-settings")).status()).toBe(401);
  expect(
    (
      await request.patch("/api/operating-settings", {
        headers: { Origin: "http://localhost:3100" },
        data: { section: "invoices", revision: 0, value: {} },
      })
    ).status(),
  ).toBe(401);
});

test("release migration wakes automatic communication holds and preserves explicit wait nodes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table remodel_workflow_versions (id text primary key, organization_id text, graph jsonb);
      create table remodel_workflow_runs (id text primary key, version_id text, organization_id text);
      create table remodel_workflow_waits (id text primary key, run_id text, organization_id text, status text, mode text, node_id text, wake_at timestamptz);
      insert into remodel_workflow_versions values ('v1','org1','{"nodes":[{"id":"email","type":"action.sendEmail"},{"id":"wait","type":"logic.wait"}]}');
      insert into remodel_workflow_runs values ('r1','v1','org1');
      insert into remodel_workflow_waits values
        ('message','r1','org1','waiting','timestamp','email',now() + interval '1 day'),
        ('intentional','r1','org1','waiting','timestamp','wait',now() + interval '1 day'),
        ('other-tenant','r1','org2','waiting','timestamp','email',now() + interval '1 day');`);
    await db.exec(
      await readFile(
        "supabase/migrations/202611220003_release_communication_windows.sql",
        "utf8",
      ),
    );
    const result = await db.query<{ id: string; due: boolean }>(
      "select id, wake_at <= now() as due from remodel_workflow_waits order by id",
    );
    expect(result.rows).toEqual([
      { id: "intentional", due: false },
      { id: "message", due: true },
      { id: "other-tenant", due: false },
    ]);
  } finally {
    await db.close();
  }
});
