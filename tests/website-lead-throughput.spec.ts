import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { test, expect } from "@playwright/test";
import {
  captureWebsiteLead,
  parseCapturedWebsiteLead,
  runCapturedLeadFollowups,
} from "@/lib/website-lead-intake";
import {
  deliverWebsiteLeadCopy,
  requestsBackgroundLeadDelivery,
  WEBSITE_LEAD_GHL_URL,
} from "@/lib/website-lead-delivery";

const organizationId = "10000000-0000-4000-8000-000000000001";
const payload = {
  first_name: "Throughput",
  last_name: "Test",
  email: "throughput@example.com",
  phone: "+19195550123",
  zip: "27511",
  address: "123 Test Lane",
  project: "Bathroom Remodel",
  project_description: "",
  sms_appointment_opt_in: false,
  sms_marketing_opt_in: false,
};
const job = {
  id: randomUUID(),
  organization_id: organizationId,
  claim_token: randomUUID(),
  attempt_count: 1,
  payload,
};
const options = { primaryOrganizationId: organizationId };

test("intake cannot acknowledge malformed captures or contradictory queue receipts", () => {
  const saved = { contactId: randomUUID(), eventId: randomUUID() };
  expect(parseCapturedWebsiteLead(saved)).toEqual(saved);
  expect(
    parseCapturedWebsiteLead({
      ...saved,
      deliveryId: randomUUID(),
      goHighLevelQueued: true,
    }).goHighLevelQueued,
  ).toBe(true);
  for (const receipt of [
    null,
    {},
    { ...saved, deliveryId: randomUUID() },
    { ...saved, goHighLevelQueued: true },
  ])
    expect(() => parseCapturedWebsiteLead(receipt)).toThrow();
});

test("background handoff is limited to the primary public website, not other organizations or portals", () => {
  const input = {
    url: "https://servicebuddy-ui.vercel.app/api/leads?background_delivery=1",
    origin: "https://www.premiumremodel.com",
    organizationId,
    primaryOrganizationId: organizationId,
    fromPortal: false,
  };
  expect(requestsBackgroundLeadDelivery(input)).toBe(true);
  for (const change of [
    { primaryOrganizationId: undefined },
    { organizationId: randomUUID() },
    { fromPortal: true },
    { origin: "https://another-company.example" },
    { url: "https://servicebuddy-ui.vercel.app/api/leads" },
  ])
    expect(requestsBackgroundLeadDelivery({ ...input, ...change })).toBe(false);
});

test("old schema falls back before capture, while real failures never attempt a second save", async () => {
  for (const code of ["PGRST202", "23505", "57014", "XX000"]) {
    const calls: string[] = [];
    const result = await captureWebsiteLead(
      { p_lead: {} },
      payload,
      async (name) => {
        calls.push(name);
        return calls.length === 1
          ? { data: null, error: { code } }
          : { data: {}, error: null };
      },
    );
    expect(calls).toEqual(
      code === "PGRST202"
        ? [
            "remodel_capture_website_lead_with_delivery",
            "remodel_capture_workflow_website_lead",
          ]
        : ["remodel_capture_website_lead_with_delivery"],
    );
    expect(result.error?.code).toBe(code === "PGRST202" ? undefined : code);
  }
});

test("legacy capture never creates a marketing job", async () => {
  const names: string[] = [];
  await captureWebsiteLead({}, undefined, async (name) => {
    names.push(name);
    return { data: {}, error: null };
  });
  expect(names).toEqual(["remodel_capture_workflow_website_lead"]);
});

test("workflow and marketing start independently; a stalled workflow cannot hold the copy", async () => {
  let finishWorkflow!: () => void;
  const workflow = new Promise<void>((resolve) => {
    finishWorkflow = resolve;
  });
  let copied = false;
  const running = runCapturedLeadFollowups(
    { eventId: "saved-event", deliveryId: "saved-copy" },
    {
      workflow: () => workflow,
      delivery: async () => {
        copied = true;
      },
      report: () => {},
    },
  );
  await Promise.resolve();
  expect(copied).toBe(true);
  finishWorkflow();
  await running;
  const reported: string[] = [];
  await runCapturedLeadFollowups(
    { eventId: "saved-event", deliveryId: "saved-copy" },
    {
      workflow: async () => {
        throw new Error("offline");
      },
      delivery: async () => {
        throw new Error("offline");
      },
      report: (message) => {
        reported.push(message);
      },
    },
  );
  expect(reported).toHaveLength(2);
});

test("the server sends the existing destination/payload and preserves each SMS choice", async () => {
  for (const appointment of [false, true])
    for (const marketing of [false, true]) {
      let calls = 0;
      const outcome = await deliverWebsiteLeadCopy(
        {
          ...job,
          payload: {
            ...payload,
            sms_appointment_opt_in: appointment,
            sms_marketing_opt_in: marketing,
          },
        },
        {
          ...options,
          request: async (url, init) => {
            calls += 1;
            expect(url).toBe(WEBSITE_LEAD_GHL_URL);
            expect(init?.redirect).toBe("error");
            expect(init?.headers).toMatchObject({
              "Idempotency-Key": `website-lead:${job.id}`,
            });
            expect(JSON.parse(String(init?.body))).toEqual({
              ...payload,
              sms_appointment_opt_in: appointment,
              sms_marketing_opt_in: marketing,
            });
            return new Response(null, { status: 200 });
          },
        },
      );
      expect(outcome.status).toBe("delivered");
      expect(calls).toBe(1);
    }
});

test("uncertain timeouts and server failures require review instead of blind retries", async () => {
  const timeout = await deliverWebsiteLeadCopy(job, {
    ...options,
    timeoutMs: 5,
    request: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("timeout")),
          { once: true },
        );
      }),
  });
  expect(timeout.status).toBe("needs_attention");
  for (const status of [301, 400, 401, 500, 503]) {
    const outcome = await deliverWebsiteLeadCopy(job, {
      ...options,
      request: async () => new Response(null, { status }),
    });
    expect(outcome.status).toBe("needs_attention");
  }
  let sent = false;
  const wrongOrganization = await deliverWebsiteLeadCopy(
    { ...job, organization_id: randomUUID() },
    {
      ...options,
      request: async () => {
        sent = true;
        return new Response();
      },
    },
  );
  expect(wrongOrganization.status).toBe("needs_attention");
  expect(sent).toBe(false);
});

test("explicit rate-limit rejections retry with backoff and a bounded attempt count", async () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  const request: typeof fetch = async () =>
    new Response(null, { status: 429, headers: { "Retry-After": "120" } });
  expect(
    await deliverWebsiteLeadCopy(job, { ...options, request, now: () => now }),
  ).toMatchObject({
    status: "retry_wait",
    availableAt: "2026-11-15T12:02:00.000Z",
  });
  expect(
    (
      await deliverWebsiteLeadCopy(
        { ...job, attempt_count: 3 },
        { ...options, request },
      )
    ).status,
  ).toBe("needs_attention");
});

test("database capture, delivery claims, replay protection, and crash recovery are durable", async () => {
  const db = new PGlite();
  try {
    // Disposable PostgreSQL WASM database; no production credentials, jobs or messages.
    // Existing capture is represented by its write contract so this test targets
    // the new wrapper's transaction boundary and delivery state machine.
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.organizations(id uuid primary key);
      create table public.remodel_records(id uuid primary key, organization_id uuid, data jsonb, unique(organization_id,id));
      create table public.remodel_workflow_events(id uuid primary key);
      create table public.remodel_automation_outbox(event_id uuid primary key);
      insert into public.organizations values ('${organizationId}');
      create function public.remodel_capture_workflow_website_lead(uuid,jsonb,jsonb,boolean,jsonb)
      returns jsonb language plpgsql as $$ begin
        insert into public.remodel_records values (($2->>'id')::uuid, $1, $2), (($3->>'id')::uuid, $1, $3);
        insert into public.remodel_workflow_events values (($5->>'id')::uuid);
        insert into public.remodel_automation_outbox values (($5->>'id')::uuid);
        return jsonb_build_object('contactId',$2->>'id','leadId',$3->>'id','eventId',$5->>'id');
      end; $$;
    `);
    await db.exec(
      await readFile(
        "supabase/migrations/202611150001_website_lead_delivery_outbox.sql",
        "utf8",
      ),
    );
    // Migration replay after a migration-runner interruption is harmless.
    await db.exec(
      await readFile(
        "supabase/migrations/202611150001_website_lead_delivery_outbox.sql",
        "utf8",
      ),
    );
    const captureArgs = [
      organizationId,
      { id: randomUUID() },
      { id: randomUUID() },
      false,
      { id: randomUUID() },
      payload,
    ];
    const sql =
      "select public.remodel_capture_website_lead_with_delivery($1,$2,$3,$4,$5,$6) as saved";
    const capture = await db.query<{
      saved: { deliveryId: string; goHighLevelQueued: boolean };
    }>(sql, captureArgs);
    expect(capture.rows[0].saved.goHighLevelQueued).toBe(true);
    const deliveryId = capture.rows[0].saved.deliveryId;
    const counts = await db.query<{
      records: number;
      jobs: number;
      workflows: number;
    }>(`select
      (select count(*)::int from remodel_records) as records,
      (select count(*)::int from remodel_website_lead_deliveries) as jobs,
      (select count(*)::int from remodel_automation_outbox) as workflows`);
    expect(counts.rows[0]).toEqual({ records: 2, jobs: 1, workflows: 1 });
    await expect(db.query(sql, captureArgs)).rejects.toThrow();
    const claimed = await db.query<{
      claim: {
        jobs: Array<{ id: string; claim_token: string }>;
        needsAttention: number;
      };
    }>("select remodel_claim_website_lead_deliveries($1,1) as claim", [
      deliveryId,
    ]);
    const claimedJob = claimed.rows[0].claim.jobs[0];
    expect(claimedJob.id).toBe(deliveryId);
    const repeated = await db.query<{ claim: { jobs: unknown[] } }>(
      "select remodel_claim_website_lead_deliveries($1,1) as claim",
      [deliveryId],
    );
    expect(repeated.rows[0].claim.jobs).toEqual([]);
    const wrongToken = await db.query<{ finished: boolean }>(
      "select remodel_finish_website_lead_delivery($1,$2,'delivered') as finished",
      [deliveryId, randomUUID()],
    );
    expect(wrongToken.rows[0].finished).toBe(false);
    const success = await db.query<{ finished: boolean }>(
      "select remodel_finish_website_lead_delivery($1,$2,'delivered') as finished",
      [deliveryId, claimedJob.claim_token],
    );
    expect(success.rows[0].finished).toBe(true);
    const final = await db.query<{ status: string; payload: unknown }>(
      "select status,payload from remodel_website_lead_deliveries where id=$1",
      [deliveryId],
    );
    expect(final.rows[0]).toEqual({ status: "delivered", payload: {} });

    // Failure after the existing capture writes must roll everything back.
    const before = await db.query("select count(*) from remodel_records");
    const orphanArgs = [
      organizationId,
      { id: randomUUID() },
      { id: randomUUID() },
      false,
      { id: randomUUID() },
      payload,
    ];
    await db.exec(
      "alter table remodel_website_lead_deliveries add constraint reject_test_copy check (false) not valid",
    );
    await expect(db.query(sql, orphanArgs)).rejects.toThrow();
    expect(
      (await db.query("select count(*) from remodel_records")).rows,
    ).toEqual(before.rows);
    await db.exec(
      "alter table remodel_website_lead_deliveries drop constraint reject_test_copy",
    );

    const second = await db.query<{ saved: { deliveryId: string } }>(
      sql,
      orphanArgs,
    );
    const secondId = second.rows[0].saved.deliveryId;
    await db.query("select remodel_claim_website_lead_deliveries($1,1)", [
      secondId,
    ]);
    await db.query(
      "update remodel_website_lead_deliveries set claimed_at=now()-interval '3 minutes' where id=$1",
      [secondId],
    );
    const stale = await db.query<{
      claim: { jobs: unknown[]; needsAttention: number };
    }>("select remodel_claim_website_lead_deliveries(null,10) as claim");
    expect(stale.rows[0].claim).toEqual({ jobs: [], needsAttention: 1 });
    const retryArgs = [
      organizationId,
      { id: randomUUID() },
      { id: randomUUID() },
      false,
      { id: randomUUID() },
      payload,
    ];
    const retryCapture = await db.query<{ saved: { deliveryId: string } }>(
      sql,
      retryArgs,
    );
    const retryId = retryCapture.rows[0].saved.deliveryId;
    const firstAttempt = await db.query<{
      claim: { jobs: Array<{ claim_token: string }> };
    }>("select remodel_claim_website_lead_deliveries($1,1) as claim", [
      retryId,
    ]);
    await db.query(
      "select remodel_finish_website_lead_delivery($1,$2,'retry_wait','rate limited',now()+interval '5 minutes')",
      [retryId, firstAttempt.rows[0].claim.jobs[0].claim_token],
    );
    expect(
      (
        await db.query<{ claim: { jobs: unknown[] } }>(
          "select remodel_claim_website_lead_deliveries($1,1) as claim",
          [retryId],
        )
      ).rows[0].claim.jobs,
    ).toEqual([]);
    await db.query(
      "update remodel_website_lead_deliveries set available_at=now()-interval '1 minute' where id=$1",
      [retryId],
    );
    const resumed = await db.query<{
      claim: { jobs: Array<{ attempt_count: number; claim_token: string }> };
    }>("select remodel_claim_website_lead_deliveries($1,1) as claim", [
      retryId,
    ]);
    expect(resumed.rows[0].claim.jobs[0].attempt_count).toBe(2);
    expect(resumed.rows[0].claim.jobs[0].claim_token).not.toBe(
      firstAttempt.rows[0].claim.jobs[0].claim_token,
    );
    await db.query("delete from remodel_records where id=$1", [
      (retryArgs[2] as { id: string }).id,
    ]);
    expect(
      (
        await db.query(
          "select id from remodel_website_lead_deliveries where id=$1",
          [retryId],
        )
      ).rows,
    ).toEqual([]);
    const privileges = await db.query<{
      can_read: boolean;
      can_claim: boolean;
    }>(`select
      has_table_privilege('anon','remodel_website_lead_deliveries','select') as can_read,
      has_function_privilege('authenticated','remodel_claim_website_lead_deliveries(uuid,integer)','execute') as can_claim`);
    expect(privileges.rows[0]).toEqual({ can_read: false, can_claim: false });
  } finally {
    await db.close();
  }
});
