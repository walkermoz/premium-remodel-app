export const premiumRemodelSmsPolicy = {
  policyVersion: "2026-10-21",
  source: "premiumremodel.com consultation form",
  privacyUrl: "https://www.premiumremodel.com/privacy-policy",
  termsUrl: "https://www.premiumremodel.com/terms-and-conditions",
} as const;

export type SmsMessageCategory = "appointment" | "marketing";

export interface SmsConsentEvidence {
  source: typeof premiumRemodelSmsPolicy.source;
  policyVersion: typeof premiumRemodelSmsPolicy.policyVersion;
  privacyUrl: typeof premiumRemodelSmsPolicy.privacyUrl;
  termsUrl: typeof premiumRemodelSmsPolicy.termsUrl;
  capturedAt: string;
  origin: string;
  appointment: boolean;
  marketing: boolean;
}

export function websiteSmsConsentEvidence(input: {
  capturedAt: string;
  origin: string;
  appointment: boolean;
  marketing: boolean;
}): SmsConsentEvidence {
  return {
    source: premiumRemodelSmsPolicy.source,
    policyVersion: premiumRemodelSmsPolicy.policyVersion,
    privacyUrl: premiumRemodelSmsPolicy.privacyUrl,
    termsUrl: premiumRemodelSmsPolicy.termsUrl,
    ...input,
  };
}
