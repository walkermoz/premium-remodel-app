import { z } from "zod";
import {
  apiError,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import {
  cancelOrganizationDeletionRequest,
  createOrganizationDeletionRequest,
  organizationDeletionStatus,
  organizationLifecycleIdentity,
  requireOrganizationOwner,
} from "@/lib/organization-lifecycle";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("request_deletion"),
    confirmation: z.string().trim().min(1).max(160),
  }),
  z.object({ action: z.literal("cancel_deletion") }),
]);

function sameName(left: string, right: string) {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}
export async function GET() {
  try {
    const user = await requireUser();
    requireOrganizationOwner(user);
    const [organization, deletion] = await Promise.all([
      organizationLifecycleIdentity(user.organizationId),
      organizationDeletionStatus(user.organizationId),
    ]);
    return Response.json(
      { organization, deletion },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    requireOrganizationOwner(user);
    await limitAttempts(`organization-lifecycle:${user.id}`, 8);
    const input = actionSchema.parse(await request.json());

    if (input.action === "cancel_deletion") {
      const result = await cancelOrganizationDeletionRequest(user);
      await recordAuditEvent(user, {
        action: "updated",
        entityKind: "organization_lifecycle",
        entityId: user.organizationId,
        subject: "Cancelled organization deletion",
        afterData: { cancelledAt: result.cancelledAt },
      });
      return Response.json(
        { deletion: null, ...result },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const identity = await organizationLifecycleIdentity(user.organizationId);
    if (
      !sameName(input.confirmation, identity.displayName) &&
      !sameName(input.confirmation, identity.legalName)
    )
      throw new HttpError(
        400,
        `Type “${identity.displayName}” exactly to schedule deletion.`,
      );

    const deletion = await createOrganizationDeletionRequest(user);
    await recordAuditEvent(user, {
      action: "created",
      entityKind: "organization_lifecycle",
      entityId: deletion.id,
      subject: "Scheduled organization deletion",
      afterData: { deleteAfter: deletion.deleteAfter },
    });
    return Response.json(
      { deletion },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
