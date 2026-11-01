import { z } from "zod";
import {
  apiError,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { requireOrganizationCapability } from "@/lib/organization-permissions";
import {
  deleteOrganizationSecret,
  listOrganizationSecrets,
  saveOrganizationSecret,
} from "@/lib/organization-secrets";

export const runtime = "nodejs";

const secretInput = z.object({
  id: z.uuid().optional(),
  name: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z][A-Za-z0-9_-]{1,79}$/,
      "Use 2–80 letters, numbers, underscores, or hyphens, starting with a letter.",
    ),
  description: z.string().trim().max(300).default(""),
  value: z.string().min(1).max(10_000),
});

export async function GET() {
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "secrets.manage");
    return Response.json(
      { secrets: await listOrganizationSecrets(user.organizationId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "secrets.manage");
    await limitAttempts(`organization-secret:${user.id}`, 40);
    const raw = await request.text();
    if (raw.length > 15_000)
      throw new HttpError(413, "Workflow secret is too large.");
    const input = secretInput.parse(JSON.parse(raw));
    const saved = await saveOrganizationSecret(user, input);
    await recordAuditEvent(user, {
      action: input.id ? "updated" : "created",
      entityKind: "workflow_secret",
      entityId: saved.id,
      subject: `${input.id ? "Rotated" : "Created"} workflow secret ${saved.name}`,
      afterData: { name: saved.name, description: saved.description },
    });
    return Response.json(saved, {
      status: input.id ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "secrets.manage");
    const { id, name } = z
      .object({ id: z.uuid(), name: z.string().trim().max(80).optional() })
      .parse(await request.json());
    await deleteOrganizationSecret(user.organizationId, id);
    await recordAuditEvent(user, {
      action: "deleted",
      entityKind: "workflow_secret",
      entityId: id,
      subject: `Removed workflow secret ${name || id}`,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
