import { getBusinessConfigForOrganization } from "@/lib/business-config";
import { organizationIdPattern } from "@/lib/organization-context";

export default async function PaymentComplete({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string; organization?: string }>;
}) {
  const params = await searchParams;
  const canceled = params.canceled === "1";
  let businessName = "Your contractor";
  if (params.organization && organizationIdPattern.test(params.organization)) {
    try {
      businessName = (
        await getBusinessConfigForOrganization(params.organization)
      ).profile.name;
    } catch {
      // A stale payment link still shows the result without exposing database errors.
    }
  }
  return (
    <main className="payment-result">
      <div className="payment-result-card">
        <span>{businessName}</span>
        <h1>{canceled ? "Payment canceled" : "Thank you for your payment"}</h1>
        <p>
          {canceled
            ? "No payment was submitted. You can return to the payment link when you’re ready."
            : "Your payment was submitted. We’ll confirm it in your project record once Stripe finishes processing."}
        </p>
      </div>
    </main>
  );
}
