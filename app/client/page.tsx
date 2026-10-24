import { redirect } from "next/navigation";

export default function ClientPortalEntry() {
  redirect("/client/sign-in");
}
