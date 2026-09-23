import { z } from "zod";
import { apiError, limitAttempts } from "@/lib/auth";
import { sendDiscordLeadNotification } from "@/lib/discord-leads";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const productionOrigins = new Set([
  "https://premiumremodel.com",
  "https://www.premiumremodel.com",
  "https://plhi.vercel.app",
]);
const previewOrigin =
  /^https:\/\/plhi(?:-[a-z0-9-]+)?-walkermozs-projects\.vercel\.app$/;

const leadInput = z
  .object({
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().min(1).max(100),
    email: z.email().max(250),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[1-9]\d{9,14}$/, "Enter a valid phone number."),
    zip: z
      .string()
      .trim()
      .regex(/^\d{5}(?:-\d{4})?$/, "Enter a valid ZIP code."),
    address: z.string().trim().min(1).max(250),
    project: z.string().trim().min(1).max(100),
    project_description: z.string().trim().min(10).max(1000),
  })
  .strict();

function allowedOrigin(origin: string) {
  return (
    productionOrigins.has(origin) ||
    previewOrigin.test(origin) ||
    (process.env.NODE_ENV !== "production" &&
      /^http:\/\/localhost:\d+$/.test(origin))
  );
}

function cors(response: Response, origin: string) {
  if (allowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function OPTIONS(request: Request) {
  const origin = request.headers.get("origin") || "";
  if (!allowedOrigin(origin))
    return Response.json({ error: "Origin not allowed." }, { status: 403 });
  return cors(
    new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    }),
    origin,
  );
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin") || "";
  if (!allowedOrigin(origin))
    return Response.json({ error: "Origin not allowed." }, { status: 403 });

  let response: Response;
  try {
    const organizationId = process.env.SUPABASE_ORGANIZATION_ID;
    if (!organizationId || !z.uuid().safeParse(organizationId).success)
      throw new Error("Lead intake organization is not configured.");

    const data = leadInput.parse(await request.json());
    const forwarded =
      request.headers.get("x-vercel-forwarded-for") ||
      request.headers.get("x-forwarded-for") ||
      "unknown";
    const ip = forwarded.split(",")[0].trim().slice(0, 80);
    await Promise.all([
      limitAttempts(`website-lead:ip:${ip}`, 12),
      limitAttempts(`website-lead:email:${data.email.toLowerCase()}`, 4),
    ]);

    const admin = supabaseAdmin();
    const { data: created, error } = await admin.rpc(
      "remodel_receive_website_lead",
      {
        p_organization: organizationId,
        p_first_name: data.first_name,
        p_last_name: data.last_name,
        p_email: data.email.trim().toLowerCase(),
        p_phone: data.phone,
        p_zip: data.zip,
        p_address: data.address,
        p_project: data.project,
        p_project_description: data.project_description,
      },
    );
    if (error) throw error;
    if (!created?.[0]) throw new Error("Lead intake did not return a record.");

    const notification = await sendDiscordLeadNotification(data);
    const leadId = String(created[0].lead_id);
    const { data: storedLead, error: readError } = await admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", organizationId)
      .eq("kind", "lead")
      .eq("id", leadId)
      .single();
    if (!readError && storedLead) {
      const updatedAt = new Date().toISOString();
      const leadData =
        storedLead.data && typeof storedLead.data === "object"
          ? storedLead.data
          : {};
      const { error: updateError } = await admin
        .from("remodel_records")
        .update({
          data: {
            ...leadData,
            discordNotification: notification,
            updatedAt,
          },
          updated_at: updatedAt,
        })
        .eq("organization_id", organizationId)
        .eq("kind", "lead")
        .eq("id", leadId);
      if (updateError)
        console.error("Could not store the lead notification status.");
    } else {
      console.error("Could not load the lead notification status record.");
    }

    response = Response.json({ received: true }, { status: 201 });
  } catch (error) {
    response = apiError(error);
  }
  return cors(response, origin);
}
