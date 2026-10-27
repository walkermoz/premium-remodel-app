import { z } from "zod";
import { cookies } from "next/headers";
import { organizationCookie } from "@/lib/organization-context";
import {
  apiError,
  appOrigin,
  checkOrigin,
  getUser,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import {
  supabaseAdmin,
  supabasePublic,
  supabaseServer,
} from "@/lib/supabase/server";
import { inviteTeammate } from "@/lib/team";
import { recordAuditEvent } from "@/lib/audit-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = await request.json();
    const supabase = await supabaseServer();
    if (body.action === "logout") {
      const user = await getUser();
      if (user) {
        const stopped = await supabaseAdmin()
          .from("remodel_locations")
          .update({
            sharing: false,
            latitude: null,
            longitude: null,
            accuracy: null,
            captured_at: null,
          })
          .eq("profile_id", user.id)
          .eq("organization_id", user.organizationId);
        if (stopped.error) throw stopped.error;
        await recordAuditEvent(user, {
          action: "deleted",
          entityKind: "session",
          subject: "Signed out",
        });
      }
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error && error.status !== 403 && error.status !== 401) throw error;
      return Response.json({ ok: true });
    }
    if (body.action === "password" || body.action === "accept") {
      const user = await requireUser();
      await limitAttempts(`password:${user.id}`, 10);
      const data = z
        .object({
          password: z.string().min(12).max(128),
          current: z.string().max(128).optional(),
          name: z.string().trim().min(1).max(100).optional(),
        })
        .parse(body);
      if (body.action === "password") {
        const verified = await supabasePublic().auth.signInWithPassword({
          email: user.email,
          password: data.current || "",
        });
        if (verified.error)
          throw new HttpError(400, "Your current password is incorrect.");
        // The temporary verification session must not remain active.
        if (verified.data.session)
          await supabaseAdmin().auth.admin.signOut(
            verified.data.session.access_token,
            "local",
          );
      }
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });
      if (error)
        throw new HttpError(
          400,
          error.code === "same_password"
            ? "Choose a different password."
            : "Could not update your password. Try a longer password or request a new invitation.",
        );
      if (data.name) {
        const update = await supabaseAdmin()
          .from("profiles")
          .update({ full_name: data.name, remodel_updated_by: user.id })
          .eq("id", user.id);
        if (update.error) throw update.error;
      }
      const signedOut = await supabase.auth.signOut({ scope: "others" });
      if (signedOut.error) throw signedOut.error;
      await recordAuditEvent(user, {
        action: "updated",
        entityKind: "account",
        subject: "Changed account password",
      });
      return Response.json({ ok: true });
    }
    if (body.action !== "login")
      throw new HttpError(
        400,
        "Use an invitation from your workspace administrator to join.",
      );
    const data = z
      .object({
        email: z.email().max(250),
        password: z.string().min(1).max(128),
      })
      .parse(body);
    const email = data.email.trim().toLowerCase();
    await limitAttempts(`email:${email}`);
    await limitAttempts(
      `ip:${request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "local"}`,
      80,
    );
    const result = await supabase.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (result.error)
      throw new HttpError(
        result.error.status === 429 ? 429 : 401,
        "Email or password is incorrect, or sign-in is temporarily unavailable.",
      );
    let user = await getUser();
    if (!user) {
      // A previously selected company may have revoked this user's access.
      // Recover the remaining active memberships instead of trapping the user
      // at the sign-in screen with a stale organization cookie.
      const fallback = await supabaseServer(false);
      const { data: memberships, error: membershipsError } = await fallback.rpc(
        "remodel_my_organizations",
      );
      if (membershipsError) throw membershipsError;
      if (memberships?.length) {
        (await cookies()).delete(organizationCookie);
        user = await getUser();
      }
    }
    if (!user) {
      await supabase.auth.signOut({ scope: "local" });
      throw new HttpError(
        403,
        "This account does not have active employee access. Contact your workspace administrator.",
      );
    }
    await recordAuditEvent(user, {
      action: "created",
      entityKind: "session",
      subject: "Signed in",
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
export async function GET() {
  try {
    const user = await requireUser();
    const { data, error } = await supabaseAdmin()
      .from("remodel_memberships")
      .select("profile_id,role")
      .eq("organization_id", user.organizationId)
      .eq("active", true)
      .order("created_at");
    if (error) throw error;
    const profileIds = data.map((member) => member.profile_id);
    const profiles = profileIds.length
      ? await supabaseAdmin()
          .from("profiles")
          .select("id,full_name,email,active")
          .in("id", profileIds)
      : { data: [], error: null };
    if (profiles.error) throw profiles.error;
    const byId = new Map(
      profiles.data
        ?.filter((item) => item.active)
        .map((item) => [item.id, item]),
    );
    return Response.json(
      {
        user,
        members: data.flatMap((membership) => {
          const profile = byId.get(membership.profile_id);
          return profile
            ? [
                {
                  id: profile.id,
                  name: profile.full_name,
                  email: profile.email || "",
                  role: ["owner", "admin"].includes(membership.role)
                    ? "admin"
                    : "member",
                  group: membership.role,
                },
              ]
            : [];
        }),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.role !== "admin")
      throw new HttpError(
        403,
        "Only the administrator can invite team members.",
      );
    const data = z
      .object({
        email: z.email().max(250),
        method: z.enum(["email", "link"]).default("email"),
        group: z
          .enum(["office", "crew", "field", "doorknocker"])
          .default("office"),
      })
      .parse(await request.json());
    await limitAttempts(`invite:${user.id}`, 30);
    return Response.json(
      await inviteTeammate(
        user,
        data.email.trim().toLowerCase(),
        data.method,
        appOrigin(request),
        data.group,
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.role !== "admin")
      throw new HttpError(
        403,
        "Only the administrator can remove team members.",
      );
    const { id } = z.object({ id: z.uuid() }).parse(await request.json());
    if (id === user.id)
      throw new HttpError(400, "You cannot remove your own access.");
    const { data, error } = await supabaseAdmin()
      .from("remodel_memberships")
      .update({ active: false })
      .eq("profile_id", id)
      .eq("organization_id", user.organizationId)
      .in("role", ["office", "crew", "field", "doorknocker"])
      .select("profile_id");
    if (error) throw error;
    if (!data.length) throw new HttpError(404, "Team member not found.");
    const [location, calendar] = await Promise.all([
      supabaseAdmin()
        .from("remodel_locations")
        .update({
          sharing: false,
          latitude: null,
          longitude: null,
          accuracy: null,
          captured_at: null,
        })
        .eq("organization_id", user.organizationId)
        .eq("profile_id", id),
      supabaseAdmin()
        .from("remodel_google_calendar_connections")
        .update({
          refresh_token_ciphertext: null,
          disconnected_at: new Date().toISOString(),
        })
        .eq("organization_id", user.organizationId)
        .eq("profile_id", id),
    ]);
    if (location.error) throw location.error;
    if (calendar.error) throw calendar.error;
    await recordAuditEvent(user, {
      action: "deleted",
      entityKind: "team",
      entityId: id,
      subject: "Removed team membership",
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
