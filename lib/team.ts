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
    .eq(existing ? "auth_user_id" : "email", existing?.id || email);
  if (profileError) throw profileError;
  if (profiles.some((p) => p.role === "customer"))
    throw new HttpError(
      409,
      "This customer account cannot be invited as a teammate.",
    );
  if (profiles.length > 1)
    throw new HttpError(
      409,
      "This email has duplicate employee profiles. Ask your administrator to resolve them.",
    );
  const profile = profiles[0];
  if (profile && !profile.active)
    throw new HttpError(
      409,
      "This account is disabled. Its home administrator must reactivate it first.",
    );
  if (profile) {
    const membership = await admin
      .from("remodel_memberships")
      .select("active")
      .eq("organization_id", user.organizationId)
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (membership.error) throw membership.error;
    if (membership.data?.active)
      throw new HttpError(409, "This person is already on your team.");
  }
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
  let profileId = profile?.id;
  if (!profileId) {
    const saved = await admin
      .from("profiles")
      .insert({ ...values, full_name: email.split("@")[0] })
      .select("id")
      .single();
    if (saved.error) throw saved.error;
    profileId = saved.data.id;
  }
  const membership = await admin.from("remodel_memberships").upsert(
    {
      organization_id: user.organizationId,
      profile_id: profileId,
      role: group,
      active: true,
    },
    { onConflict: "organization_id,profile_id" },
  );
  if (membership.error) throw membership.error;
  if (method === "link") {
    const url = new URL("/auth/accept", origin);
    url.searchParams.set("token_hash", generated.data.properties.hashed_token);
    url.searchParams.set("type", generated.data.properties.verification_type);
    if (profile) url.searchParams.set("existing", "1");
    return { url: url.toString(), email, delivery: "link" };
  }
  const result =
    profile && authUser.email_confirmed_at
      ? await supabasePublic().auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${redirectTo}?existing=1`,
            shouldCreateUser: false,
          },
        })
      : await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (result.error) {
    await admin
      .from("remodel_memberships")
      .update({ active: false })
      .eq("organization_id", user.organizationId)
      .eq("profile_id", profileId);
    throw new HttpError(
      502,
      "Email could not be sent. Check Supabase email delivery settings, or choose “Create a link” and share it yourself.",
    );
  }
  return { email, delivery: "email" };
}
