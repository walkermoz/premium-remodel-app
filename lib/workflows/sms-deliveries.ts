export type SmsRecipient = { name: string; phone: string };
export type SmsDelivery = SmsRecipient & {
  status: "sent";
  messageSid: string;
};
export type SmsFailure = SmsRecipient & {
  status: "failed";
  detail: string;
};

// Keep every result in recipient order, even when one provider call rejects.
export async function collectSmsDeliveries(
  recipients: SmsRecipient[],
  send: (recipient: SmsRecipient) => Promise<{ sid: string }>,
) {
  const attempts = await Promise.allSettled(recipients.map(send));
  const deliveries: SmsDelivery[] = [];
  const failures: SmsFailure[] = [];
  const errors: unknown[] = [];
  attempts.forEach((attempt, index) => {
    const recipient = recipients[index];
    if (attempt.status === "fulfilled") {
      deliveries.push({
        ...recipient,
        status: "sent",
        messageSid: attempt.value.sid,
      });
    } else {
      // Provider errors may contain request details. Persist a safe explanation,
      // not the raw error or request body.
      failures.push({
        ...recipient,
        status: "failed",
        detail:
          "Send could not be confirmed. Check the recipient number and company texting connection.",
      });
      errors.push(attempt.reason);
    }
  });
  return { deliveries, failures, errors };
}
