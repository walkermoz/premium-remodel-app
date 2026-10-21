import { createHash } from "node:crypto";

export function stripePaymentId(sessionId: string) {
  const hash = createHash("sha256")
    .update(`premium-remodel:${sessionId}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function dollarsToCents(value: unknown) {
  if (typeof value !== "string" || !/^\d{1,8}(?:\.\d{1,2})?$/.test(value))
    return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return cents >= 50 && cents <= 99_999_999 ? cents : null;
}
