import { test, expect, password } from "./supabase-fixture";
import {
  paperworkConfigurationSchema,
  resolvePaperworkVariable,
  interpolatePaperwork,
} from "@/lib/paperwork-schema";
import type { APIRequestContext } from "@playwright/test";
const cloud = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const headers = { Origin: "http://localhost:3100" };
test.use({ channel: "chromium" });

test("paperwork exposes only an allowlisted variable registry", () => {
  expect(paperworkConfigurationSchema.parse({}).enabled).toBe(false);
  expect(
    resolvePaperworkVariable({ contact: { name: "Taylor" } }, "contact.name"),
  ).toBe("Taylor");
  expect(
    resolvePaperworkVariable(
      { quote: { materialCost: 500 } },
      "quote.materialCost",
    ),
  ).toBeUndefined();
  expect(() => interpolatePaperwork("Hello {{contact.email}}", {})).toThrow(
    "Missing document variable",
  );
  expect(
    interpolatePaperwork("Hello {{contact.name}}", {
      contact: { name: "Taylor" },
    }),
  ).toBe("Hello Taylor");
  expect(
    resolvePaperworkVariable(
      { quote: { total: 0 } },
      "quote.total",
      "currency",
    ),
  ).toBe(0);
  expect(
    interpolatePaperwork("Amount {{quote.total}}", { quote: { total: 0 } }),
  ).toBe("Amount $0.00");
});

cloud(
  "revised requests, staff assignments and delivery failures stay isolated",
  async ({ company, page, request }) => {
    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const q = await quote(api);
    const t = await template(api, "form", true, { email: true });
    const first = await api.post("/api/paperwork", {
      headers,
      data: { templateId: t.id, quoteId: q.id },
    });
    expect(first.status()).toBe(201);
    const oldId = (await first.json()).id;
    const delivered = await api.post(`/api/paperwork/${oldId}`, {
      headers,
      data: { action: "portal", notify: true },
    });
    expect(delivered.status()).toBe(200);
    const delivery = await delivered.json();
    expect(delivery.delivery).toBe("failed");
    const tokenMatch = (await (await api.get(delivery.portalUrl)).text()).match(
      /href="(\/agreement\/[^"?]+)[?"]/,
    );
    expect(tokenMatch).toBeTruthy();
    const oldSigningPath = tokenMatch![1];
    const revised = await api.post("/api/paperwork", {
      headers,
      data: { templateId: t.id, quoteId: q.id, supersedesId: oldId },
    });
    expect(revised.status()).toBe(201);
    const newId = (await revised.json()).id;
    expect(
      (
        await company.admin
          .from("remodel_agreement_packets")
          .select("status")
          .eq("id", oldId)
          .single()
      ).data?.status,
    ).toBe("sent");
    expect(
      (
        await api.post(`/api/paperwork/${newId}`, {
          headers,
          data: { action: "portal", notify: false },
        })
      ).status(),
    ).toBe(200);
    expect((await api.get(oldSigningPath)).status()).toBe(404);
    const staff = await template(api, "form", true, {
      audience: "staff",
      portal: false,
      email: false,
    });
    const staffDraft = await api.post("/api/paperwork", {
      headers,
      data: { templateId: staff.id, quoteId: q.id },
    });
    expect(staffDraft.status()).toBe(201);
    const staffId = (await staffDraft.json()).id;
    expect(
      (
        await api.post(`/api/paperwork/${staffId}`, {
          headers,
          data: { action: "portal", notify: false },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await (await api.get("/api/paperwork?assigned=me")).json()
      ).documents.some((d: { id: string }) => d.id === staffId),
    ).toBe(true);
    const own = await api.post(`/api/paperwork/${staffId}/assigned`, {
      headers,
    });
    expect(own.status()).toBe(200);
    expect(
      (await request.get(`/api/paperwork/${staffId}/document`)).status(),
    ).toBe(401);
    const customer = await request.get(delivery.portalUrl);
    expect(customer.status()).toBe(200);
    expect((await customer.text()).includes(`api/paperwork/${staffId}`)).toBe(
      false,
    );
    const submitted = await api.post(
      (await own.json()).url.replace("/agreement/", "/api/agreement-sign/"),
      {
        headers,
        data: {
          signedName: "Workspace Owner",
          accepted: true,
          values: { selection: "Confirmed" },
        },
      },
    );
    expect(submitted.status()).toBe(200);
    expect(
      (
        await (await api.get("/api/paperwork?assigned=me")).json()
      ).documents.some((d: { id: string }) => d.id === staffId),
    ).toBe(false);
    const fresh = await quote(api);
    const project = await api.post("/api/quotes/accept", {
      headers,
      data: { id: fresh.id, updatedAt: fresh.updatedAt },
    });
    expect(project.status()).toBe(200);
    const current = (
      await (await api.get("/api/workspace")).json()
    ).quotes.find((item: { id: string }) => item.id === fresh.id);
    expect(current.status).toBe("Draft");
    expect(current.quoteAcceptance).toBeUndefined();
  },
);
async function quote(api: APIRequestContext, email = "taylor@example.com") {
  const response = await api.post("/api/workspace", {
    headers,
    data: {
      kind: "quote",
      data: {
        name: "Paperwork kitchen",
        address: "100 Temporary Test Lane",
        client: "Taylor Customer",
        clientEmail: email,
        clientPhone: "",
        startDate: "",
        endDate: "",
        status: "Draft",
        description: "Isolated paperwork verification",
        category: "Kitchen",
        cover: "",
      },
    },
  });
  expect(response.status()).toBe(201);
  const q = await response.json();
  const scope = await api.post("/api/workspace", {
    headers,
    data: {
      kind: "scope",
      data: {
        projectId: q.id,
        title: "Cabinet installation",
        details: "Install selected cabinets",
        quantity: 1,
        unit: "job",
        estimate: 10000,
        subCost: 0,
        materialCost: 0,
        contractorId: "",
        status: "To do",
      },
    },
  });
  expect(scope.status()).toBe(201);
  return q;
}
async function template(
  api: APIRequestContext,
  completion = "signature",
  enabled = true,
  settings: Record<string, unknown> = {},
) {
  const signature = completion === "signature";
  const created = await api.post("/api/agreement-templates", {
    headers,
    data: {
      name: signature ? "Work authorization" : "Kitchen selections",
      description: "Configured business paperwork",
      definition: {
        content: {
          title: "Work authorization",
          blocks: [
            {
              id: "terms",
              type: "paragraph",
              text: "{{organization.name}} will perform work for {{contact.name}} at {{quote.address}}. Quoted amount: {{quote.total}}.",
            },
          ],
        },
        paperwork: {
          enabled,
          completion,
          inPerson: true,
          portal: true,
          email: false,
          ...settings,
        },
        signerRoles: [
          {
            id: "customer",
            label: "Customer",
            partyType: settings.audience === "staff" ? "staff" : "customer",
            order: 1,
            required: true,
          },
        ],
        fields: [
          {
            id: "customer_name",
            label: "Customer name",
            type: "text",
            bindingKey: "contact.name",
            required: true,
          },
          {
            id: "staff_note",
            label: "Preparation notes",
            type: "multiline_text",
          },
          {
            id: "quote_total",
            label: "Quote total",
            type: "currency",
            bindingKey: "quote.total",
            required: true,
          },
          ...(signature
            ? [
                {
                  id: "customer_signature",
                  label: "Signature",
                  type: "signature",
                  signerRoleId: "customer",
                  required: true,
                },
              ]
            : [
                {
                  id: "selection",
                  label: "Cabinet color",
                  type: "text",
                  signerRoleId: "customer",
                  required: true,
                },
              ]),
        ],
      },
    },
  });
  expect(created.status()).toBe(201);
  const t = await created.json();
  const published = await api.post(`/api/agreement-templates/${t.id}/publish`, {
    headers,
    data: { revision: t.revision, changeNote: "Ready for quotes" },
  });
  expect(published.status()).toBe(200);
  return t;
}
cloud(
  "quote paperwork: configured templates, no-email in-person signature and frozen quote values",
  async ({ company, page }) => {
    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const q = await quote(api, "");
    await template(api, "signature", false);
    const t = await template(api);
    await page.goto(`/?view=Quotes&project=${q.id}`);
    await page
      .getByRole("navigation", { name: "Quote workflow" })
      .getByRole("button", { name: /Paperwork/ })
      .click();
    await expect(
      page.getByRole("button", { name: "Create project", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("region", { name: "MSA preparation" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Add paperwork", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Add paperwork" });
    await expect(dialog.getByLabel("Template").locator("option")).toHaveCount(
      2,
    );
    await dialog.getByLabel("Template").selectOption(t.id);
    await dialog.getByRole("button", { name: "Add draft" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".paperwork-row")).toHaveCount(1);
    await page.getByRole("button", { name: "Edit draft", exact: true }).click();
    const draft = page.getByRole("dialog", { name: "Edit paperwork draft" });
    await draft
      .getByLabel("Preparation notes")
      .fill("Confirm access with the customer.");
    await draft
      .getByRole("button", { name: "Save draft", exact: true })
      .click();
    await expect(draft).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Sign in person" }),
    ).toBeEnabled();
    let created = (
      await (await api.get(`/api/paperwork?quoteId=${q.id}`)).json()
    ).documents[0];
    const stored = await company.admin
      .from("remodel_agreement_packets")
      .select("template_snapshot,data_snapshot,status")
      .eq("id", created.id)
      .single();
    expect(stored.data?.template_snapshot.content.blocks[0].text).toContain(
      "$10,000.00",
    );
    expect(stored.data?.data_snapshot.quote.materialCost).toBeUndefined();
    expect(stored.data?.status).toBe("draft");
    expect(created.values.quote_total).toBe(10000);
    const scopeRow = await company.admin
      .from("remodel_records")
      .select("id,data")
      .eq("organization_id", company.organizationId)
      .eq("project_id", q.id)
      .eq("kind", "scope")
      .single();
    expect(scopeRow.error).toBeNull();
    expect(
      (
        await company.admin
          .from("remodel_records")
          .update({ data: { ...scopeRow.data!.data, estimate: 12000 } })
          .eq("id", scopeRow.data!.id)
          .eq("organization_id", company.organizationId)
      ).error,
    ).toBeNull();
    const frozen = (
      await (await api.get(`/api/paperwork?quoteId=${q.id}`)).json()
    ).documents[0];
    expect(frozen.values.quote_total).toBe(10000);
    const refresh = await api.put(`/api/paperwork/${created.id}`, {
      headers,
      data: {
        revision: created.revision,
        values: created.values,
        recipients: created.recipients,
        refreshFromQuote: true,
      },
    });
    expect(refresh.status()).toBe(200);
    created = (await (await api.get(`/api/paperwork?quoteId=${q.id}`)).json())
      .documents[0];
    expect(created.values.quote_total).toBe(12000);
    const pdf = await api.get(`/api/paperwork/${created.id}/document`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect(pdf.headers()["x-frame-options"]).toBe("SAMEORIGIN");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Sign in person" }).click();
    await page.waitForURL(/\/agreement\//);
    await expect(
      page.getByText("Taylor Customer will", { exact: false }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Type name", exact: true }).click();
    await page
      .getByText(
        "I have reviewed this document and intend my electronic signature to be legally binding.",
        { exact: true },
      )
      .click();
    await page
      .getByRole("button", { name: "Sign document", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Signature saved" }),
    ).toBeVisible();
    const complete = await api.get(`/api/paperwork?quoteId=${q.id}`);
    expect((await complete.json()).documents[0].status).toBe("completed");
    expect(
      (
        await api.put(`/api/paperwork/${created.id}`, {
          headers,
          data: {
            revision: created.revision,
            values: { staff_note: "Overwrite signed document" },
            recipients: created.recipients,
          },
        })
      ).status(),
    ).toBe(409);
    const evidence = await company.admin
      .from("remodel_agreement_signers")
      .select("signature_evidence")
      .eq("packet_id", created.id)
      .single();
    expect(evidence.data?.signature_evidence.contentSha256).toMatch(
      /^[a-f0-9]{64}$/,
    );
    const workspace = await api.get("/api/workspace");
    const state = await workspace.json();
    expect(state.quotes.find((x: { id: string }) => x.id === q.id).status).toBe(
      "Draft",
    );
    expect(state.projects.some((x: { id: string }) => x.id === q.id)).toBe(
      false,
    );
  },
);
cloud(
  "portal form completion stays separate from Accepted and explicit project creation",
  async ({ company, page }) => {
    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const q = await quote(api);
    const t = await template(api, "form");
    const created = await api.post("/api/paperwork", {
      headers,
      data: { quoteId: q.id, templateId: t.id },
    });
    expect(created.status()).toBe(201);
    const { id } = await created.json();
    const publish = await api.post(`/api/paperwork/${id}`, {
      headers,
      data: { action: "portal", notify: false },
    });
    expect(publish.status()).toBe(200);
    const published = await publish.json();
    expect(published.delivery).toBe("not_requested");
    await page.goto(published.portalUrl);
    await expect(
      page.getByRole("heading", { name: "Your paperwork" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Review & complete" }).click();
    await expect(page.getByRole("button", { name: "Type name" })).toHaveCount(
      0,
    );
    await page.getByLabel("Cabinet color").fill("Warm ivory");
    await page
      .getByText(
        "I have reviewed this document and confirm my answers are complete.",
        { exact: true },
      )
      .click();
    await page.getByRole("button", { name: "Submit document" }).click();
    await expect(
      page.getByRole("heading", { name: "Document submitted" }),
    ).toBeVisible();
    const signer = await company.admin
      .from("remodel_agreement_signers")
      .select("signature_evidence")
      .eq("packet_id", id)
      .single();
    expect(signer.data?.signature_evidence.signatureMethod).toBeUndefined();
    expect(signer.data?.signature_evidence.completionMode).toBe("form");
    let workspace = await (await api.get("/api/workspace")).json();
    let live = workspace.quotes.find((x: { id: string }) => x.id === q.id);
    const accepted = await api.post(`/api/quotes/${q.id}/status`, {
      headers,
      data: { status: "Accepted", updatedAt: live.updatedAt },
    });
    expect(accepted.status()).toBe(200);
    live = (await accepted.json()).quote;
    expect(live.quoteAcceptance).toBeUndefined();
    expect(live.acceptanceMethod).toBe("staff_marked");
    workspace = await (await api.get("/api/workspace")).json();
    expect(
      workspace.projects.find(
        (x: { sourceQuoteId?: string }) => x.sourceQuoteId === q.id,
      ),
    ).toBeUndefined();
    const projectResponse = await api.post("/api/quotes/accept", {
      headers,
      data: { id: q.id, updatedAt: live.updatedAt },
    });
    expect(projectResponse.status()).toBe(200);
    const project = await projectResponse.json();
    expect(project.id).not.toBe(q.id);
    expect(project.sourceQuoteId).toBe(q.id);
    const retry = await api.post("/api/quotes/accept", {
      headers,
      data: { id: q.id, updatedAt: live.updatedAt },
    });
    expect(retry.status()).toBe(200);
    expect((await retry.json()).id).toBe(project.id);
    workspace = await (await api.get("/api/workspace")).json();
    expect(
      workspace.quotes.find((x: { id: string }) => x.id === q.id).status,
    ).toBe("Accepted");
    expect(
      workspace.scope.filter(
        (x: { projectId: string }) => x.projectId === project.id,
      ),
    ).toHaveLength(1);
    await page.goto(published.portalUrl);
    await expect(
      page.getByRole("heading", { name: "Your paperwork" }),
    ).toBeVisible();
    await expect(
      page.getByText("Completed by you", { exact: true }),
    ).toBeVisible();
    const unrelated = await quote(api, "other@example.com");
    const other = await api.post("/api/paperwork", {
      headers,
      data: { quoteId: unrelated.id, templateId: t.id },
    });
    expect(other.status()).toBe(201);
    expect(
      (
        await api.post(`/api/paperwork/${(await other.json()).id}`, {
          headers,
          data: { action: "portal", notify: false },
        })
      ).status(),
    ).toBe(200);
    await page.goto(published.portalUrl);
    await expect(
      page.getByRole("heading", { name: "Kitchen selections", exact: true }),
    ).toHaveCount(1);
  },
);
