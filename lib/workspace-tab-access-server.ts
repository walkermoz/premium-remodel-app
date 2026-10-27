import "server-only";
import { HttpError, type WorkspaceUser } from "./auth";
import { getBusinessConfig } from "./business-config";
import type { NavigationPage } from "./business-config-schema";
import { canOpenWorkspaceTab } from "./workspace-tab-access";

export async function requireWorkspaceTabs(
  user: WorkspaceUser,
  ...tabs: NavigationPage[]
) {
  const config = await getBusinessConfig(user);
  if (!tabs.some((tab) => canOpenWorkspaceTab(config, user.group, tab)))
    throw new HttpError(
      403,
      "This workspace section is not available to your role.",
    );
}
