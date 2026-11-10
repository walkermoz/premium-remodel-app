import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LegacyClientProjectPortal({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/client/${encodeURIComponent(token)}/quote?view=schedule`);
}
