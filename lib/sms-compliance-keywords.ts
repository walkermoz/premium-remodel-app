export type SmsComplianceEventType = "stop" | "start" | "help";

const stopKeywords = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "REVOKE",
  "OPTOUT",
  "QUIT",
]);
const startKeywords = new Set(["START", "UNSTOP"]);
const helpKeywords = new Set(["HELP", "INFO"]);

export function classifySmsComplianceEvent(
  body: string,
  optOutType?: string | null,
): SmsComplianceEventType | null {
  const twilioType = optOutType?.trim().toUpperCase();
  if (twilioType === "STOP") return "stop";
  if (twilioType === "START") return "start";
  if (twilioType === "HELP") return "help";

  const keyword = body.trim().toUpperCase();
  if (stopKeywords.has(keyword)) return "stop";
  if (startKeywords.has(keyword)) return "start";
  if (helpKeywords.has(keyword)) return "help";
  return null;
}
