import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { renderLeadAcknowledgement, renderQuoteEmail } from "../lib/email-template";
import { buildQuotePdf } from "../lib/quote-pdf";
import { websiteLeadWorkflowSeed } from "../lib/workflows/seeds";
import type { Quote, ScopeItem } from "../lib/types";

const organization = {
  id: "b2000000-0000-4000-8000-000000000002",
  name: "North Star Renovations",
  website: "https://northstar.example",
  email: "hello@northstar.example",
  phone: "(555) 010-2020",
};

const quote: Quote = {
  id: "b2000000-0000-4000-8000-000000000010",
  createdAt: "2026-11-01T12:00:00.000Z",
  updatedAt: "2026-11-01T12:00:00.000Z",
  name: "Guest Bath Refresh",
  address: "42 North Star Way",
  client: "Alex Client",
  clientEmail: "alex@example.test",
  clientPhone: "(555) 010-3030",
  startDate: "",
  endDate: "",
  status: "Draft",
  description: "Refresh the guest bathroom.",
  category: "Bathroom",
  cover: "",
  quoteNumber: "NS-1",
  revisedDate: "2026-11-01",
  preparedBy: "Sam Builder",
  preparedByPhone: "(555) 010-2020",
  quoteNotes: "Scheduling follows acceptance.",
};

const scope: ScopeItem = {
  id: "b2000000-0000-4000-8000-000000000011",
  createdAt: quote.createdAt,
  updatedAt: quote.updatedAt,
  projectId: quote.id,
  position: 0,
  title: "Install vanity",
  details: "Remove the existing vanity and install the selected vanity.",
  quantity: 1,
  unit: "job",
  estimate: 2400,
  subCost: 1100,
  materialCost: 600,
  contractorId: "",
  status: "To do",
};

test("a synthetic organization receives a generic composable lead workflow", () => {
  const definition = websiteLeadWorkflowSeed({
    triggerMode: "inbound_webhook",
    teamNotificationMode: "disabled_custom_https",
    compatibilityMode: "generic",
    sendTeamNotification: false,
  });
  const serialized = JSON.stringify(definition);
  expect(definition.graph.nodes[0].type).toBe("trigger.inboundWebhook");
  expect(serialized).toContain("action.findOrCreateContact");
  expect(serialized).toContain("action.createLead");
  expect(serialized).toContain("action.webhook");
  expect(serialized).not.toContain("Premium Remodel");
  expect(serialized).not.toContain("discord_lead_webhook");
  expect(serialized).not.toContain("templateKey");
});

test("synthetic organization communication never inherits Premium identity", () => {
  const business = {
    name: organization.name,
    website: organization.website,
    email: organization.email,
    phone: organization.phone,
  };
  const lead = renderLeadAcknowledgement({ firstName: "Alex", business });
  const quoteEmail = renderQuoteEmail({
    message: "Your scope is ready to review.",
    portalUrl: "https://servicebuddy.example/client/private/quote",
    organizationId: organization.id,
    business,
  });
  for (const rendered of [lead, quoteEmail]) {
    expect(`${rendered.text}\n${rendered.html}`).toContain(organization.name);
    expect(rendered.text).not.toContain("Premium Remodel");
    expect(rendered.html).not.toContain("premiumremodel.com");
  }
});

test("synthetic organization quote PDF owns its identity and pricing", async () => {
  const bytes = await buildQuotePdf(quote, [scope], null, [], {
    name: organization.name,
    website: organization.website,
    phone: organization.phone,
    regional: {
      locale: "en-US",
      currency: "USD",
      timezone: "America/Chicago",
    },
  });
  const document = await PDFDocument.load(bytes);
  expect(document.getTitle()).toBe(`${organization.name} - ${quote.client} - Quote`);
  expect(document.getTitle()).not.toContain("Premium Remodel");
  expect(document.getPageCount()).toBeGreaterThan(0);
});
