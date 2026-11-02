import { z } from "zod";
import { apiError, checkOrigin, requireUser } from "@/lib/auth";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import { requireOrganizationCapability } from "@/lib/organization-permissions";
import { recordAuditEvent } from "@/lib/audit-server";
import {
  convertQuoteFlowToProject,
  getQuoteFlowInstance,
  markQuoteFlowSignedInPerson,
  moveQuoteFlowInstance,
  recordManualQuoteFlowPayment,
  saveQuoteFlowValue,
  signQuoteFlowOnBehalf,
  withoutStaffOnlyQuoteFlowContent,
} from "@/lib/quote-flow-instances";
import { hasOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

const updateInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save_value"),
    stageId: z.string().trim().min(1).max(80),
    blockId: z.string().trim().min(1).max(80),
    value: z.unknown(),
  }),
  z.object({
    action: z.literal("move_stage"),
    stageId: z.string().trim().min(1).max(80),
    allowOverride: z.boolean().default(false),
    overrideReason: z.string().trim().max(500).default(""),
  }),
  z.object({
    action: z.literal("mark_signed_in_person"),
    stageId: z.string().trim().min(1).max(80),
    blockId: z.string().trim().min(1).max(80),
    signedName: z.string().trim().min(2).max(200),
    reference: z.string().trim().max(300).default(""),
  }),
  z.object({
    action: z.literal("sign_on_behalf"),
    stageId: z.string().trim().min(1).max(80),
    blockId: z.string().trim().min(1).max(80),
    signedName: z.string().trim().min(2).max(200),
    authorization: z.string().trim().min(10).max(1_000),
  }),
  z.object({
    action: z.literal("convert_to_project"),
    stageId: z.string().trim().min(1).max(80),
    blockId: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("record_manual_payment"),
    stageId: z.string().trim().min(1).max(80),
    blockId: z.string().trim().min(1).max(80),
    requestId: z.uuid(),
    amount: z.number().finite().positive().max(10_000_000),
    method: z.enum(["Check", "Cash", "Bank transfer", "Other"]),
    reference: z.string().trim().max(300).default(""),
  }),
]);

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Quotes");
    const { id } = await context.params;
    const [instance, canViewStaffContent] = await Promise.all([
      getQuoteFlowInstance(
        user.organizationId,
        {
          instanceId: z.uuid().parse(id),
        },
        user,
      ),
      hasOrganizationCapability(user, "quote_flows.staff_content.view"),
    ]);
    return Response.json(
      {
        instance:
          instance && !canViewStaffContent
            ? withoutStaffOnlyQuoteFlowContent(instance)
            : instance,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Quotes");
    const { id } = await context.params;
    const instanceId = z.uuid().parse(id);
    const input = updateInput.parse(await request.json());
    let instance;
    if (input.action === "save_value")
      instance = await saveQuoteFlowValue(user, instanceId, input);
    else if (input.action === "move_stage") {
      if (input.allowOverride)
        await requireOrganizationCapability(user, "quote_flows.override");
      instance = await moveQuoteFlowInstance(user, instanceId, input);
      if (input.allowOverride)
        await recordAuditEvent(user, {
          action: "updated",
          entityKind: "quote_flow_override",
          entityId: instanceId,
          subject: "Overrode required quote flow steps",
          afterData: {
            targetStageId: input.stageId,
            reason: input.overrideReason,
          },
        });
    } else if (input.action === "mark_signed_in_person") {
      await requireOrganizationCapability(user, "agreements.mark_in_person");
      instance = await markQuoteFlowSignedInPerson(user, instanceId, input);
      await recordAuditEvent(user, {
        action: "updated",
        entityKind: "quote_flow_signature",
        entityId: instanceId,
        subject: `Marked ${input.signedName} signed in person`,
        afterData: {
          stageId: input.stageId,
          blockId: input.blockId,
          method: "in_person",
          reference: input.reference,
        },
      });
    } else if (input.action === "sign_on_behalf") {
      await requireOrganizationCapability(user, "agreements.sign_on_behalf");
      instance = await signQuoteFlowOnBehalf(user, instanceId, input);
      await recordAuditEvent(user, {
        action: "updated",
        entityKind: "quote_flow_signature",
        entityId: instanceId,
        subject: `${user.name} signed on behalf of ${input.signedName}`,
        afterData: {
          stageId: input.stageId,
          blockId: input.blockId,
          method: "on_behalf",
          authorization: input.authorization,
        },
      });
    } else if (input.action === "convert_to_project") {
      await requireOrganizationCapability(user, "quotes.manage");
      const converted = await convertQuoteFlowToProject(
        user,
        instanceId,
        input,
      );
      await recordAuditEvent(user, {
        action: "created",
        entityKind: "project",
        entityId: converted.project.id as string,
        projectId: converted.project.id as string,
        subject: "Created project from configured quote flow",
        afterData: { flowInstanceId: instanceId },
      });
      return Response.json(converted, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } else {
      await requireOrganizationCapability(user, "payments.manage");
      instance = await recordManualQuoteFlowPayment(user, instanceId, input);
      await recordAuditEvent(user, {
        action: "created",
        entityKind: "payment",
        entityId: input.requestId,
        projectId: instance?.quoteId,
        subject: `Recorded ${input.method.toLowerCase()} payment`,
        afterData: {
          flowInstanceId: instanceId,
          blockId: input.blockId,
          amount: input.amount,
          reference: input.reference,
        },
      });
    }
    const canViewStaffContent = await hasOrganizationCapability(
      user,
      "quote_flows.staff_content.view",
    );
    return Response.json(
      canViewStaffContent || !instance
        ? instance
        : withoutStaffOnlyQuoteFlowContent(instance),
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
