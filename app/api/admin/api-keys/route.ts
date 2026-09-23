import { z } from "zod";
import {
  apiError,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "@/lib/api-keys";
import { recordAuditEvent } from "@/lib/audit-server";

export const runtime = "nodejs";

async function requireAdmin(request: Request) {
  checkOrigin(request);
  const user = await requireUser();
  if (user.role !== "admin")
    throw new HttpError(403, "Only administrators can manage API keys.");
  return user;
}

export async function GET(request: Request) {
  try {
    const user = await requireAdmin(request);
    await limitAttempts(`api-keys-list:${user.id}`, 60);
    return Response.json(
      { keys: await listApiKeys(user.organizationId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request);
    await limitAttempts(`api-keys-create:${user.id}`, 20);
    const body = z
      .object({ name: z.string().trim().min(1).max(100) })
      .parse(await request.json());
    const created = await createApiKey(user, body.name);
    await recordAuditEvent(user, {
      action: "created",
      entityKind: "api_key",
      entityId: created.key.id,
      subject: `API key · ${created.key.name}`,
      afterData: {
        id: created.key.id,
        name: created.key.name,
        keyPrefix: created.key.keyPrefix,
      },
    });
    return Response.json(
      {
        key: created.key,
        secret: created.secret,
        notice:
          "Copy this secret now. It is shown once and cannot be retrieved later.",
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAdmin(request);
    await limitAttempts(`api-keys-revoke:${user.id}`, 40);
    const body = z
      .object({ id: z.uuid() })
      .parse(await request.json());
    const revoked = await revokeApiKey(user, body.id);
    await recordAuditEvent(user, {
      action: "deleted",
      entityKind: "api_key",
      entityId: revoked.id,
      subject: `API key · ${revoked.name}`,
      beforeData: {
        id: revoked.id,
        name: revoked.name,
        keyPrefix: revoked.keyPrefix,
      },
    });
    return Response.json({ key: revoked });
  } catch (error) {
    return apiError(error);
  }
}
