import { z } from "zod";
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
          .eq("id", user.id)
          .eq("organization_id", user.organizationId);
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
    const user = await getUser();
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
      .from("profiles")
      .select("id,full_name,email,role")
      .eq("organization_id", user.organizationId)
      .eq("active", true)
      .in("role", ["owner", "admin", "office", "crew", "field", "doorknocker"])
      .order("created_at");
    if (error) throw error;
    return Response.json(
      {
        user,
        members: data.map((p) => ({
          id: p.id,
          name: p.full_name,
          email: p.email || "",
          role: ["owner", "admin"].includes(p.role) ? "admin" : "member",
          group: p.role,
        })),
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
      .from("profiles")
      .update({ active: false, remodel_updated_by: user.id })
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .in("role", ["office", "crew", "field", "doorknocker"])
      .select("id");
    if (error) throw error;
    if (!data.length) throw new HttpError(404, "Team member not found.");
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
