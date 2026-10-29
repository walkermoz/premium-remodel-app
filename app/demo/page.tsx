import WorkspaceApp from "@/components/workspace-app";
import { defaultBusinessConfig } from "@/lib/business-config";
import { BusinessProvider } from "@/components/business-context";
export default async function Demo({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; scenario?: string }>;
}) {
  const config = defaultBusinessConfig();
  config.features.priceBook = true;
  config.quotePreferences.showPriceBookPicker = true;
  const params = await searchParams;
  const doorKnocker = params.as === "doorknocker";
  const demoScenario =
    params.scenario === "quote-project-handoff"
      ? "quote-project-handoff"
      : undefined;
  return (
    <BusinessProvider config={config}>
      <WorkspaceApp
        demo
        demoScenario={demoScenario}
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
