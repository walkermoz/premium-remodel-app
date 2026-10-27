import WorkspaceApp from "@/components/workspace-app";
import { defaultBusinessConfig } from "@/lib/business-config";
import { BusinessProvider } from "@/components/business-context";
export default async function Demo({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const config = defaultBusinessConfig();
  const doorKnocker = (await searchParams).as === "doorknocker";
  return (
    <BusinessProvider config={config}>
      <WorkspaceApp
        demo
        config={config}
        user={{
          id: "demo",
          name: "Alex Morgan",
          email: "demo@example.com",
          role: doorKnocker ? "member" : "admin",
          group: doorKnocker ? "doorknocker" : "owner",
        }}
      />
    </BusinessProvider>
  );
}
