import source from "./msa-general-terms.json" with { type: "json" };
import type {
  AcceptedScopeItem,
  MsaAgreement,
  MsaContractTerms,
  MsaPaymentStep,
  MsaPermitResponsibility,
  Project,
  Quote,
} from "./types";

/** The same agreement content used for signing, with signatures left pending. */
export function makeMsaPreview({
  project,
  scope,
  price,
  paymentSchedule,
  permitResponsibility,
  terms,
  owner,
  ownerEmail,
  signerName,
  signerTitle,
}: {
  project: Project | Quote;
  scope: AcceptedScopeItem[];
  price: number;
  paymentSchedule: MsaPaymentStep[];
  permitResponsibility: MsaPermitResponsibility;
  terms: MsaContractTerms;
  owner: string;
  ownerEmail: string;
  signerName: string;
  signerTitle: string;
}): MsaAgreement {
  return {
    version: 1,
    status: "prepared",
    owner,
    ownerEmail,
    ownerPhone: project.clientPhone?.trim() || "",
    projectName: project.name,
    address: project.address,
    quoteNumber: project.quoteNumber || "",
    price,
    scope,
    paymentSchedule,
    permitResponsibility,
    terms,
    generalTerms: source.blocks,
    estimatedStart: project.startDate,
    estimatedCompletion: project.endDate,
    termsSha256: "",
    staffUserId: "",
    staffSignature: {
      name: signerName,
      title: signerTitle,
      signedAt: "",
      signatureStrokes: [],
    },
  };
}
