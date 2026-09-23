import { z } from "zod";
import {
  apiError,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { generationProjectTypes } from "@/lib/generation";
import {
  availableGenerationModels,
  generateRenovation,
  getGenerationDefault,
  prepareGenerationPhoto,
} from "@/lib/generation-server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (
      Number(request.headers.get("content-length") || 0) >
      3 * 1024 * 1024 + 65536
    )
      throw new HttpError(413, "This photo is too large. Try a smaller image.");
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File))
      throw new HttpError(400, "Add a project photo first.");
    const fields = z
      .object({
        model: z.string().max(150),
        projectType: z.enum(generationProjectTypes.map((item) => item.id)),
        otherProject: z.string().trim().max(150),
        style: z.string().min(1).max(50),
        notes: z.string().trim().max(1000),
      })
      .parse({
        model: form.get("model") || "",
        projectType: form.get("projectType"),
        otherProject: form.get("otherProject") || "",
        style: form.get("style"),
        notes: form.get("notes") || "",
      });
    const project = generationProjectTypes.find(
      (item) => item.id === fields.projectType,
    )!;
    if (!(project.styles as readonly string[]).includes(fields.style))
      throw new HttpError(
        400,
        "Choose an available style for this project type.",
      );
    if (fields.projectType === "other" && !fields.otherProject)
      throw new HttpError(
        400,
        "Describe the type of project you want to preview.",
      );
    const photo = await prepareGenerationPhoto(file);
    const models = await availableGenerationModels();
    const modelId = fields.model || (await getGenerationDefault(user));
    const model = models.find((item) => item.id === modelId);
    if (!model)
      throw new HttpError(
        400,
        "This image model is unavailable. Select another model.",
      );
    await limitAttempts(`generate:${user.organizationId}:${user.id}`, 12);
    await limitAttempts(`generate-company:${user.organizationId}`, 60);
    const image = await generateRenovation({
      photo: photo.bytes,
      ratio: photo.ratio,
      model,
      projectType: fields.projectType,
      otherProject: fields.otherProject,
      style: fields.style,
      notes: fields.notes,
      userId: user.authUserId,
    });
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store",
        "Content-Disposition": 'inline; filename="premium-remodel-concept.jpg"',
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
