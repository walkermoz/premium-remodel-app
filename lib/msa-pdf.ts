import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import {
  msaCompanyAddress,
  msaCompanyName,
  msaPaymentRows,
} from "./msa-contract";
import type { MsaAgreement, SignatureStroke } from "./types";

const W = 612,
  H = 792,
  L = 48,
  R = 564,
  TOP = 48,
  BOTTOM = 56;
const navy = rgb(0.07, 0.17, 0.24),
  blue = rgb(0.15, 0.43, 0.69),
  gray = rgb(0.36, 0.43, 0.48);
const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
const clean = (value: string) =>
  value
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "");
const date = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`))
    : "To be completed when the owner signs";

export async function buildMsaPdf(agreement: MsaAgreement) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - TOP;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - TOP;
  };
  const requireSpace = (height: number) => {
    if (y - height < BOTTOM) newPage();
  };
  const wrapped = (value: string, font: PDFFont, size: number) => {
    const lines: string[] = [];
    for (const para of clean(value).split(/\r?\n/)) {
      if (!para.trim()) {
        lines.push("");
        continue;
      }
      let line = "";
      for (const word of para.trim().split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (!line || font.widthOfTextAtSize(candidate, size) <= R - L)
          line = candidate;
        else {
          lines.push(line);
          line = word;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  };
  const write = (
    value: string,
    opts: { heading?: boolean; small?: boolean; gap?: number } = {},
  ) => {
    const size = opts.heading ? 14 : opts.small ? 9 : 10;
    const font = opts.heading ? bold : regular;
    const leading = opts.heading ? 18 : 14;
    y -= opts.gap ?? (opts.heading ? 14 : 8);
    for (const line of wrapped(value, font, size)) {
      requireSpace(leading);
      if (line)
        page.drawText(line, {
          x: L,
          y,
          font,
          size,
          color: opts.heading ? blue : navy,
        });
      y -= leading;
    }
  };
  const title = (value: string) => {
    requireSpace(55);
    write(value, { heading: true, gap: 20 });
  };
  const signature = (strokes: SignatureStroke[], label: string) => {
    requireSpace(96);
    write(label, { gap: 8 });
    const top = y - 3;
    for (const stroke of strokes)
      for (let i = 1; i < stroke.length; i++) {
        const [x1, y1] = stroke[i - 1],
          [x2, y2] = stroke[i];
        page.drawLine({
          start: { x: L + x1 * 240, y: top - y1 * 56 },
          end: { x: L + x2 * 240, y: top - y2 * 56 },
          thickness: 1.5,
          color: navy,
        });
      }
    y -= 64;
  };
  write("PREMIUM REMODEL", { heading: true, gap: 0 });
  title("MASTER SERVICES AGREEMENT");
  write(`Effective date: ${date(agreement.transactionDate)}`);
  write(
    `This Master Services Agreement (this Agreement) is made as of ${date(agreement.transactionDate)} (the Effective Date) between ${msaCompanyName}, a North Carolina limited liability company located at ${msaCompanyAddress} (the Contractor), and ${agreement.owner} (the Owner) (each a Party and collectively the Parties). This Agreement consists of this cover agreement and the attached Exhibits, including the General Terms and Conditions attached as Exhibit A, which together govern the work to be performed for the Owner's project (the Work). By signing, the Parties agree to this Agreement, including all attached Contract Documents.`,
  );
  write(
    `Contractor: ${msaCompanyName} | NC General Contractor License No. 109080`,
  );
  write(
    `Owner contact: ${agreement.ownerPhone || "Phone not supplied"} | ${agreement.ownerEmail}`,
  );
  write(`Project: ${agreement.projectName} | Premises: ${agreement.address}`);
  write(
    `Accepted quote: ${agreement.quoteNumber ? `#${agreement.quoteNumber}` : "attached accepted scope"} | Contract price: ${money(agreement.price)}`,
  );
  write(
    `Pricing method: Fixed price, unless a separate Cost-Plus or Time-and-Materials Rider is executed. Deposit: ${money(msaPaymentRows(agreement)[0].amount)} (${agreement.paymentSchedule[0].percent}%).`,
  );
  write(
    `Estimated start: ${agreement.estimatedStart || "To be scheduled"} | Estimated completion: ${agreement.estimatedCompletion || "To be scheduled"}`,
  );
  signature(
    agreement.staffSignature.signatureStrokes,
    `Contractor: ${agreement.staffSignature.name}, ${agreement.staffSignature.title || ""} | ${date(agreement.staffSignature.signedAt)}`,
  );
  if (agreement.customerSignature)
    signature(
      agreement.customerSignature.signatureStrokes,
      `Owner: ${agreement.customerSignature.name} | ${date(agreement.transactionDate)}`,
    );
  else write("Owner signature: Pending electronic signature");
  newPage();
  for (const block of agreement.generalTerms) {
    if (!block.text.trim()) continue;
    write(block.text, {
      heading:
        block.style.toLowerCase().includes("heading") ||
        block.text === "EXHIBIT A",
      small: true,
    });
  }
  newPage();
  title("EXHIBIT B - SCOPE OF WORK");
  write(
    "The Contractor is responsible only for the Work specifically included below and in the Contract Documents. Work not included is excluded unless added by a written Change Order.",
  );
  write(`Project: ${agreement.projectName}`);
  write("Work included:", { heading: true });
  for (const item of agreement.scope)
    write(
      `${item.section} - ${item.title}${item.details ? `: ${item.details}` : ""} (${money(item.amount)})`,
    );
  write(`Work excluded: ${agreement.terms.exclusions}`);
  write(`Permits: ${agreement.permitResponsibility}`);
  write(`Site/access: ${agreement.terms.siteAccess}`);
  write("Named subcontractors/consultants: None named in the accepted quote.");
  write(`Plans/specifications: ${agreement.terms.plans}`);
  write(
    `Owner approval: ${agreement.customerSignature ? `${agreement.customerSignature.name}, signed ${date(agreement.transactionDate)}` : "Pending signature"}`,
  );
  title("EXHIBIT C - CONTRACT PRICE AND PAYMENT SCHEDULE");
  write(`Fixed contract price: ${money(agreement.price)}`);
  for (const row of msaPaymentRows(agreement))
    write(`${row.percent}% - ${money(row.amount)} - ${row.milestone}`);
  write(
    "An adjustment authorized by a Change Order is paid when stated in that order, or with the next payment otherwise due. Late payments are governed by Section 4.3 of Exhibit A.",
  );
  write(`Retainage: ${agreement.terms.retainage}`);
  write(`Builder's risk insurance: ${agreement.terms.buildersRisk}`);
  write(
    `Owner approval: ${agreement.customerSignature ? `${agreement.customerSignature.name}, signed ${date(agreement.transactionDate)}` : "Pending signature"}`,
  );
  title("EXHIBIT D - SELECTIONS AND ALLOWANCES");
  write(agreement.terms.allowances);
  write(
    `Owner approval: ${agreement.customerSignature ? `${agreement.customerSignature.name}, signed ${date(agreement.transactionDate)}` : "Pending signature"}`,
  );
  title("EXHIBIT E - PLANS AND SPECIFICATIONS");
  write(agreement.terms.plans);
  title("EXHIBIT F - CHANGE ORDER FORM");
  write(
    "Use this form to authorize a change to the Work. A Change Order is effective when signed or electronically approved by both Parties.",
  );
  write(
    "Description of change: ______________________________________________",
  );
  write(
    "Price adjustment: ______________  Schedule adjustment: ______________",
  );
  write("Contractor approval: ______________  Owner approval: ______________");
  for (let copy = 0; copy < 2; copy++) {
    newPage();
    title(
      `EXHIBIT G - NOTICE OF CANCELLATION${copy ? " (DUPLICATE COPY)" : ""}`,
    );
    write(`Transaction Date: ${date(agreement.transactionDate)}`);
    write(
      "YOU MAY CANCEL THIS TRANSACTION, WITHOUT ANY PENALTY OR OBLIGATION, WITHIN THREE BUSINESS DAYS FROM THE ABOVE DATE.",
    );
    write(
      "If you cancel, any property traded in, payments made by you under the contract or sale, and any negotiable instrument executed by you will be returned within ten (10) business days following receipt by the seller of your cancellation notice, and any security interest arising out of the transaction will be canceled.",
    );
    write(
      "If you cancel, you must make available to the seller at your residence, in substantially as good condition as when received, any goods delivered to you under this contract or sale; or you may, if you wish, comply with the seller's instructions regarding the return shipment of the goods at the seller's expense and risk.",
    );
    write(
      "If you make the goods available to the seller and the seller does not pick them up within twenty (20) days after the date of your notice of cancellation, you may retain or dispose of the goods without any further obligation. If you fail to make the goods available to the seller, or if you agree to return the goods to the seller and fail to do so, you remain liable for performance of all obligations under the contract.",
    );
    write(
      `To cancel this transaction, mail or deliver a signed and dated copy of this Notice of Cancellation or any other written notice, or send a telegram, to: ${msaCompanyName}, ${msaCompanyAddress}.`,
    );
    write(
      `NOT LATER THAN MIDNIGHT OF ${date(agreement.cancellationDeadline)}.`,
    );
    write("I HEREBY CANCEL THIS TRANSACTION.");
    write(
      "Date: __________________  Owner's signature: __________________________",
    );
  }
  pdf.getPages().forEach((sheet, index) => {
    sheet.drawLine({
      start: { x: L, y: 42 },
      end: { x: R, y: 42 },
      thickness: 0.5,
      color: gray,
    });
    sheet.drawText(
      `Premium Remodel  |  Master Services Agreement  |  Page ${index + 1} of ${pdf.getPageCount()}`,
      { x: L, y: 28, font: regular, size: 8, color: gray },
    );
  });
  return pdf.save();
}
