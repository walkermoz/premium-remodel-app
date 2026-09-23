import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import WorkspaceApp from "@/components/workspace-app";
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
  return <WorkspaceApp user={user} />;
}
