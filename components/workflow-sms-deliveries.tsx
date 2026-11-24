export default function WorkflowSmsDeliveries({
  output,
}: {
  output: Record<string, unknown>;
}) {
  const deliveries = Array.isArray(output.deliveries) ? output.deliveries : [];
  const failures = Array.isArray(output.failures) ? output.failures : [];
  const recipients = [
    ...deliveries.map((recipient) => ({ recipient, sent: true })),
    ...failures.map((recipient) => ({ recipient, sent: false })),
  ].filter(({ recipient }) => recipient && typeof recipient === "object");
  if (!recipients.length) return null;
  return (
    <div>
      <strong>SMS recipient results</strong>
      <p>
        Accepted by Twilio means the send was accepted; it does not confirm
        handset delivery.
      </p>
      <ul className="workflow-run-branches" aria-label="SMS recipient results">
        {recipients.map(({ recipient, sent }, index) => (
          <li key={index} className={sent ? "is-selected" : "is-skipped"}>
            <strong>{String(recipient.name || "Recipient")}</strong>
            {recipient.phone && <small>{String(recipient.phone)}</small>}
            <span>{sent ? "Accepted by Twilio" : "Send not confirmed"}</span>
            {sent && recipient.messageSid && (
              <small>Message ID: {String(recipient.messageSid)}</small>
            )}
            {!sent && recipient.detail && (
              <small>{String(recipient.detail)}</small>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
