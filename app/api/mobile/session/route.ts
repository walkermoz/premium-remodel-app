import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { apiError, requireRequestUser } from "@/lib/auth";
import { supabaseConfig } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    const refreshToken =
      request.headers.get("x-supabase-refresh-token")?.trim() || "";

    if (
      !accessToken ||
      !refreshToken ||
      accessToken.length > 10_000 ||
      refreshToken.length > 10_000
    )
      return Response.json(
        { error: "A valid mobile session is required." },
        { status: 401 },
      );

    await requireRequestUser(request);

    const destination = new URL("/", request.url);
    destination.searchParams.set("mobile", "1");
    const response = NextResponse.redirect(destination, 303);
    response.headers.set("Cache-Control", "private, no-store");

    const { url, key } = supabaseConfig();
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          for (const { name, value, options } of values)
            response.cookies.set(name, value, options);
        },
      },
    });
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error)
      return Response.json(
        { error: "The mobile session could not be opened." },
        { status: 401 },
      );

    return response;
  } catch (error) {
    return apiError(error);
  }
}
