import {
  msaCompanyAddress,
  msaCompanyName,
  msaPaymentRows,
} from "@/lib/msa-contract";
import type { MsaAgreement } from "@/lib/types";
import { MsaSignatureImage } from "./msa-signature-pad";
import styles from "./msa-document.module.css";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
const longDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`))
    : "To be completed when the owner signs";

function CancellationNotice({ agreement }: { agreement: MsaAgreement }) {
  return (
    <section className={styles.exhibit}>
      <h2>Exhibit G · Notice of cancellation</h2>
      <p>
        <strong>Transaction date:</strong> {longDate(agreement.transactionDate)}
      </p>
      <p className={styles.notice}>
        YOU MAY CANCEL THIS TRANSACTION, WITHOUT ANY PENALTY OR OBLIGATION,
        WITHIN THREE BUSINESS DAYS FROM THE ABOVE DATE.
      </p>
      <p>
        If you cancel, any property traded in, payments made by you under the
        contract or sale, and any negotiable instrument executed by you will be
        returned within ten (10) business days following receipt by the seller
        of your cancellation notice, and any security interest arising out of
        the transaction will be canceled.
      </p>
      <p>
        If you cancel, you must make available to the seller at your residence,
        in substantially as good condition as when received, any goods delivered
        to you under this contract or sale; or you may, if you wish, comply with
        the seller’s instructions regarding the return shipment of the goods at
        the seller’s expense and risk.
      </p>
      <p>
        If you make the goods available to the seller and the seller does not
        pick them up within twenty (20) days after the date of your notice of
        cancellation, you may retain or dispose of the goods without any further
        obligation. If you fail to make the goods available to the seller, or if
        you agree to return the goods to the seller and fail to do so, you
        remain liable for performance of all obligations under the contract.
      </p>
      <p>
        To cancel this transaction, mail or deliver a signed and dated copy of
        this Notice of Cancellation or any other written notice, or send a
        telegram, to:
      </p>
      <address>
        {msaCompanyName}
        <br />
        309 Amiable Loop
        <br />
        Cary, North Carolina 27519
      </address>
      <p className={styles.notice}>
        NOT LATER THAN MIDNIGHT OF {longDate(agreement.cancellationDeadline)}.
      </p>
      <p>I HEREBY CANCEL THIS TRANSACTION.</p>
      <p>
        Date: ____________________ &nbsp;&nbsp; Owner’s signature:
        ______________________________
      </p>
    </section>
  );
}

export default function MsaDocument({
  agreement,
}: {
  agreement: MsaAgreement;
}) {
  return (
    <article className={styles.document}>
      <header className={styles.header}>
        <img src="/images/logo.png" alt="Premium Remodel" />
        <h1>Master Services Agreement</h1>
        <p>
          This Master Services Agreement (this “Agreement”) is made as of{" "}
          {longDate(agreement.transactionDate)} (the “Effective Date”) between{" "}
          {msaCompanyName}, a North Carolina limited liability company located
          at {msaCompanyAddress} (the “Contractor”), and {agreement.owner} (the
          “Owner”) (each, a “Party” and collectively, the “Parties”). This
          Agreement consists of this cover agreement (the “Cover Agreement”) and
          the attached Exhibits, including the General Terms and Conditions
          attached as Exhibit A, which together govern the work to be performed
          for the Owner’s project (the “Work”). By signing, the Parties agree to
          this Agreement, including all of the attached Contract Documents.
        </p>
      </header>
      <div className={styles.summary}>
        <div>
          <span>Owner</span>
          <strong>{agreement.owner}</strong>
        </div>
        <div>
          <span>Owner contact</span>
          <strong>
            {agreement.ownerPhone || "Phone not supplied"} ·{" "}
            {agreement.ownerEmail}
          </strong>
        </div>
        <div>
          <span>Contractor license</span>
          <strong>NC General Contractor License No. 109080</strong>
        </div>
        <div>
          <span>Project</span>
          <strong>{agreement.projectName}</strong>
        </div>
        <div>
          <span>Premises</span>
          <strong>{agreement.address}</strong>
        </div>
        <div>
          <span>Accepted quote</span>
          <strong>
            {agreement.quoteNumber
              ? `#${agreement.quoteNumber}`
              : "Attached accepted scope"}
          </strong>
        </div>
        <div>
          <span>Contract price</span>
          <strong>{money(agreement.price)}</strong>
        </div>
        <div>
          <span>Pricing method</span>
          <strong>
            Fixed price, unless a separate Cost-Plus or Time-and-Materials Rider
            is executed.
          </strong>
        </div>
        <div>
          <span>Deposit</span>
          <strong>
            {money(msaPaymentRows(agreement)[0].amount)} (
            {agreement.paymentSchedule[0].percent}%)
          </strong>
        </div>
        <div>
          <span>Estimated start / completion</span>
          <strong>
            {agreement.estimatedStart || "To be scheduled"} /{" "}
            {agreement.estimatedCompletion || "To be scheduled"}
          </strong>
        </div>
      </div>
      <section className={styles.signatures}>
        <h2>Signatures</h2>
        <div>
          <strong>Contractor</strong>
          <p>
            {agreement.staffSignature.name}, {agreement.staffSignature.title}
          </p>
          <MsaSignatureImage
            strokes={agreement.staffSignature.signatureStrokes}
            label="Contractor signature"
          />
          <p>{longDate(agreement.staffSignature.signedAt)}</p>
        </div>
        <div>
          <strong>Owner</strong>
          {agreement.customerSignature ? (
            <>
              <p>{agreement.customerSignature.name}</p>
              <MsaSignatureImage
                strokes={agreement.customerSignature.signatureStrokes}
                label="Owner signature"
              />
              <p>{longDate(agreement.transactionDate)}</p>
            </>
          ) : (
            <p>To be signed by the owner below.</p>
          )}
        </div>
      </section>
      <section className={styles.exhibit}>
        {agreement.generalTerms.map((block, index) =>
          block.style.toLowerCase().includes("heading") || index < 2 ? (
            <h2 key={index}>{block.text}</h2>
          ) : block.text.trim() ? (
            <p key={index}>{block.text}</p>
          ) : null,
        )}
      </section>
      <section className={styles.exhibit}>
        <h2>Exhibit B · Scope of work</h2>
        <p>
          The Contractor is responsible only for the Work specifically included
          below and in the Contract Documents. Work not included is excluded
          unless added by a written Change Order.
        </p>
        <p>
          <strong>Project:</strong> {agreement.projectName}
        </p>
        <h3>Work included</h3>
        <ul>
          {agreement.scope.map((item, index) => (
            <li key={index}>
              <strong>
                {item.section} · {item.title}
              </strong>
              {item.details ? ` — ${item.details}` : ""}{" "}
              <span>{money(item.amount)}</span>
            </li>
          ))}
        </ul>
        <p>
          <strong>Work excluded:</strong> {agreement.terms.exclusions}
        </p>
        <p>
          <strong>Permits:</strong> {agreement.permitResponsibility}
        </p>
        <p>
          <strong>Site and access:</strong> {agreement.terms.siteAccess}
        </p>
        <p>
          <strong>Named subcontractors / consultants:</strong> None named in the
          accepted quote.
        </p>
        <p>
          <strong>Plans and specifications:</strong> {agreement.terms.plans}
        </p>
        <p>
          Owner approval of Exhibit B:{" "}
          {agreement.customerSignature
            ? `Electronically approved by ${agreement.customerSignature.name} on ${longDate(agreement.transactionDate)}.`
            : "Pending owner signature."}
        </p>
      </section>
      <section className={styles.exhibit}>
        <h2>Exhibit C · Contract price and payment schedule</h2>
        <p>
          <strong>Contract price:</strong> {money(agreement.price)}
        </p>
        <ol>
          {msaPaymentRows(agreement).map((row) => (
            <li key={row.id}>
              <span>{row.milestone}</span>
              <strong>
                {row.percent}% · {money(row.amount)}
              </strong>
            </li>
          ))}
        </ol>
        <p>
          Changes authorized by a Change Order are payable at the time stated
          there or with the next payment due under this schedule. Late payments
          are governed by Section 4.3 of Exhibit A.
        </p>
        <p>
          <strong>Retainage:</strong> {agreement.terms.retainage}
        </p>
        <p>
          <strong>Builder’s risk insurance:</strong>{" "}
          {agreement.terms.buildersRisk}
        </p>
        <p>
          Owner approval of Exhibit C:{" "}
          {agreement.customerSignature
            ? `Electronically approved by ${agreement.customerSignature.name} on ${longDate(agreement.transactionDate)}.`
            : "Pending owner signature."}
        </p>
      </section>
      <section className={styles.exhibit}>
        <h2>Exhibit D · Selections and allowances</h2>
        <p>{agreement.terms.allowances}</p>
        <p>
          Owner approval of Exhibit D:{" "}
          {agreement.customerSignature
            ? `Electronically approved by ${agreement.customerSignature.name} on ${longDate(agreement.transactionDate)}.`
            : "Pending owner signature."}
        </p>
      </section>
      <section className={styles.exhibit}>
        <h2>Exhibit E · Plans and specifications</h2>
        <p>{agreement.terms.plans}</p>
      </section>
      <section className={styles.exhibit}>
        <h2>Exhibit F · Change order form</h2>
        <p>
          Use this form to authorize a change to the Work. A Change Order is
          effective when signed or electronically approved by both Parties.
        </p>
        <p>
          Description of change:
          ________________________________________________
        </p>
        <p>
          Price adjustment: ______________ &nbsp; Schedule adjustment:
          ______________
        </p>
        <p>
          Contractor approval: __________________ &nbsp; Owner approval:
          __________________
        </p>
      </section>
      <CancellationNotice agreement={agreement} />
      <CancellationNotice agreement={agreement} />
    </article>
  );
}
