import { apiError, requireUser } from "@/lib/auth";
import { workflowNodeDefinitions } from "@/lib/workflows/registry";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    return Response.json(
      {
        capabilities: workflowNodeDefinitions.map((definition) => ({
          type: definition.type,
          kind: definition.kind,
          category: definition.category,
          name: definition.name,
          description: definition.description,
          icon: definition.icon,
          editor: definition.editor,
          context: definition.context,
          outputFields: definition.outputFields,
          retry: definition.retry,
          connection: definition.connection,
          requiredPermissions: definition.requiredPermissions,
          sideEffect: definition.sideEffect,
          systemControlled: definition.systemControlled || false,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
