import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import {
  businessConfigSchema,
  getBusinessConfig,
  saveBusinessConfig,
} from "@/lib/business-config";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(await getBusinessConfig(user), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.role !== "admin")
      throw new HttpError(
        403,
        "Only administrators can change business settings.",
      );
    const input = businessConfigSchema.parse(await request.json());
    return Response.json(await saveBusinessConfig(user, input));
  } catch (error) {
    return apiError(error);
  }
}
