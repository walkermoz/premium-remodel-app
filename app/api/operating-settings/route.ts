import { z } from "zod";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { requireOrganizationCapability } from "@/lib/organization-permissions";
import { operatingSections } from "@/lib/operating-settings";
import {
  readOperatingSettings,
  saveOperatingSection,
} from "@/lib/operating-settings.server";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(await readOperatingSettings(user.organizationId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "business.manage");
    const body = await request.text();
    if (body.length > 500_000)
      throw new HttpError(413, "These settings are too large.");
    const input = z
      .object({
        section: z.enum(operatingSections),
        value: z.unknown(),
        revision: z.number().int().min(0),
      })
      .strict()
      .parse(
        (() => {
          try {
            return JSON.parse(body);
          } catch {
            throw new HttpError(400, "Send valid JSON settings.");
          }
        })(),
      );
    return Response.json(
      await saveOperatingSection(
        user,
        input.section,
        input.value,
        input.revision,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
