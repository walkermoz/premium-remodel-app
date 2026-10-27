import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import WorkspaceApp from "@/components/workspace-app";
import { getBusinessConfig } from "@/lib/business-config";
import { BusinessProvider } from "@/components/business-context";
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
  const config = await getBusinessConfig(user);
  return (
    <BusinessProvider config={config}>
      <WorkspaceApp user={user} config={config} />
    </BusinessProvider>
  );
}
