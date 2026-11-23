import type { OperatingSettings } from "./operating-settings";
export type PortalVisibility = OperatingSettings["portal"];
export function portalViewAllowed(portal: PortalVisibility, view: string) {
  const key = (
    {
      detail: "quotes",
      quotes: "quotes",
      schedule: "schedule",
      msa: "agreements",
      invoices: "invoices",
      wallet: "payments",
      requests: "requests",
      "new-request": "requests",
    } as const
  )[view as "detail"];
  return !key || portal[key];
}
export function portalFlowBlockAllowed(
  portal: PortalVisibility,
  stageType: string,
  blockType: string,
) {
  if (!portal.quotes) return false;
  if (
    ([
      "signature_collection",
      "initials_collection",
      "agreement_details",
      "document",
    ].includes(stageType) ||
      [
        "signature",
        "initials",
        "uploaded_pdf",
        "generated_document",
        "terms_disclosures",
      ].includes(blockType)) &&
    !portal.agreements
  )
    return false;
  if (
    (stageType === "deposit_payment" || blockType === "deposit_collection") &&
    (!portal.payments || !portal.invoices)
  )
    return false;
  return true;
}
export function visibleSchedule<
  T extends { startTime?: string; endTime?: string },
>(items: T[], portal: PortalVisibility): T[] {
  return !portal.schedule
    ? []
    : portal.scheduleTimes
      ? items
      : items.map((item) => ({
          ...item,
          startTime: undefined,
          endTime: undefined,
        }));
}
