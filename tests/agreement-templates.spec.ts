import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import {
  agreementTemplateDefinitionSchema,
  defaultAgreementSignerRoles,
} from "@/lib/agreement-template-schema";

test("accepts reusable fields, data bindings, and ordered signers", () => {
  const parsed = agreementTemplateDefinitionSchema.parse({
    content: {
      title: "Service agreement",
      blocks: [{ id: "terms", type: "paragraph", text: "Project terms" }],
    },
    signerRoles: [
      {
        id: "staff",
        label: "Company representative",
        partyType: "staff",
        order: 1,
        required: true,
        nameBinding: "workspace.user.name",
        emailBinding: "workspace.user.email",
      },
      {
        ...defaultAgreementSignerRoles[0],
        order: 2,
      },
    ],
    fields: [
      {
        id: "customer_name",
        label: "Customer name",
        type: "text",
        required: true,
        bindingKey: "contact.name",
        signerRoleId: null,
        page: 1,
        x: 0.1,
        y: 0.2,
        width: 0.4,
        height: 0.05,
        placeholder: null,
      },
      {
        id: "customer_signature",
        label: "Customer signature",
        type: "signature",
        required: true,
        bindingKey: null,
        signerRoleId: "customer",
        page: 2,
        x: 0.1,
        y: 0.7,
        width: 0.5,
        height: 0.12,
        placeholder: null,
      },
    ],
  });

  expect(parsed.signerRoles.map((role) => role.id)).toEqual([
    "staff",
    "customer",
  ]);
  expect(parsed.fields[0].bindingKey).toBe("contact.name");
});

test("rejects incomplete page geometry and unassigned signatures", () => {
  expect(() =>
    agreementTemplateDefinitionSchema.parse({
      content: null,
      signerRoles: defaultAgreementSignerRoles,
      fields: [
        {
          id: "signature",
          label: "Signature",
          type: "signature",
          required: true,
          signerRoleId: null,
          page: 1,
          x: 0.1,
          y: null,
          width: 0.4,
          height: 0.1,
        },
      ],
    }),
  ).toThrow();
});

test("agreement storage is organization scoped and Premium legal content is seeded once", () => {
  const migration = readFileSync(
    "supabase/migrations/202611010001_modular_business_foundation.sql",
    "utf8",
  );
  expect(migration).toContain("remodel_agreement_template_versions");
  expect(migration).toContain("unique (organization_id, template_id, version)");
  expect(migration).toContain("remodel_publish_agreement_template");
  expect(migration).toContain("where lower(trim(o.name)) = 'premium remodel'");
  expect(migration).toContain("legacy_premium_msa");
});

test("generic agreement packets use ordered private signing links and immutable snapshots", () => {
  const service = readFileSync("lib/agreement-packets.ts", "utf8");
  const migration = readFileSync(
    "supabase/migrations/202611010001_modular_business_foundation.sql",
    "utf8",
  );
  const createRoute = readFileSync(
    "app/api/agreement-packets/route.ts",
    "utf8",
  );
  const signRoute = readFileSync(
    "app/api/agreement-sign/[token]/route.ts",
    "utf8",
  );
  expect(service).toContain("template_snapshot: templateSnapshot");
  expect(service).toContain("data_snapshot: input.dataSnapshot");
  expect(service).toContain("access_token_hash: access?.hash || null");
  expect(service).toContain(
    "An earlier signer must complete this agreement first.",
  );
  expect(service).toContain("signature_evidence");
  expect(service).toContain("Electronic signature audit");
  expect(service).toContain("signatureStrokes");
  expect(service).toContain("deliveryMode: input.deliveryMode");
  expect(migration).toContain("access_token_expires_at timestamptz");
  expect(migration).toContain(
    "references public.remodel_agreement_signers(organization_id, id)",
  );
  expect(createRoute).toContain(
    'requireOrganizationCapability(user, "agreements.manage")',
  );
  expect(signRoute).toContain("agreementSigningIpHash");
  expect(signRoute).toContain("markAgreementSignerNotified");
  expect(signRoute).toContain('result.deliveryMode === "onsite"');
});

test("generic agreement signing has an organization-branded public UI", () => {
  const page = readFileSync("app/agreement/[token]/page.tsx", "utf8");
  const form = readFileSync(
    "app/agreement/[token]/agreement-signing-form.tsx",
    "utf8",
  );
  const packetPanel = readFileSync(
    "components/agreement-packet-panel.tsx",
    "utf8",
  );
  expect(page).toContain("session.business.logoUrl");
  expect(page).toContain("Signing order");
  expect(page).toContain("/document");
  expect(page).toContain("Download signed agreement");
  expect(page).toContain("Staff workspace hidden");
  expect(form).toContain("MsaSignaturePad");
  expect(form).toContain("I have reviewed this agreement");
  expect(packetPanel).toContain("Create & send agreement");
  expect(packetPanel).toContain("Sign on this device");
  expect(packetPanel).toContain("Copy link");
});

test("on-device signing keeps Premium's quote and MSA in protected handoff mode", () => {
  const onsiteRoute = readFileSync(
    "app/api/quotes/[id]/onsite-signing/route.ts",
    "utf8",
  );
  const quotePage = readFileSync("app/client/[token]/quote/page.tsx", "utf8");
  const acceptance = readFileSync(
    "app/client/[token]/quote/customer-acceptance.tsx",
    "utf8",
  );
  const quotePanel = readFileSync("components/quotes-panel.tsx", "utf8");
  const msaPanel = readFileSync("components/msa-signing-panel.tsx", "utf8");
  const prepareRoute = readFileSync(
    "app/api/msa/[projectId]/prepare/route.ts",
    "utf8",
  );
  expect(onsiteRoute).toContain("?onsite=1");
  expect(onsiteRoute).toContain("quoteAlreadySigned");
  expect(onsiteRoute).toContain("?view=msa&onsite=1");
  expect(quotePage).toContain("Protected customer handoff");
  expect(quotePage).toContain("highlightOwnerSignature");
  expect(acceptance).toContain("&onsite=1");
  expect(quotePanel).toContain("workflow-document-stack");
  expect(quotePanel).toContain("Customer handoff");
  expect(quotePanel).toContain("Open on this device");
  expect(quotePanel).toContain("Send portal link");
  expect(msaPanel).toContain("Company signature");
  expect(msaPanel).toContain("Sign MSA on this device");
  expect(msaPanel).toContain("On-device MSA signing");
  expect(msaPanel).toContain("/onsite-signing");
  expect(msaPanel).toContain("/prepare");
  expect(prepareRoute).toContain("preparingAfterAcceptance");
});
