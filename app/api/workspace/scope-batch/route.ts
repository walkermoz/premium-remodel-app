import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { findRecord, insertRecords } from "@/lib/repository";
import { schemas } from "@/lib/schemas";
import type { Quote } from "@/lib/types";
import { validatePricebookSources } from "@/lib/pricebook-source";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.group === "doorknocker")
      throw new HttpError(
        403,
        "Door-knocker records must be saved from the Door knocking page.",
      );

    const body = (await request.json()) as {
      projectId?: unknown;
      items?: unknown;
    };
    if (!Array.isArray(body.items) || !body.items.length)
      throw new HttpError(400, "Add at least one scope item.");
    if (body.items.length > 100)
      throw new HttpError(400, "Add up to 100 scope items at a time.");

    const projectId = String(body.projectId || "");
    const parent =
      (await findRecord(user, projectId, "project")) ||
      (await findRecord(user, projectId, "quote"));
    if (!parent) throw new HttpError(404, "Project not found.");
    if ((parent as Quote).status === "Accepted")
      throw new HttpError(409, "The signed quote scope cannot be changed.");

    const rawItems = body.items as unknown[];
    const items = rawItems.map((item) => {
      const parsed = schemas.scope.safeParse(
        item && typeof item === "object" && !Array.isArray(item)
          ? { ...item, projectId }
          : item,
      );
      if (!parsed.success)
        throw new HttpError(400, parsed.error.issues[0].message);
      return parsed.data;
    });
    await validatePricebookSources(user, items);

    const contractorIds = [
      ...new Set(
        items
          .map((item) => item.contractorId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const contractors = await Promise.all(
      contractorIds.map((id) => findRecord(user, id, "contractor")),
    );
    if (contractors.some((contractor) => !contractor))
      throw new HttpError(400, "Choose an existing contractor.");

    return Response.json(await insertRecords(user, "scope", items), {
      status: 201,
    });
  } catch (error) {
    return apiError(error);
  }
}
