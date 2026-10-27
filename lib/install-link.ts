export const appInstallUrl = "https://servicebuddy-ui.vercel.app";

export function appInstallMessageForBusiness(name: string) {
  return (
    `${name.trim().slice(0, 60)} app: ${appInstallUrl}\n\n` +
    "Install on iPhone: Safari > Share > Add to Home Screen. " +
    "Android: Chrome > menu > Add to Home screen."
  );
}

export const appInstallMessage =
  appInstallMessageForBusiness("Premium Remodel");

export function normalizeSmsRecipient(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  const candidate = trimmed.startsWith("+")
    ? `+${digits}`
    : digits.length === 10
      ? `+1${digits}`
      : digits.length === 11 && digits.startsWith("1")
        ? `+${digits}`
        : "";
  return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null;
}

export function maskedPhone(value: string) {
  return `••• ••• ${value.slice(-4)}`;
}
