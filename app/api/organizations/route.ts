import { z } from "zod";
import { cookies } from "next/headers";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { organizationCookie } from "@/lib/organization-context";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { canCreateBusiness } from "@/lib/business-creation-access";

export const runtime = "nodejs";

async function memberships() {
  // This call intentionally ignores the selected-org cookie so a revoked
  // selection cannot prevent a user from choosing another authorized company.
  const supabase = await supabaseServer(false);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new HttpError(401, "Please sign in.");
  const { data, error } = await supabase.rpc("remodel_my_organizations");
  if (error) throw error;
  return data as Array<{ organization_id: string; name: string; role: string }>;
}

export async function GET() {
  try {
    const organizations = await memberships();
    const configNames = organizations.length
      ? await supabaseAdmin()
          .from("remodel_business_config")
          .select("organization_id,profile")
          .in(
            "organization_id",
            organizations.map((item) => item.organization_id),
          )
      : { data: [], error: null };
    if (configNames.error) throw configNames.error;
    const names = new Map(
      configNames.data.map((item) => [
        item.organization_id,
        (item.profile as { name?: string })?.name,
      ]),
    );
    const selected = (await cookies()).get(organizationCookie)?.value;
    return Response.json(
      {
        organizations: organizations.map((item) => ({
          id: item.organization_id,
          name: names.get(item.organization_id) || item.name,
          role: item.role,
        })),
        activeId:
          organizations.find((item) => item.organization_id === selected)
            ?.organization_id ||
          organizations[0]?.organization_id ||
          null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (!canCreateBusiness(user))
      throw new HttpError(
        403,
        "Only Walker's designated account can create a business.",
      );
    const { name } = z
      .object({ name: z.string().trim().min(2).max(120) })
      .parse(await request.json());
    const { data, error } = await supabaseAdmin().rpc(
      "remodel_create_business",
      {
        target_profile: user.id,
        business_name: name,
      },
    );
    if (error) throw error;
    return Response.json({ id: data, name }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { organizationId } = z
      .object({ organizationId: z.uuid() })
      .parse(await request.json());
    const organizations = await memberships();
    if (!organizations.some((item) => item.organization_id === organizationId))
      throw new HttpError(403, "You do not have access to that organization.");
    (await cookies()).set(organizationCookie, organizationId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
