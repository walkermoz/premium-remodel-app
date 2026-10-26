import { redirect } from "next/navigation";

// Legacy project links no longer expose a separate client-facing page.
export default function LegacyClientProjectPage() {
  redirect("/client/sign-in");
}
