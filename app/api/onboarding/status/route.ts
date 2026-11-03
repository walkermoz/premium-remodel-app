import { apiError, requireUser } from "@/lib/auth";
import { getBusinessConfig } from "@/lib/business-config";
import { googleMailStatus } from "@/lib/google-mail";
import { isOriginalOrganization } from "@/lib/original-organization";
import { organizationStripeEnabled } from "@/lib/stripe-payments";
import { stripeConnectStatus } from "@/lib/stripe-connect";
import { canCreateBusiness } from "@/lib/business-creation-access";
import { requireOrganizationCapability } from "@/lib/organization-permissions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getOrganizationConnectionRegistry } from "@/lib/organization-connections.server";
import { connectionIsReady } from "@/lib/organization-connections.types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "connections.manage");
    const [
      config,
      mail,
      businessCreationAllowed,
      inboundHooks,
      stripeReady,
      stripeConnection,
      publishedWorkflows,
      agreementTemplates,
      connectionRegistry,
    ] = await Promise.all([
      getBusinessConfig(user),
      googleMailStatus(user),
      canCreateBusiness(user),
      supabaseAdmin()
        .from("remodel_workflow_inbound_webhooks")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", user.organizationId)
        .eq("enabled", true),
      organizationStripeEnabled(user.organizationId),
      stripeConnectStatus(user.organizationId),
      supabaseAdmin()
        .from("remodel_workflows")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", user.organizationId)
        .eq("status", "published")
        .eq("system_controlled", false),
      supabaseAdmin()
        .from("remodel_agreement_templates")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", user.organizationId)
        .eq("status", "published"),
      getOrganizationConnectionRegistry(user),
    ]);
    if (inboundHooks.error) throw inboundHooks.error;
    if (publishedWorkflows.error) throw publishedWorkflows.error;
    if (agreementTemplates.error) throw agreementTemplates.error;
    return Response.json(
      {
        organizationId: user.organizationId,
        canCreateBusiness: businessCreationAllowed,
        connections: connectionRegistry.capabilities,
        mail: {
          configured: mail.configured,
          connected: connectionIsReady(
            connectionRegistry.capabilities.google_mail,
          ),
          email: mail.email,
        },
        phone: {
          connected: connectionIsReady(
            connectionRegistry.capabilities.twilio_sms,
          ),
        },
        websiteLeads: {
          connected: connectionIsReady(
            connectionRegistry.capabilities.website_leads,
          ),
          mode: isOriginalOrganization(user.organizationId)
            ? "legacy_static"
            : (inboundHooks.count || 0) > 0
              ? "workflow_webhook"
              : "not_configured",
        },
        payments: {
          stripeConnected: stripeReady || Boolean(stripeConnection),
          stripeReady,
          selectedProvider: config.quotePreferences.paymentProvider,
          enabled: config.modules.payments,
        },
        modules: {
          automations: {
            enabled: config.modules.automations,
            configured: (publishedWorkflows.count || 0) > 0,
            optional: true,
          },
          agreements: {
            enabled: config.modules.agreements,
            configured: (agreementTemplates.count || 0) > 0,
            optional: true,
          },
          payments: {
            enabled: config.modules.payments,
            configured:
              config.quotePreferences.paymentProvider === "manual" ||
              stripeReady,
            optional: true,
          },
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
