import { apiError, checkOrigin, requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { bookingFormInputSchema } from "@/lib/booking-types";
import { getBookingForm, saveBookingForm } from "@/lib/booking-forms";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "business.manage");
    return Response.json(
      { form: await getBookingForm(user.organizationId) },
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
    await requireOrganizationCapability(user, "business.manage");
    const before = await getBookingForm(user.organizationId);
    const form = await saveBookingForm(
      user,
      bookingFormInputSchema.parse(await request.json()),
    );
    await recordAuditEvent(user, {
      action: before ? "updated" : "created",
      entityKind: "booking_form",
      entityId: form.id,
      subject: `${before ? "Updated" : "Created"} online booking form ${form.name}`,
      beforeData: before as unknown as Record<string, unknown> | null,
      afterData: form as unknown as Record<string, unknown>,
    });
    return Response.json({ form }, { status: before ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
