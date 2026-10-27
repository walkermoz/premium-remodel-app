import WorkspaceApp from "@/components/workspace-app";
import { defaultBusinessConfig } from "@/lib/business-config";
import { BusinessProvider } from "@/components/business-context";
export default function Demo() {
  const config = defaultBusinessConfig();
  return (
    <BusinessProvider config={config}>
      <WorkspaceApp
        demo
        config={config}
        user={{
          id: "demo",
          name: "Alex Morgan",
          email: "demo@example.com",
          role: "admin",
          group: "owner",
        }}
      />
    </BusinessProvider>
  );
}
