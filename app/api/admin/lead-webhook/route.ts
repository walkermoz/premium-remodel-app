import { z } from "zod";
import {
  apiError,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import {
  readLeadWebhookConfig,
  saveLeadWebhookConfig,
} from "@/lib/lead-webhook";
import { recordAuditEvent } from "@/lib/audit-server";

export const runtime = "nodejs";

async function requireAdmin(request: Request) {
  checkOrigin(request);
  const user = await requireUser();
  if (user.role !== "admin")
    throw new HttpError(
      403,
      "Only administrators can manage the lead webhook.",
    );
  return user;
}

export async function GET(request: Request) {
  try {
    const user = await requireAdmin(request);
    await limitAttempts(`lead-webhook-get:${user.id}`, 60);
    const config = await readLeadWebhookConfig(user.organizationId);
    return Response.json(
      {
        url: config.url,
        hasSecret: Boolean(config.secret),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireAdmin(request);
    await limitAttempts(`lead-webhook-put:${user.id}`, 30);
    const body = z
      .object({
        url: z
          .union([
            z.literal(""),
            z
              .string()
              .url()
              .max(500)
              .refine((value) => value.startsWith("https://"), {
                message: "Webhook URL must use HTTPS.",
              }),
          ])
          .optional(),
        secret: z.union([z.literal(""), z.string().trim().min(8).max(200)]).optional(),
        clearSecret: z.boolean().optional(),
      })
      .parse(await request.json());

    const current = await readLeadWebhookConfig(user.organizationId);
    const url =
      body.url === undefined
        ? current.url
        : body.url === ""
          ? null
          : body.url;
    let secret = current.secret;
    if (body.clearSecret) secret = null;
    else if (body.secret !== undefined)
      secret = body.secret === "" ? null : body.secret;

    await saveLeadWebhookConfig(user.organizationId, user.id, url, secret);
    await recordAuditEvent(user, {
      action: "updated",
      entityKind: "lead_webhook",
      entityId: user.organizationId,
      subject: "Lead event webhook",
      afterData: { url, hasSecret: Boolean(secret) },
    });
    return Response.json({ url, hasSecret: Boolean(secret) });
  } catch (error) {
    return apiError(error);
  }
}
