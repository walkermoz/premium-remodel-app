import "server-only";
import { type User as AuthUser } from "@supabase/supabase-js";
import { HttpError, type WorkspaceUser } from "./auth";
import { supabaseAdmin, supabasePublic } from "./supabase/server";

export async function inviteTeammate(
  user: WorkspaceUser,
  email: string,
  method: "email" | "link",
  origin: string,
  group: "office" | "crew" | "field" | "doorknocker" = "office",
) {
  const admin = supabaseAdmin();
  let existing: AuthUser | undefined;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    existing = data.users.find((u) => u.email?.toLowerCase() === email);
    if (existing || data.users.length < 1000) break;
  }
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id,organization_id,auth_user_id,active,role")
    .eq("email", email);
  if (profileError) throw profileError;
  // Do not change another company's or a customer portal user's membership.
  if (
    profiles.some(
      (p) => p.organization_id !== user.organizationId || p.role === "customer",
    )
  )
    throw new HttpError(
      409,
      "This email is already associated with another account. Use a different work email.",
    );
  if (existing) {
    const linked = await admin
      .from("profiles")
      .select("id,organization_id,role")
      .eq("auth_user_id", existing.id);
    if (linked.error) throw linked.error;
    if (
      linked.data.some(
        (p) =>
          p.organization_id !== user.organizationId || p.role === "customer",
      )
    )
      throw new HttpError(
        409,
        "This email is already associated with another account.",
      );
  }
  if (profiles.length > 1)
    throw new HttpError(
      409,
      "This email has duplicate employee profiles. Ask your administrator to resolve them.",
    );
  const profile = profiles[0];
  if (profile?.active && existing?.last_sign_in_at)
    throw new HttpError(409, "This person is already on your team.");
  const redirectTo = `${origin}/auth/accept`;
  const generated = await admin.auth.admin.generateLink({
    type: existing?.email_confirmed_at ? "magiclink" : "invite",
    email,
    options: { redirectTo },
  });
  if (generated.error || !generated.data.user)
    throw new HttpError(
      400,
      "Could not create this invitation. Check the email address and try again.",
    );
  const authUser = generated.data.user;
  const values = {
    organization_id: user.organizationId,
    auth_user_id: authUser.id,
    email,
    active: true,
    remodel_updated_by: user.id,
    role: group,
  };
  const saved = profile
    ? await admin
        .from("profiles")
        .update(values)
        .eq("id", profile.id)
        .eq("organization_id", user.organizationId)
    : await admin
        .from("profiles")
        .insert({ ...values, full_name: email.split("@")[0] });
  if (saved.error) throw saved.error;
  if (method === "link") {
    const url = new URL("/auth/accept", origin);
    url.searchParams.set("token_hash", generated.data.properties.hashed_token);
    url.searchParams.set("type", generated.data.properties.verification_type);
    return { url: url.toString(), email, delivery: "link" };
  }
  const result = authUser.email_confirmed_at
    ? await supabasePublic().auth.resetPasswordForEmail(email, { redirectTo })
    : await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (result.error)
    throw new HttpError(
      502,
      "Email could not be sent. Check Supabase email delivery settings, or choose “Create a link” and share it yourself.",
    );
  return { email, delivery: "email" };
}
