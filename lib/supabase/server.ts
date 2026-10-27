import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";
import {
  organizationCookie,
  organizationHeader,
  organizationIdPattern,
} from "../organization-context";

export async function supabaseServer(useSelectedOrganization = true) {
  const { url, key } = supabaseConfig();
  const jar = await cookies();
  const selected = useSelectedOrganization
    ? jar.get(organizationCookie)?.value
    : undefined;
  return createServerClient(url, key, {
    global: {
      headers:
        selected && organizationIdPattern.test(selected)
          ? { [organizationHeader]: selected }
          : {},
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          for (const { name, value, options } of values)
            jar.set(name, value, options);
        } catch {
          // Server components cannot write cookies. Proxy refreshes them first.
        }
      },
    },
  });
}
export function supabaseAdmin() {
  const { url } = supabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export function supabasePublic() {
  const { url, key } = supabaseConfig();
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function supabaseForAccessToken(token: string, organizationId?: string) {
  const { url, key } = supabaseConfig();
  return createClient(url, key, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(organizationId && organizationIdPattern.test(organizationId)
          ? { [organizationHeader]: organizationId }
          : {}),
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
