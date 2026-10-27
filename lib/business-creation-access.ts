import type { WorkspaceUser } from "./auth";

// This is Walker's personal Supabase Auth account, not the shared contact inbox.
const walkerAuthUserId = "99d8fe1e-d455-4804-a285-a92b7ae610c4";
const walkerEmail = "walker@premiumremodel.com";

export function canCreateBusiness(
  user: Pick<WorkspaceUser, "authUserId" | "email" | "role">,
): boolean {
  return (
    user.role === "admin" &&
    user.authUserId === walkerAuthUserId &&
    user.email.toLowerCase() === walkerEmail
  );
}
