import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";

const linkId = z.uuid();
const linkSignature = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const emailLinkLifetimeSeconds = 30 * 24 * 60 * 60;
function clientPortalSecret() {
  const value = process.env.CLIENT_PORTAL_SECRET?.trim();
  if (!value || value.length < 32)
    throw new Error("Client portal signing is not configured.");
  return value;
}

function signatureFor(id: string) {
  return createHmac("sha256", clientPortalSecret())
    .update(`premium-remodel-client:${id}`)
    .digest("base64url");
}

export function createClientPortalToken(id: string = randomUUID()) {
  return `${id}.${signatureFor(id)}`;
}

export function clientPortalEmailTag(email: string) {
  return createHmac("sha256", clientPortalSecret())
    .update(`premium-remodel-client-email:${email.trim().toLowerCase()}`)
    .digest("base64url");
}

function emailLinkSignature(
  id: string,
  expiresAt: number,
  nonce: string,
  emailTag: string,
) {
  return createHmac("sha256", clientPortalSecret())
    .update(
      `premium-remodel-client-email-link:${id}:${expiresAt}:${nonce}:${emailTag}`,
    )
    .digest("base64url");
}

/** A fresh, email-bound link that expires 30 days after it is issued. */
export function createClientEmailToken(
  id: string,
  email: string,
  issuedAt = Date.now(),
) {
  const parsedId = linkId.parse(id);
  const expiresAt = Math.floor(issuedAt / 1000) + emailLinkLifetimeSeconds;
  const nonce = randomBytes(16).toString("base64url");
  const emailTag = clientPortalEmailTag(email);
  return `${parsedId}.${expiresAt}.${nonce}.${emailTag}.${emailLinkSignature(parsedId, expiresAt, nonce, emailTag)}`;
}

export function parseClientPortalAccess(value: string, now = Date.now()) {
  const [rawId, second, third, fourth, fifth, extra] = value.split(".");
  const id = linkId.safeParse(rawId);
  if (!id.success || extra !== undefined) return null;
  if (third === undefined && fourth === undefined && fifth === undefined) {
    const signature = linkSignature.safeParse(second);
    if (!signature.success) return null;
    const expected = Buffer.from(signatureFor(id.data), "base64url");
    const received = Buffer.from(signature.data, "base64url");
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    )
      return null;
    return { id: id.data, emailTag: null, expiresAt: null, expired: false };
  }
  if (
    !/^\d{10}$/.test(second || "") ||
    !/^[A-Za-z0-9_-]{22}$/.test(third || "") ||
    !linkSignature.safeParse(fourth).success ||
    !linkSignature.safeParse(fifth).success
  )
    return null;
  const expiresAt = Number(second);
  const expected = Buffer.from(
    emailLinkSignature(id.data, expiresAt, third!, fourth!),
    "base64url",
  );
  const received = Buffer.from(fifth!, "base64url");
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  )
    return null;
  return {
    id: id.data,
    emailTag: fourth!,
    expiresAt,
    expired: expiresAt * 1000 <= now,
  };
}

export function parseClientPortalToken(value: string) {
  const access = parseClientPortalAccess(value);
  return access && !access.expired ? access.id : null;
}

export function isExpiredClientEmailToken(value: string) {
  const access = parseClientPortalAccess(value);
  return Boolean(access?.emailTag && access.expired);
}

const walletFormLifetimeSeconds = 2 * 60 * 60;

function walletFormSignature(id: string, issuedAt: number) {
  return createHmac("sha256", clientPortalSecret())
    .update(`premium-remodel-wallet-form:${id}:${issuedAt}`)
    .digest("base64url");
}

/** A short-lived CSRF token for a form rendered within one private quote link. */
export function createClientWalletFormToken(portalToken: string) {
  const id = parseClientPortalToken(portalToken);
  if (!id) throw new Error("Invalid client portal link.");
  const issuedAt = Math.floor(Date.now() / 1000);
  return `${issuedAt}.${walletFormSignature(id, issuedAt)}`;
}

export function validClientWalletFormToken(
  portalToken: string,
  formToken: unknown,
) {
  const id = parseClientPortalToken(portalToken);
  if (!id || typeof formToken !== "string") return false;
  const [rawTime, rawSignature, extra] = formToken.split(".");
  if (
    extra !== undefined ||
    !/^\d{10}$/.test(rawTime || "") ||
    !/^[A-Za-z0-9_-]{43}$/.test(rawSignature || "")
  )
    return false;
  const issuedAt = Number(rawTime);
  const now = Math.floor(Date.now() / 1000);
  if (issuedAt > now + 60 || issuedAt < now - walletFormLifetimeSeconds)
    return false;
  const expected = Buffer.from(walletFormSignature(id, issuedAt), "base64url");
  const received = Buffer.from(rawSignature, "base64url");
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
