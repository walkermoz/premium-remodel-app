import "server-only";
import sharp from "sharp";
import { HttpError, type WorkspaceUser } from "./auth";
import { supabaseAdmin, supabaseServer } from "./supabase/server";
import {
  defaultGenerationModel,
  generationModels,
  renovationPrompt,
} from "./generation";

type ModelCapability = {
  id: string;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: Record<
    string,
    { type: string; values?: string[]; max?: number }
  >;
};

export async function availableGenerationModels() {
  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/images/models", {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new HttpError(
      503,
      "The image model list is unavailable. Please try again.",
    );
  }
  if (!response.ok)
    throw new HttpError(
      503,
      "The image model list is unavailable. Please try again.",
    );
  const payload = await response.json();
  if (!Array.isArray(payload.data))
    throw new HttpError(503, "The image model list is unavailable.");
  const capabilities: ModelCapability[] = payload.data;
  return generationModels.flatMap((model) => {
    const capability = capabilities.find((item) => item.id === model.id);
    if (
      !capability?.architecture?.input_modalities?.includes("image") ||
      !capability.architecture.output_modalities?.includes("image") ||
      !(Number(capability.supported_parameters?.input_references?.max) >= 1)
    )
      return [];
    return [{ ...model, capability }];
  });
}

export async function getGenerationDefault(user: WorkspaceUser) {
  const { data, error } = await (
    await supabaseServer()
  )
    .from("remodel_settings")
    .select("generation_default_model")
    .eq("organization_id", user.organizationId)
    .maybeSingle();
  if (error) throw error;
  return data?.generation_default_model || defaultGenerationModel;
}

export async function saveGenerationDefault(
  user: WorkspaceUser,
  model: string,
) {
  const { error } = await supabaseAdmin().from("remodel_settings").upsert({
    organization_id: user.organizationId,
    generation_default_model: model,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function prepareGenerationPhoto(file: File) {
  if (!file.size || file.size > 3 * 1024 * 1024)
    throw new HttpError(
      413,
      "Choose a photo smaller than 3 MB after resizing.",
    );
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new HttpError(400, "Choose a JPG, PNG or WebP photo.");
  try {
    const input = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 40000000,
    });
    const metadata = await input.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format || ""))
      throw new Error("Unsupported image");
    const { data, info } = await input
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, ratio: info.width / info.height };
  } catch {
    throw new HttpError(
      400,
      "This photo could not be read. Try a different JPG, PNG or WebP image.",
    );
  }
}

export async function generateRenovation({
  photo,
  ratio,
  model,
  projectType,
  otherProject,
  style,
  notes,
  userId,
}: {
  photo: Buffer;
  ratio: number;
  model: Awaited<ReturnType<typeof availableGenerationModels>>[number];
  projectType: string;
  otherProject: string;
  style: string;
  notes: string;
  userId: string;
}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key)
    throw new HttpError(503, "Image generation has not been connected yet.");
  const parameters = model.capability.supported_parameters || {};
  const ratios = (parameters.aspect_ratio?.values || []).filter((value) =>
    /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(value),
  );
  const closestRatio = ratios.sort((a, b) => {
    const value = (r: string) => {
      const [w, h] = r.split(":").map(Number);
      return Math.abs(Math.log(w / h / ratio));
    };
    return value(a) - value(b);
  })[0];
  const resolutions = parameters.resolution?.values || [];
  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "Premium Remodel",
        "HTTP-Referer":
          process.env.APP_URL || "https://servicebuddy-ui.vercel.app",
      },
      body: JSON.stringify({
        model: model.id,
        prompt: renovationPrompt(projectType, style, notes, otherProject),
        input_references: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${photo.toString("base64")}`,
            },
          },
        ],
        ...(parameters.n ? { n: 1 } : {}),
        ...(closestRatio ? { aspect_ratio: closestRatio } : {}),
        ...(resolutions.length
          ? { resolution: resolutions.includes("1K") ? "1K" : resolutions[0] }
          : {}),
        ...(parameters.quality?.values?.includes("medium")
          ? { quality: "medium" }
          : {}),
        user: userId,
      }),
      signal: AbortSignal.timeout(240000),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
    )
      throw new HttpError(
        504,
        "The model took too long. Please try again or select another model.",
      );
    throw new HttpError(
      502,
      "The image service could not be reached. Please try again.",
    );
  }
  if (response.status === 402)
    throw new HttpError(
      402,
      "The OpenRouter account needs more credits. Add credits, then try again.",
    );
  if (response.status === 401 || response.status === 403)
    throw new HttpError(
      503,
      "OpenRouter could not authorize this request. Ask an administrator to check the connection and model access.",
    );
  if (response.status === 429)
    throw new HttpError(
      429,
      "This model is busy. Please wait a moment or choose another model.",
    );
  if (!response.ok)
    throw new HttpError(
      502,
      "The model could not create an image. Try another photo or model.",
    );
  const result = await response.json();
  const encoded = result.data?.[0]?.b64_json;
  if (
    typeof encoded !== "string" ||
    !encoded.length ||
    encoded.length > 32 * 1024 * 1024
  )
    throw new HttpError(
      502,
      "The model returned no usable image. Try another photo or model.",
    );
  try {
    // Return a compact, verified image rather than arbitrary upstream URLs or metadata.
    const decoded = sharp(Buffer.from(encoded, "base64"), {
      limitInputPixels: 40000000,
    });
    const metadata = await decoded.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format || ""))
      throw new Error("Unsupported output format");
    const image = await decoded
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer();
    if (image.length > 4 * 1024 * 1024) throw new Error("Image too large");
    return image;
  } catch {
    throw new HttpError(
      502,
      "The model returned an unreadable image. Please try another model.",
    );
  }
}
