import type { Contractor } from "./types";

export function contactPhotoUrl(contact: Contractor) {
  if (!contact.photoPath) return undefined;
  const version = contact.photoUpdatedAt || contact.updatedAt;
  return `/api/contact-photos?contactId=${encodeURIComponent(contact.id)}&v=${encodeURIComponent(version)}`;
}
