import { z } from "zod";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { requireOrganizationCapability } from "@/lib/organization-permissions";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import {
  createPaperwork,
  listPaperwork,
  paperworkTemplates,
  assignedPaperwork,
} from "@/lib/paperwork";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (new URL(request.url).searchParams.get("assigned") === "me")
      return Response.json(
        { documents: await assignedPaperwork(user) },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    await requireWorkspaceTabs(user, "Quotes");
    await requireOrganizationCapability(user, "agreements.manage");
    const quoteId = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("quoteId"));
    const [templates, documents] = await Promise.all([
      paperworkTemplates(user.organizationId),
      listPaperwork(user.organizationId, quoteId),
    ]);
    return Response.json(
      {
        templates: templates.filter((t) =>
          t.paperwork.contexts.includes("quote"),
        ),
        documents,
      },
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
    await requireWorkspaceTabs(user, "Quotes");
    await requireOrganizationCapability(user, "agreements.manage");
    const raw = await request.text();
    if (raw.length > 100_000)
      throw new HttpError(413, "Paperwork data is too large.");
    return Response.json(await createPaperwork(user, JSON.parse(raw)), {
      status: 201,
    });
  } catch (error) {
    return apiError(error);
  }
}
