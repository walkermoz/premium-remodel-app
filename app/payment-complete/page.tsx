export default async function PaymentComplete({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>;
}) {
  const canceled = (await searchParams).canceled === "1";
  return (
    <main className="payment-result">
      <div className="payment-result-card">
        <span>Premium Remodel</span>
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
