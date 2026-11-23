import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import WorkspaceApp from "@/components/workspace-app";
import { getBusinessConfig } from "@/lib/business-config";
import { BusinessProvider } from "@/components/business-context";
import { OperatingSettingsProvider } from "@/components/operating-settings-context";
import { readOperatingSettings } from "@/lib/operating-settings.server";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  if (params.code)
    redirect(`/auth/accept?code=${encodeURIComponent(params.code)}`);
  const user = await getUser();
  if (!user) redirect("/login");
  const [config, operating] = await Promise.all([
    getBusinessConfig(user),
    readOperatingSettings(user.organizationId),
  ]);
  return (
    <BusinessProvider config={config}>
      <OperatingSettingsProvider initial={operating}>
        <WorkspaceApp user={user} config={config} />
      </OperatingSettingsProvider>
    </BusinessProvider>
  );
}
