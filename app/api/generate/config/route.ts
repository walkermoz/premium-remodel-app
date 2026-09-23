import { z } from "zod";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import {
  availableGenerationModels,
  getGenerationDefault,
  saveGenerationDefault,
} from "@/lib/generation-server";

export async function GET() {
  try {
    const user = await requireUser();
    const [models, defaultModel] = await Promise.all([
      availableGenerationModels(),
      getGenerationDefault(user),
    ]);
    return Response.json(
      {
        models: models.map(({ id, name }) => ({ id, name })),
        defaultModel,
        configured: Boolean(process.env.OPENROUTER_API_KEY),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.role !== "admin")
      throw new HttpError(
        403,
        "Only administrators can change the company default model.",
      );
    const { defaultModel } = z
      .object({ defaultModel: z.string().min(1).max(150) })
      .strict()
      .parse(await request.json());
    if (
      !(await availableGenerationModels()).some(
        (model) => model.id === defaultModel,
      )
    )
      throw new HttpError(400, "Select an available image model.");
    await saveGenerationDefault(user, defaultModel);
    return Response.json({ defaultModel });
  } catch (error) {
    return apiError(error);
  }
}
