import WorkspaceApp from "@/components/workspace-app";
export default function Demo() {
  return (
    <WorkspaceApp
      demo
      user={{
        id: "demo",
        name: "Alex Morgan",
        email: "demo@example.com",
        role: "admin",
        group: "owner",
      }}
    />
  );
}
