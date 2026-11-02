"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  ExternalLink,
  FileCheck2,
  FileSignature,
  FileText,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Link2,
  Mail,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PenLine,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Tablet,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import MsaSignaturePad, {
  MsaSignatureImage,
} from "@/components/msa-signature-pad";
import MsaDocument from "@/components/msa-document";
import { msaGeneralTerms } from "@/lib/msa-contract";
import type { MsaAgreement, SignatureStroke } from "@/lib/types";
import styles from "@/app/demo/signing/signing-demo.module.css";

type Surface = "app" | "portal";
type SigningStep = "quote" | "agreement";

const appNavigation = [
  [LayoutDashboard, "Overview"],
  [FolderKanban, "Projects"],
  [FileText, "Quotes"],
  [CircleDollarSign, "Price book"],
  [Inbox, "Leads"],
  [Users, "Contacts"],
] as const;

const scope = [
  [
    "Custom vanity installation",
    "Install a 60-inch white oak vanity, hardware, and finished side panels.",
  ],
  [
    "Quartz countertop",
    "Template, fabricate, and install quartz with eased edge and backsplash.",
  ],
  [
    "Plumbing connections",
    "Reconnect sink, faucet, shutoffs, drain, and supply lines.",
  ],
] as const;

const demoMsaAgreement: MsaAgreement = {
  version: 1,
  status: "sent",
  owner: "Taylor Reed",
  ownerEmail: "taylor@example.com",
  ownerPhone: "(919) 555-0142",
  projectName: "New Vanity",
  address: "1214 Chery Street, Raleigh, NC 27511",
  quoteNumber: "141",
  price: 19_750,
  scope: [
    {
      section: "Bathroom",
      title: scope[0][0],
      details: scope[0][1],
      amount: 12_000,
    },
    {
      section: "Bathroom",
      title: scope[1][0],
      details: scope[1][1],
      amount: 4_750,
    },
    {
      section: "Bathroom",
      title: scope[2][0],
      details: scope[2][1],
      amount: 3_000,
    },
  ],
  paymentSchedule: [
    { id: "deposit", milestone: "Deposit", percent: 50 },
    { id: "checkpoint-1", milestone: "Checkpoint 1", percent: 25 },
    { id: "checkpoint-2", milestone: "Checkpoint 2", percent: 15 },
    { id: "checkpoint-3", milestone: "Checkpoint 3", percent: 10 },
  ],
  permitResponsibility: "No permit required",
  terms: {
    exclusions:
      "Work outside the accepted quote and owner-supplied decorative fixtures.",
    allowances:
      "Selections and allowances follow the accepted quote and written change orders.",
    retainage: "None.",
    buildersRisk: "No builder’s risk insurance is required by default.",
    siteAccess: "Weekdays from 8:00 AM to 5:00 PM.",
    plans: "Work follows the accepted scope and verified field measurements.",
  },
  generalTerms: msaGeneralTerms,
  estimatedStart: "2026-11-16",
  estimatedCompletion: "2026-12-18",
  termsSha256: "demo-premium-remodel-msa",
  staffUserId: "demo-admin",
  staffSignature: {
    name: "Alex Morgan",
    title: "Administrator",
    signedAt: "2026-11-01",
    signatureStrokes: [
      [
        [0.12, 0.63],
        [0.3, 0.3],
        [0.49, 0.62],
        [0.72, 0.38],
      ],
    ],
  },
  sentAt: "2026-11-01T14:15:00.000Z",
};

export default function SigningExperienceDemo() {
  const [surface, setSurface] = useState<Surface>("app");
  const [signingOpen, setSigningOpen] = useState(false);
  const [deviceSigningOpen, setDeviceSigningOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [step, setStep] = useState<SigningStep>("quote");
  const [quoteSigned, setQuoteSigned] = useState(false);
  const [agreementSigned, setAgreementSigned] = useState(false);
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [sent, setSent] = useState(true);

  function reset() {
    setSigningOpen(false);
    setDeviceSigningOpen(false);
    setMethodOpen(false);
    setStep("quote");
    setQuoteSigned(false);
    setAgreementSigned(false);
    setStrokes([]);
    setAgreed(false);
    setSent(true);
  }

  function openPortal(
    target: SigningStep = quoteSigned ? "agreement" : "quote",
  ) {
    setSurface("portal");
    setStep(target);
    setSigningOpen(true);
    setMethodOpen(false);
    setStrokes([]);
    setAgreed(false);
  }

  function completeSignature() {
    if (!strokes.length || !agreed) return;
    if (step === "quote") {
      setQuoteSigned(true);
      setStep("agreement");
      setStrokes([]);
      setAgreed(false);
      return;
    }
    setAgreementSigned(true);
    setSigningOpen(false);
    setDeviceSigningOpen(false);
    setStrokes([]);
    setAgreed(false);
  }

  return (
    <main className={styles.demo}>
      <header className={styles.demoBar}>
        <div>
          <span className={styles.demoMark}>SB</span>
          <div>
            <strong>Signing experience</strong>
            <small>Interactive local concept</small>
          </div>
        </div>
        <div className={styles.surfaceSwitcher} aria-label="Preview surface">
          <button
            className={surface === "app" ? styles.selected : ""}
            onClick={() => setSurface("app")}
          >
            ServiceBuddy app
          </button>
          <button
            className={surface === "portal" ? styles.selected : ""}
            onClick={() => setSurface("portal")}
          >
            Customer portal
          </button>
        </div>
        <button className={styles.reset} onClick={reset}>
          <RotateCcw size={15} /> Reset demo
        </button>
      </header>

      <div className={styles.previewFrame}>
        {surface === "app" ? (
          <AppPreview
            sent={sent}
            quoteSigned={quoteSigned}
            agreementSigned={agreementSigned}
            deviceSigningOpen={deviceSigningOpen}
            step={step}
            strokes={strokes}
            agreed={agreed}
            onOpenMethods={() => setMethodOpen(true)}
            onOpenPortal={() => openPortal()}
            onCloseDeviceSigning={() => setDeviceSigningOpen(false)}
            onStrokesChange={setStrokes}
            onAgreedChange={setAgreed}
            onComplete={completeSignature}
          />
        ) : (
          <PortalPreview
            signingOpen={signingOpen}
            step={step}
            quoteSigned={quoteSigned}
            agreementSigned={agreementSigned}
            strokes={strokes}
            agreed={agreed}
            onOpenSigning={() => setSigningOpen(true)}
            onCloseSigning={() => setSigningOpen(false)}
            onStrokesChange={setStrokes}
            onAgreedChange={setAgreed}
            onComplete={completeSignature}
          />
        )}
      </div>

      {methodOpen && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            className={styles.methodModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="method-title"
          >
            <header>
              <div>
                <span>Customer signature</span>
                <h2 id="method-title">How will Taylor sign?</h2>
                <p>
                  Every method returns to the same signing status and document
                  history.
                </p>
              </div>
              <button
                aria-label="Close signature options"
                onClick={() => setMethodOpen(false)}
              >
                <X size={19} />
              </button>
            </header>
            <div className={styles.methodChoices}>
              <button
                onClick={() => {
                  setSent(true);
                  setMethodOpen(false);
                }}
              >
                <Mail size={21} />
                <strong>Send signing link</strong>
                <span>Customer signs from their own phone or computer.</span>
                <ChevronRight size={17} />
              </button>
              <button
                className={styles.primaryChoice}
                onClick={() => {
                  setSurface("app");
                  setStep(quoteSigned ? "agreement" : "quote");
                  setDeviceSigningOpen(true);
                  setSigningOpen(false);
                  setMethodOpen(false);
                  setStrokes([]);
                  setAgreed(false);
                }}
              >
                <Tablet size={21} />
                <strong>Sign on this device</strong>
                <span>
                  Enter a protected signing screen inside ServiceBuddy.
                </span>
                <ChevronRight size={17} />
              </button>
              <button>
                <PenLine size={21} />
                <strong>Record paper signature</strong>
                <span>Upload the signed copy and record who signed it.</span>
                <ChevronRight size={17} />
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function AppPreview({
  sent,
  quoteSigned,
  agreementSigned,
  deviceSigningOpen,
  step,
  strokes,
  agreed,
  onOpenMethods,
  onOpenPortal,
  onCloseDeviceSigning,
  onStrokesChange,
  onAgreedChange,
  onComplete,
}: {
  sent: boolean;
  quoteSigned: boolean;
  agreementSigned: boolean;
  deviceSigningOpen: boolean;
  step: SigningStep;
  strokes: SignatureStroke[];
  agreed: boolean;
  onOpenMethods: () => void;
  onOpenPortal: () => void;
  onCloseDeviceSigning: () => void;
  onStrokesChange: (value: SignatureStroke[]) => void;
  onAgreedChange: (value: boolean) => void;
  onComplete: () => void;
}) {
  return (
    <div className={styles.appSurface}>
      <aside className={styles.appSidebar}>
        <div className={styles.appBrand}>
          <img src="/images/logo.png" alt="Premium Remodel" />
        </div>
        <button className={styles.businessSwitcher}>
          <span>PR</span>
          <strong>Premium Remodel</strong>
          <ChevronRight size={14} />
        </button>
        <small className={styles.navLabel}>WORKSPACE</small>
        <nav>
          {appNavigation.map(([Icon, label]) => (
            <button
              key={label}
              className={label === "Quotes" ? styles.activeNav : ""}
            >
              <Icon size={17} /> {label}
            </button>
          ))}
        </nav>
        <div className={styles.appUser}>
          <span>AM</span>
          <div>
            <strong>Alex Morgan</strong>
            <small>Administrator</small>
          </div>
          <MoreHorizontal size={17} />
        </div>
      </aside>

      <section className={styles.appMain}>
        <header className={styles.appTopbar}>
          <div>
            <Menu size={18} />
            <span>Premium Remodel</span>
            <ChevronRight size={13} />
            <strong>Quotes</strong>
          </div>
          <div>
            <MessageSquareText size={17} />
            <span className={styles.avatar}>AM</span>
          </div>
        </header>
        <div className={styles.appContent}>
          <button className={styles.backLink}>
            <ArrowLeft size={15} /> Back to quotes
          </button>
          <div className={styles.quoteHeading}>
            <div>
              <span>QUOTE #141</span>
              <h1>New Vanity</h1>
              <p>Taylor Reed · 1214 Chery Street, Raleigh, NC</p>
            </div>
            <div className={styles.headingActions}>
              <span className={styles.sentBadge}>
                {sent ? "Sent" : "Draft"}
              </span>
              <button>
                <Download size={15} /> Download PDF
              </button>
            </div>
          </div>

          <nav className={styles.workflowSteps} aria-label="Quote workflow">
            {[
              ["1", "Quote & pricing", true],
              ["2", "Agreement details", true],
              ["3", "Send & complete", false],
              ["4", "Create project", false],
            ].map(([number, label, done]) => (
              <button
                key={String(label)}
                className={
                  label === "Send & complete" ? styles.currentStep : ""
                }
              >
                <span>{done ? <Check size={12} /> : number}</span>
                <strong>{label}</strong>
              </button>
            ))}
          </nav>

          <section className={styles.completionSection}>
            <header className={styles.sectionHeading}>
              <div>
                <span>STEP 3</span>
                <h2>Send & complete</h2>
                <p>
                  Send the documents, collect signatures, and track what happens
                  next.
                </p>
              </div>
              {!agreementSigned && (
                <button
                  className={styles.primaryButton}
                  onClick={onOpenMethods}
                >
                  <FileSignature size={16} /> Signature options
                </button>
              )}
            </header>

            <div className={styles.deliveryStrip}>
              <div>
                <Mail size={17} />
                <span>
                  <small>Email delivery</small>
                  <strong>
                    {sent ? "Sent to taylor@example.com" : "Ready to send"}
                  </strong>
                </span>
              </div>
              <div>
                <Link2 size={17} />
                <span>
                  <small>Customer portal</small>
                  <strong>
                    {sent ? "Private link active" : "Created when sent"}
                  </strong>
                </span>
              </div>
              <button onClick={onOpenPortal}>
                <ExternalLink size={15} /> Open portal
              </button>
            </div>

            <div className={styles.statusList}>
              <StatusRow
                number="1"
                complete={quoteSigned}
                title="Quote accepted and signed"
                detail={
                  quoteSigned
                    ? "Signed by Taylor Reed · Today, 10:42 AM"
                    : sent
                      ? "Viewed by Taylor · waiting for signature"
                      : "Send the quote to begin"
                }
                action={
                  !quoteSigned ? "Open signing options" : "View signed quote"
                }
                onAction={quoteSigned ? undefined : onOpenMethods}
              />
              <StatusRow
                number="2"
                complete={agreementSigned}
                title="Service agreement signed"
                detail={
                  agreementSigned
                    ? "Signed by Taylor Reed and Alex Morgan"
                    : quoteSigned
                      ? "Agreement is ready for Taylor"
                      : "Starts immediately after quote acceptance"
                }
                action={agreementSigned ? "View signed agreement" : undefined}
              />
              <StatusRow
                number="3"
                complete={false}
                title="Deposit received"
                detail={
                  agreementSigned
                    ? "$9,875 deposit remaining"
                    : "Available after agreement signature"
                }
                action={agreementSigned ? "Payment options" : undefined}
              />
            </div>

            <div className={styles.auditLine}>
              <ShieldCheck size={18} />
              <div>
                <strong>Signing history stays with the quote</strong>
                <span>
                  Delivery, viewing, signatures, document versions, and evidence
                  are recorded in one place.
                </span>
              </div>
            </div>
          </section>
        </div>
      </section>
      {deviceSigningOpen && (
        <DeviceSigningOverlay
          step={step}
          strokes={strokes}
          agreed={agreed}
          onClose={onCloseDeviceSigning}
          onStrokesChange={onStrokesChange}
          onAgreedChange={onAgreedChange}
          onComplete={onComplete}
        />
      )}
    </div>
  );
}

function DeviceSigningOverlay({
  step,
  strokes,
  agreed,
  onClose,
  onStrokesChange,
  onAgreedChange,
  onComplete,
}: {
  step: SigningStep;
  strokes: SignatureStroke[];
  agreed: boolean;
  onClose: () => void;
  onStrokesChange: (value: SignatureStroke[]) => void;
  onAgreedChange: (value: boolean) => void;
  onComplete: () => void;
}) {
  const agreement = step === "agreement";
  return (
    <section className={styles.deviceSigning} aria-label="On-device signing">
      <header className={styles.deviceHeader}>
        <div>
          <span className={styles.deviceSb}>SB</span>
          <div>
            <strong>On-device signing</strong>
            <small>Protected customer handoff mode</small>
          </div>
        </div>
        <div>
          <span className={styles.handoffBadge}>
            <ShieldCheck size={14} /> Staff workspace hidden
          </span>
          <button onClick={onClose}>
            <X size={16} /> Exit customer signing
          </button>
        </div>
      </header>
      <div className={styles.deviceBody}>
        <div className={styles.deviceDocumentViewport}>
          <div className={styles.deviceIntro}>
            <span>{agreement ? "DOCUMENT 2 OF 2" : "DOCUMENT 1 OF 2"}</span>
            <strong>Hand this device to Taylor Reed</strong>
            <small>
              The customer can review and sign without seeing the workspace.
            </small>
          </div>
          {agreement ? (
            <div className={styles.deviceMsaDocument}>
              <MsaDocument
                agreement={demoMsaAgreement}
                highlightOwnerSignature
              />
            </div>
          ) : (
            <article className={styles.deviceDocument}>
              <header>
                <span>PREMIUM REMODEL</span>
                <img src="/images/logo.png" alt="Premium Remodel" />
              </header>
              <div className={styles.deviceDocumentTitle}>
                <h1>NEW VANITY</h1>
                <p>Quote #141 · Revised November 1, 2026</p>
              </div>
              <div className={styles.deviceInvestment}>
                <span>TOTAL PROJECT INVESTMENT</span>
                <strong>$19,750.00</strong>
              </div>
              <section className={styles.deviceScope}>
                <h2>SCOPE OF WORK</h2>
                {scope.map(([title, detail]) => (
                  <p key={title}>
                    <strong>{title}</strong>
                    <span>{detail}</span>
                  </p>
                ))}
              </section>
              <section className={styles.deviceTarget}>
                <span className={styles.signingHere}>
                  <PenLine size={11} /> Signing here
                </span>
                <h2>CUSTOMER ACCEPTANCE</h2>
                <div>
                  <span>
                    <small>PRINT NAME</small>
                    <strong>Taylor Reed</strong>
                  </span>
                  <span>
                    <small>DATE</small>
                    <strong>November 1, 2026</strong>
                  </span>
                </div>
                <p>Signature will be placed in this block when completed.</p>
              </section>
            </article>
          )}
        </div>
        <aside className={styles.deviceControls}>
          <header>
            <span>{agreement ? "2 OF 2" : "1 OF 2"}</span>
            <h2>{agreement ? "Sign service agreement" : "Accept quote"}</h2>
            <p>{agreement ? "Final document" : "Service agreement follows"}</p>
          </header>
          <div className={styles.deviceProgress}>
            <span className={styles.doneSegment} />
            <span className={agreement ? styles.doneSegment : ""} />
          </div>
          <label className={styles.signerField}>
            Print name
            <input value="Taylor Reed" readOnly />
          </label>
          <div className={styles.signatureField}>
            <label>Signature</label>
            <MsaSignaturePad key={step} onChange={onStrokesChange} />
          </div>
          <label className={styles.consentField}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => onAgreedChange(event.target.checked)}
            />
            <span>
              I reviewed this {agreement ? "agreement" : "quote"} and intend my
              electronic signature to be legally binding.
            </span>
          </label>
          <button
            className={styles.signNow}
            disabled={!strokes.length || !agreed}
            onClick={onComplete}
          >
            {agreement ? "Sign and finish" : "Sign and continue"}
            <ChevronRight size={16} />
          </button>
          <footer>
            <ShieldCheck size={15} /> Signature evidence and document version
            will be recorded.
          </footer>
        </aside>
      </div>
    </section>
  );
}

function StatusRow({
  number,
  complete,
  title,
  detail,
  action,
  onAction,
}: {
  number: string;
  complete: boolean;
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className={styles.statusRow}>
      <span className={complete ? styles.completeDot : ""}>
        {complete ? <Check size={14} /> : number}
      </span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      {action && (
        <button onClick={onAction}>
          {action}
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}

function PortalPreview({
  signingOpen,
  step,
  quoteSigned,
  agreementSigned,
  strokes,
  agreed,
  onOpenSigning,
  onCloseSigning,
  onStrokesChange,
  onAgreedChange,
  onComplete,
}: {
  signingOpen: boolean;
  step: SigningStep;
  quoteSigned: boolean;
  agreementSigned: boolean;
  strokes: SignatureStroke[];
  agreed: boolean;
  onOpenSigning: () => void;
  onCloseSigning: () => void;
  onStrokesChange: (value: SignatureStroke[]) => void;
  onAgreedChange: (value: boolean) => void;
  onComplete: () => void;
}) {
  const needsSignature = !quoteSigned || !agreementSigned;
  return (
    <div
      className={`${styles.portalSurface} ${signingOpen ? styles.panelOpen : ""}`}
    >
      <aside className={styles.portalSidebar}>
        <img src="/images/logo.png" alt="Premium Remodel" />
        <a>
          <Inbox size={18} /> Requests
        </a>
        <a className={styles.portalActive}>
          <FileText size={18} /> Quotes
        </a>
        <a>
          <FileCheck2 size={18} /> Agreement
        </a>
        <a>
          <ReceiptText size={18} /> Invoices
        </a>
        <a>
          <WalletCards size={18} /> Wallet
        </a>
        <div>
          <small>Need help with your quote?</small>
          <strong>(919) 434-4860</strong>
          <span>contact@premiumremodel.com</span>
        </div>
      </aside>

      <section className={styles.portalMain}>
        <header className={styles.portalActionBar}>
          <div>
            <span
              className={
                needsSignature ? styles.actionNeeded : styles.actionComplete
              }
            >
              {needsSignature ? (
                <Clock3 size={14} />
              ) : (
                <CheckCircle2 size={14} />
              )}
              {needsSignature ? "Your signature is needed" : "Signing complete"}
            </span>
            <strong>
              {!quoteSigned
                ? "Quote #141"
                : !agreementSigned
                  ? "Service agreement"
                  : "Documents complete"}
            </strong>
            <small>
              {!quoteSigned
                ? "$19,750 total"
                : !agreementSigned
                  ? "2 of 2 documents"
                  : "Signed today"}
            </small>
          </div>
          <div>
            <button className={styles.portalDownload}>
              <Download size={16} /> Download PDF
            </button>
            {needsSignature && (
              <button className={styles.reviewButton} onClick={onOpenSigning}>
                <PenLine size={16} /> Review &amp; sign
              </button>
            )}
          </div>
        </header>

        <div className={styles.portalDocumentArea}>
          <article className={styles.quoteDocument}>
            <header className={styles.documentBrand}>
              <span>PREMIUM REMODEL&nbsp; | &nbsp;PROJECT QUOTE</span>
              <img src="/images/logo.png" alt="Premium Remodel" />
            </header>
            <div className={styles.documentTitle}>
              <h1>NEW VANITY</h1>
              <p>Quote #141&nbsp; | &nbsp;Revised November 1, 2026</p>
            </div>
            <div className={styles.customerGrid}>
              <div>
                <small>PREPARED FOR</small>
                <strong>Taylor Reed</strong>
                <span>(919) 555-0148</span>
                <em>Prepared by Alex Morgan</em>
              </div>
              <div>
                <small>PROJECT ADDRESS</small>
                <strong>1214 Chery Street</strong>
                <span>Raleigh, NC 27511</span>
              </div>
            </div>
            <div className={styles.investmentBar}>
              <span>TOTAL PROJECT INVESTMENT</span>
              <strong>$19,750.00</strong>
            </div>
            <section className={styles.documentScope}>
              <h2>SCOPE OF WORK</h2>
              {scope.map(([title, detail]) => (
                <div key={title}>
                  <strong>{title}</strong>
                  <p>{detail}</p>
                </div>
              ))}
              <footer>
                <span>TOTAL PROJECT INVESTMENT</span>
                <strong>$19,750.00</strong>
              </footer>
            </section>
            <section className={styles.documentNotes}>
              <h2>Notes</h2>
              <p>
                Work outside the defined scope must be approved in writing
                before execution.
              </p>
            </section>
            <section
              className={`${styles.documentAcceptance} ${
                signingOpen && step === "quote" ? styles.signatureTarget : ""
              }`}
              data-sign-target={signingOpen && step === "quote"}
            >
              {signingOpen && step === "quote" && (
                <span className={styles.signingHere}>
                  <PenLine size={11} /> Signing here
                </span>
              )}
              <h2>CUSTOMER ACCEPTANCE</h2>
              <div>
                <span>
                  <small>PRINT NAME</small>
                  <strong>
                    {quoteSigned ? "Taylor Reed" : "Pending signature"}
                  </strong>
                </span>
                <span>
                  <small>DATE</small>
                  <strong>{quoteSigned ? "November 1, 2026" : "—"}</strong>
                </span>
              </div>
              <small>SIGNATURE</small>
              <div className={styles.documentSignature}>
                {quoteSigned ? (
                  <MsaSignatureImage
                    strokes={sampleSignature}
                    label="Taylor Reed signature"
                  />
                ) : (
                  <span>Signature will appear here after signing</span>
                )}
              </div>
            </section>
            {(quoteSigned || step === "agreement") && (
              <section
                className={`${styles.agreementSignatureBlock} ${
                  signingOpen && step === "agreement"
                    ? styles.signatureTarget
                    : ""
                }`}
                data-sign-target={signingOpen && step === "agreement"}
              >
                {signingOpen && step === "agreement" && (
                  <span className={styles.signingHere}>
                    <PenLine size={11} /> Signing here
                  </span>
                )}
                <h2>SERVICE AGREEMENT SIGNATURES</h2>
                <div>
                  <span>
                    <small>CONTRACTOR</small>
                    <strong>Alex Morgan · CEO &amp; Owner</strong>
                    <em>Signed November 1, 2026</em>
                  </span>
                  <span>
                    <small>OWNER</small>
                    <strong>
                      {agreementSigned ? "Taylor Reed" : "Pending signature"}
                    </strong>
                    <em>
                      {agreementSigned
                        ? "Signed November 1, 2026"
                        : "Signature will appear here"}
                    </em>
                  </span>
                </div>
              </section>
            )}
          </article>
        </div>

        {needsSignature && !signingOpen && (
          <button className={styles.mobileSignBar} onClick={onOpenSigning}>
            <span>
              <small>Signature needed</small>
              <strong>
                {!quoteSigned ? "Quote #141" : "Service agreement"}
              </strong>
            </span>
            Review &amp; sign <ChevronRight size={16} />
          </button>
        )}
      </section>

      {signingOpen && (
        <aside className={styles.signingPanel} aria-label="Signing panel">
          <header>
            <div>
              <span>{step === "quote" ? "1 of 2" : "2 of 2"}</span>
              <h2>
                {step === "quote" ? "Accept quote" : "Sign service agreement"}
              </h2>
            </div>
            <button aria-label="Close signing panel" onClick={onCloseSigning}>
              <X size={19} />
            </button>
          </header>
          <div className={styles.signingProgress}>
            <span className={styles.doneSegment} />
            <span className={step === "agreement" ? styles.doneSegment : ""} />
          </div>
          <div className={styles.signingSummary}>
            <FileSignature size={19} />
            <div>
              <strong>
                {step === "quote"
                  ? "New Vanity · Quote #141"
                  : "Master Services Agreement"}
              </strong>
              <span>
                {step === "quote"
                  ? "$19,750.00 · 3 scope items"
                  : "$19,750 contract price · 4 payment checkpoints"}
              </span>
            </div>
          </div>
          <p className={styles.reviewCopy}>
            {step === "quote"
              ? "Confirm the scope and total shown in the document. Your signature will be added to the Customer acceptance block."
              : "Confirm the payment schedule, project details, and agreement terms. Your signature will be added beside the contractor signature."}
          </p>
          <button
            className={styles.jumpButton}
            onClick={() =>
              document
                .querySelector('[data-sign-target="true"]')
                ?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
          >
            <ExternalLink size={15} /> View signature location in document
          </button>
          <label className={styles.signerField}>
            Print name
            <input value="Taylor Reed" readOnly />
          </label>
          <div className={styles.signatureField}>
            <label>Signature</label>
            <MsaSignaturePad onChange={onStrokesChange} />
          </div>
          <label className={styles.consentField}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => onAgreedChange(event.target.checked)}
            />
            <span>
              I reviewed this {step === "quote" ? "quote" : "agreement"} and
              intend my electronic signature to be legally binding.
            </span>
          </label>
          <button
            className={styles.signNow}
            disabled={!strokes.length || !agreed}
            onClick={onComplete}
          >
            {step === "quote" ? "Sign and continue" : "Sign agreement"}
            <ChevronRight size={16} />
          </button>
          <footer>
            <ShieldCheck size={15} /> Secure electronic signature · Document
            version recorded
          </footer>
        </aside>
      )}
    </div>
  );
}

const sampleSignature: SignatureStroke[] = [
  [
    [0.05, 0.75],
    [0.1, 0.25],
    [0.14, 0.7],
    [0.2, 0.48],
    [0.24, 0.68],
    [0.32, 0.35],
    [0.38, 0.62],
    [0.48, 0.5],
    [0.58, 0.58],
    [0.72, 0.52],
  ],
];
