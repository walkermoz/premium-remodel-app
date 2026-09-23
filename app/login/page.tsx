import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import LoginForm from "@/components/login-form";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  let user = null;
  let configurationError = !hasSupabaseConfig();
  try {
    user = await getUser();
  } catch {
    configurationError = true;
  }
  if (user) redirect("/");
  return (
    <LoginForm
      configurationError={configurationError}
      initialError={
        params.error
          ? "This invitation is invalid or expired. Ask your administrator for a new one."
          : undefined
      }
    />
  );
}
