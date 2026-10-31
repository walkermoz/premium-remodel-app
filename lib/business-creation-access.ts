import type { WorkspaceUser } from "./auth";

export function canCreateBusiness(
  user: Pick<WorkspaceUser, "role" | "group">,
): boolean {
  return user.role === "admin" && user.group === "owner";
}
