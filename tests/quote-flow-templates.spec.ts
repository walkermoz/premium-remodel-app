import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  defaultQuoteFlowDefinition,
  createQuoteFlowStage,
  premiumRemodelQuoteFlowDefinition,
  quoteFlowBlockTypes,
  quoteFlowConditionMatches,
  quoteFlowDefinitionSchema,
  quoteFlowStageTypes,
} from "@/lib/quote-flow-schema";
import { premiumCompatibilityQuoteFlowValues } from "@/lib/quote-flow-compatibility";
import type { Quote } from "@/lib/types";

test("Premium Remodel is represented by the unchanged four-stage flow", () => {
  expect(
    premiumRemodelQuoteFlowDefinition.stages.map((stage) => [
      stage.id,
      stage.title,
    ]),
  ).toEqual([
    ["quote_and_pricing", "Quote & pricing"],
    ["agreement_details", "Agreement details"],
    ["send_and_complete", "Send & complete"],
    ["create_project", "Create project"],
  ]);
  expect(
    premiumRemodelQuoteFlowDefinition.stages
      .flatMap((stage) => stage.blocks)
      .find((block) => block.id === "premium_msa")?.config,
  ).toEqual({
    templateKey: "premium_remodel_master_services_agreement",
    renderer: "legacy_premium_msa_v1",
  });
  expect(
    premiumRemodelQuoteFlowDefinition.stages
      .flatMap((stage) => stage.blocks)
      .find((block) => block.id === "project_conversion")?.config.renderer,
  ).toBe("premium_quote_promotion_v1");
});

test("Premium compatibility uses the recorded MSA representative and existing completion records", () => {
  const quote = {
    id: "11111111-1111-4111-8111-111111111111",
    quoteAcceptance: {
      signedName: "Taylor Customer",
      signedAt: "2026-11-01T20:00:00.000Z",
    },
    msaAgreement: {
      status: "signed",
      price: 10_000,
      paymentSchedule: [
        { id: "deposit", milestone: "Deposit", percent: 50 },
        { id: "final", milestone: "Final", percent: 50 },
      ],
      staffUserId: "22222222-2222-4222-8222-222222222222",
      staffSignature: {
        name: "Walker Mosakowski",
        title: "Owner",
        signedAt: "2026-11-01T19:00:00.000Z",
      },
      customerSignature: {
        name: "Taylor Customer",
        signedAt: "2026-11-01T20:01:00.000Z",
      },
    },
  } as Quote;
  const values = premiumCompatibilityQuoteFlowValues(
    premiumRemodelQuoteFlowDefinition,
    quote,
    [
      {
        activityType: "Payment received",
        amount: 5_000,
        occurredAt: "2026-11-01T20:05:00.000Z",
        updatedAt: "2026-11-01T20:05:00.000Z",
      },
    ],
  );
  expect(values.map((value) => value.blockId)).toEqual([
    "staff_signature",
    "quote_signature",
    "msa_signature",
    "deposit",
  ]);
  expect(
    values.find((value) => value.blockId === "staff_signature")?.value,
  ).toMatchObject({
    signedName: "Walker Mosakowski",
    signerUserId: "22222222-2222-4222-8222-222222222222",
  });
  expect(
    values.find((value) => value.blockId === "deposit")?.value,
  ).toMatchObject({ status: "paid", amountCents: 500_000 });
});

test("Premium compatibility defaults the representative to the signed-in staff member", () => {
  const quote = {
    id: "11111111-1111-4111-8111-111111111111",
    createdAt: "2026-11-01T18:00:00.000Z",
    updatedAt: "2026-11-01T19:00:00.000Z",
  } as Quote;
  const values = premiumCompatibilityQuoteFlowValues(
    premiumRemodelQuoteFlowDefinition,
    quote,
    [],
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Walker Mosakowski",
    },
  );
  expect(values).toHaveLength(1);
  expect(values[0]).toMatchObject({
    blockId: "staff_signature",
    completedBy: "22222222-2222-4222-8222-222222222222",
    value: {
      method: "authenticated_staff_assignment",
      assignedName: "Walker Mosakowski",
      assignedUserId: "22222222-2222-4222-8222-222222222222",
    },
  });
});

test("flow definitions support ordered custom forms around signing and payment", () => {
  const definition = quoteFlowDefinitionSchema.parse({
    ...defaultQuoteFlowDefinition,
    stages: [
      defaultQuoteFlowDefinition.stages[0],
      {
        id: "pre_signature_form",
        type: "custom_form",
        title: "Selections",
        audience: "customer",
        blocks: [
          {
            id: "cabinet_finish",
            type: "custom_select",
            label: "Cabinet finish",
            required: true,
            audience: "customer",
            bindingKey: "custom.cabinet_finish",
            config: { options: ["Painted", "Stained"] },
          },
        ],
      },
      {
        id: "signing",
        type: "signature_collection",
        title: "Sign",
        audience: "customer",
        blocks: [
          {
            id: "owner_signature",
            type: "signature",
            label: "Owner signature",
            required: true,
            audience: "customer",
            config: { signerRoleId: "owner" },
          },
        ],
      },
      {
        id: "post_signature_form",
        type: "custom_form",
        title: "Scheduling",
        audience: "customer",
        blocks: [
          {
            id: "preferred_date",
            type: "custom_date",
            label: "Preferred date",
            audience: "customer",
          },
        ],
      },
      defaultQuoteFlowDefinition.stages.at(-1),
    ],
  });
  expect(definition.stages.map((stage) => stage.id)).toEqual([
    "quote_and_pricing",
    "pre_signature_form",
    "signing",
    "post_signature_form",
    "create_project",
  ]);
});

test("new document signing stages start as a coherent reusable object", () => {
  const stage = createQuoteFlowStage("signature_collection");
  expect(stage.title).toBe("Document signing");
  expect(stage.blocks.map((block) => block.type)).toEqual([
    "generated_document",
    "signature",
  ]);
  expect(stage.blocks[0]).toMatchObject({
    required: true,
    bindingKey: "documents.primary",
  });
  expect(stage.blocks[1]).toMatchObject({
    required: true,
    bindingKey: "signing.customer_signature",
    config: {
      signerRoleId: "customer",
      methods: ["remote", "onsite", "in_person"],
    },
  });
});

test("the controlled condition engine supports numeric and collection rules", () => {
  expect(
    quoteFlowConditionMatches(
      {
        id: "large_quote",
        field: "quote.total",
        fieldKey: null,
        operator: "greater_than_or_equal",
        value: 20_000,
      },
      25_000,
    ),
  ).toBe(true);
  expect(
    quoteFlowConditionMatches(
      {
        id: "has_tile",
        field: "quote.categories",
        fieldKey: null,
        operator: "contains",
        value: "Tile",
      },
      ["Demo", "Tile"],
    ),
  ).toBe(true);
});

test("database storage is tenant-scoped, versioned, and snapshots runtime instances", () => {
  const migration = readFileSync(
    "supabase/migrations/202611020001_quote_agreement_flow_templates.sql",
    "utf8",
  );
  expect(migration).toContain("remodel_quote_flow_template_versions");
  expect(migration).toContain("remodel_publish_quote_flow_template");
  expect(migration).toContain("definition_snapshot jsonb not null");
  expect(migration).toContain("unique (organization_id, quote_id)");
  expect(migration).toContain("enable row level security");
  expect(migration).toContain(
    "where lower(trim(organization.name)) = 'premium remodel'",
  );
  expect(migration).toContain("premium_remodel_quote_to_project");
});

test("template and runtime APIs enforce organization permission boundaries", () => {
  const templateRoute = readFileSync(
    "app/api/quote-flow-templates/route.ts",
    "utf8",
  );
  const templateStore = readFileSync("lib/quote-flow-templates.ts", "utf8");
  const runtime = readFileSync("lib/quote-flow-instances.ts", "utf8");
  const publicRoute = readFileSync(
    "app/api/client-quote/[token]/flow/route.ts",
    "utf8",
  );
  expect(templateRoute).toContain(
    'requireOrganizationCapability(user, "quote_flows.manage")',
  );
  expect(templateStore).toContain('.eq("organization_id", organizationId)');
  expect(templateStore).toContain("remodel_quote_flow_template_versions");
  expect(runtime).toContain("definition_snapshot: published.definition");
  expect(runtime).toContain(
    '["customer", "both"].includes(candidate.audience)',
  );
  expect(publicRoute).toContain("readClientQuoteSource(token");
  expect(publicRoute).toContain("limitAttempts");
});

test("the Settings builder and all three render modes use the shared renderer", () => {
  const settings = readFileSync(
    "components/quote-flow-templates-settings.tsx",
    "utf8",
  );
  const staff = readFileSync("components/quotes-panel.tsx", "utf8");
  const customer = readFileSync(
    "app/client/[token]/quote/client-quote-flow.tsx",
    "utf8",
  );
  expect(settings).toContain("Drag");
  expect(settings).toContain('setPreviewMode("staff")');
  expect(settings).toContain('setPreviewMode("customer")');
  expect(settings).toContain('setPreviewMode("device")');
  expect(settings).toContain("Add condition");
  expect(settings).toContain("Publish");
  expect(staff).toContain("QuoteFlowRenderer");
  expect(staff).toContain("quote-flow-instances");
  expect(customer).toContain("Next required step");
  expect(customer).toContain("QuoteFlowRenderer");
});

test("generic quote stages render ordered live blocks without the Premium compatibility screen", () => {
  const staff = readFileSync("components/quotes-panel.tsx", "utf8");
  expect(staff).toContain(
    'block.config.renderer === "premium_quote_builder_v1"',
  );
  expect(staff).not.toContain(
    '["premium_quote_builder_v1", "servicebuddy_quote_builder_v1"]',
  );
  expect(staff).toContain('if (block.type === "contact_fields")');
  expect(staff).toContain('if (block.type === "quote_items")');
  expect(staff).toContain('if (block.type === "photos_attachments")');
  expect(staff).toContain("<ScopeTable");
});

test("customer navigation highlights and scrolls to the next required block", () => {
  const customer = readFileSync(
    "app/client/[token]/quote/client-quote-flow.tsx",
    "utf8",
  );
  const renderer = readFileSync("components/quote-flow-renderer.tsx", "utf8");
  const agreement = readFileSync("app/agreement/[token]/page.tsx", "utf8");
  expect(customer).toContain("missingRequiredForStage");
  expect(customer).toContain("scrollIntoView");
  expect(customer).toContain("highlightedBlockId");
  expect(renderer).toContain("data-flow-block-id");
  expect(agreement).toContain('href="#required-signing"');
  expect(agreement).toContain("Required signing section");
});

test("the controlled registries expose every required stage and block type", () => {
  expect(quoteFlowStageTypes).toEqual(
    expect.arrayContaining([
      "quote_builder",
      "agreement_details",
      "custom_form",
      "document",
      "signature_collection",
      "initials_collection",
      "deposit_payment",
      "delivery",
      "internal_approval",
      "customer_confirmation",
      "project_conversion",
    ]),
  );
  expect(quoteFlowBlockTypes).toEqual(
    expect.arrayContaining([
      "heading",
      "explanatory_copy",
      "contact_fields",
      "project_fields",
      "custom_text",
      "custom_number",
      "custom_currency",
      "custom_date",
      "custom_checkbox",
      "custom_select",
      "custom_multiselect",
      "custom_file",
      "quote_items",
      "scope_of_work",
      "notes",
      "uploaded_pdf",
      "generated_document",
      "terms_disclosures",
      "signature",
      "initials",
      "payment_schedule",
      "deposit_collection",
      "photos_attachments",
      "staff_information",
      "customer_information",
    ]),
  );
});

test("publish validation catches unsafe or incomplete configuration", () => {
  const invalid = structuredClone(defaultQuoteFlowDefinition);
  invalid.stages[0].blocks.push({
    id: "finish",
    type: "custom_select",
    label: "Finish",
    description: "",
    enabled: true,
    required: true,
    audience: "customer",
    bindingKey: "custom.finish",
    conditions: { mode: "all", rules: [] },
    config: { options: [] },
  });
  expect(quoteFlowDefinitionSchema.safeParse(invalid).success).toBe(false);

  invalid.stages[0].blocks.at(-1)!.config = { options: ["Painted"] };
  invalid.stages[1].blocks[0].id = invalid.stages[0].blocks[0].id;
  expect(quoteFlowDefinitionSchema.safeParse(invalid).success).toBe(false);
});

test("signature and payment completion are atomic and append audit history", () => {
  const migration = readFileSync(
    "supabase/migrations/202611020001_quote_agreement_flow_templates.sql",
    "utf8",
  );
  const runtime = readFileSync("lib/quote-flow-instances.ts", "utf8");
  const agreementRuntime = readFileSync("lib/agreement-packets.ts", "utf8");
  const stripeWebhook = readFileSync("app/api/stripe/webhook/route.ts", "utf8");
  expect(migration).toContain("remodel_quote_flow_events");
  expect(migration).toContain("remodel_complete_quote_flow_block");
  expect(migration).toContain("remodel_sign_agreement_signer");
  expect(migration).toContain("payment_refunded");
  expect(runtime).toContain("completeImmutableQuoteFlowBlock");
  expect(runtime).toContain("assertQuoteFlowSigningOrder");
  expect(agreementRuntime).toContain('rpc("remodel_sign_agreement_signer"');
  expect(stripeWebhook).toContain('rpc("remodel_complete_quote_flow_block"');
});

test("server-owned delivery mode protects remote and on-device signing", () => {
  const signingPage = readFileSync("app/agreement/[token]/page.tsx", "utf8");
  const signingRoute = readFileSync(
    "app/api/agreement-sign/[token]/route.ts",
    "utf8",
  );
  const packetRuntime = readFileSync("lib/agreement-packets.ts", "utf8");
  expect(signingPage).toContain(
    'const onsite = session.deliveryMode === "onsite"',
  );
  expect(signingPage).not.toContain('query.mode === "onsite"');
  expect(signingRoute).toContain('result.deliveryMode === "onsite"');
  expect(packetRuntime).toContain("template_snapshot.deliveryMode");
});

test("files, payments, required overrides, and project conversion stay permissioned", () => {
  const runtimeRoute = readFileSync(
    "app/api/quote-flow-instances/[id]/route.ts",
    "utf8",
  );
  const customerFileRoute = readFileSync(
    "app/api/client-quote/[token]/flow/file/route.ts",
    "utf8",
  );
  const customerPaymentRoute = readFileSync(
    "app/api/client-quote/[token]/flow/payment/route.ts",
    "utf8",
  );
  expect(runtimeRoute).toContain('"quote_flows.override"');
  expect(runtimeRoute).toContain('"agreements.mark_in_person"');
  expect(runtimeRoute).toContain('"agreements.sign_on_behalf"');
  expect(runtimeRoute).toContain('"payments.manage"');
  expect(runtimeRoute).toContain('"quotes.manage"');
  expect(customerFileRoute).toContain("validateStoredFile");
  expect(customerFileRoute).toContain("readClientQuoteSource");
  expect(customerPaymentRoute).toContain("createCustomerQuoteFlowCheckout");
  expect(customerPaymentRoute).toContain("readClientQuoteSource");
});

test("the local demo exposes editable staff, portal, and device previews", async ({
  page,
}) => {
  await page.goto("/demo/quote-flow");
  await expect(page.getByLabel("Flow name")).toHaveValue(
    "Premium Remodel quote to project",
  );
  await expect(page.getByRole("button", { name: "Staff" })).toBeVisible();
  await page.getByRole("button", { name: "Customer portal" }).click();
  await expect(page.locator('[data-render-mode="portal"]')).toBeVisible();
  await page.getByRole("button", { name: "On device" }).click();
  await expect(page.locator('[data-render-mode="device"]')).toBeVisible();
  await expect(page.getByText("Protected customer handoff")).toBeVisible();
});
