import { appUrl } from "./config";
import { supabase } from "./supabase";

async function accessToken() {
  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }
  if (!session) throw new Error("Your session expired. Sign in again.");
  return session.access_token;
}

export async function appRequest<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {},
) {
  const token = await accessToken();
  const response = await fetch(`${appUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      payload.error || "Premium Remodel is temporarily unavailable.",
    );
  return payload as T;
}
