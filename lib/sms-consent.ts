export const premiumRemodelSmsPolicy = {
  policyVersion: "2026-10-21",
  source: "premiumremodel.com consultation form",
  privacyUrl: "https://www.premiumremodel.com/privacy-policy",
  termsUrl: "https://www.premiumremodel.com/terms-and-conditions",
} as const;

export type SmsMessageCategory = "appointment" | "marketing";

export interface SmsConsentEvidence {
  source: string;
  policyVersion: string;
  privacyUrl: string;
  termsUrl: string;
  capturedAt: string;
  origin: string;
  appointment: boolean;
  marketing: boolean;
}

export function websiteSmsConsentEvidence(
  input: {
    capturedAt: string;
    origin: string;
    appointment: boolean;
    marketing: boolean;
  },
  policy: Pick<
    SmsConsentEvidence,
    "source" | "policyVersion" | "privacyUrl" | "termsUrl"
  > = premiumRemodelSmsPolicy,
): SmsConsentEvidence {
  return {
    ...policy,
    ...input,
  };
}
