import { notFound } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, X } from "lucide-react";
import type {
  AgreementDocumentContent,
  AgreementField,
} from "@/lib/agreement-template-schema";
import { readAgreementSigningSession } from "@/lib/agreement-packets";
import { ThemeToggle } from "@/components/theme-controls";
import AgreementSigningForm from "./agreement-signing-form";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function AgreementSigningPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { token } = await params;
  const session = await readAgreementSigningSession(token).catch(() => null);
  if (!session) notFound();
  const onsite = session.deliveryMode === "onsite";
  const returnTo = (await searchParams).returnTo;
  const portalReturn =
    returnTo &&
    /^\/client\/[a-zA-Z0-9._-]+\/quote\?view=paperwork$/.test(returnTo)
      ? returnTo
      : null;
  const template = session.template as {
    name: string;
    description: string;
    content: AgreementDocumentContent | null;
    fields: AgreementField[];
    sourceType: string;
  };
  const assignedFields = (template.fields || []).filter(
    (field) => field.signerRoleId === session.signer.roleId,
  );
  const boundFields = (template.fields || []).filter(
    (field) =>
      !field.signerRoleId &&
      Object.prototype.hasOwnProperty.call(session.values, field.id),
  );
  const complete =
    session.status === "completed" || session.signer.status === "signed";
  const signerIndex = Math.max(
    0,
    session.signers.findIndex(
      (signer) => signer.roleLabel === session.signer.roleLabel,
    ),
  );
  const signingState = complete ? (
    <>
      <section className={styles.complete}>
        <h2>
          {session.requiresSignature ? "Signature saved" : "Form submitted"}
        </h2>
        <p>
          {session.status === "completed"
            ? "This document is complete."
            : "Your part is complete. Waiting for another recipient."}
        </p>
        {session.status === "completed" && (
          <a
            className={`button primary ${styles.download}`}
            href={`/api/agreement-sign/${encodeURIComponent(token)}/document?download=1`}
          >
            Download completed document
          </a>
        )}
      </section>
      {session.status === "completed" &&
        !session.template.paperworkManaged &&
        session.business.paymentInstructions.checkPayee && (
          <section className={styles.paymentInstructions}>
            <h2>Pay by check</h2>
            <p>
              Make checks payable to{" "}
              <strong>{session.business.paymentInstructions.checkPayee}</strong>
              .
            </p>
            {session.business.paymentInstructions.checkMailingAddress && (
              <p>
                Mail or deliver payment to{" "}
                {session.business.paymentInstructions.checkMailingAddress}.
              </p>
            )}
          </section>
        )}
    </>
  ) : session.blocked ? (
    <section className={styles.complete}>
      <h2>
        {session.requiresSignature
          ? "Waiting for an earlier signer"
          : "Waiting for another recipient"}
      </h2>
      <p>
        {session.requiresSignature
          ? "This signing link will become active after the prior signer finishes."
          : "This form will become available after the previous recipient finishes."}
      </p>
    </section>
  ) : (
    <AgreementSigningForm
      token={token}
      signerName={session.signer.name}
      fields={assignedFields}
      onsite={onsite}
      requiresSignature={session.requiresSignature}
    />
  );

  return (
    <main className={`${styles.shell} ${onsite ? styles.onsiteShell : ""}`}>
      <header className={onsite ? styles.onsiteHeader : styles.brand}>
        <div>
          {session.business.logoUrl ? (
            <img
              src={session.business.logoUrl}
              alt={`${session.business.name} logo`}
            />
          ) : (
            <span className={styles.brandMark}>SB</span>
          )}
          {onsite && (
            <span className={styles.onsiteTitle}>
              <strong>
                {session.requiresSignature ? "Review & sign" : "Complete form"}
              </strong>
              <small>{template.name}</small>
            </span>
          )}
        </div>
        {onsite ? (
          <div>
            <span className={styles.handoffBadge}>
              <ShieldCheck size={15} /> Staff workspace hidden
            </span>
            <ThemeToggle />
            <Link
              className="button secondary"
              aria-label={
                session.requiresSignature
                  ? "Exit customer signing"
                  : "Exit form"
              }
              href={
                session.quoteId
                  ? `/?view=Quotes&project=${session.quoteId}&tab=paperwork`
                  : "/?view=Quotes"
              }
            >
              <X size={16} />
              <span className={styles.exitLabel}>
                {session.requiresSignature
                  ? "Exit customer signing"
                  : "Exit form"}
              </span>
            </Link>
          </div>
        ) : (
          <span>
            {session.requiresSignature ? "Secure agreement" : "Secure form"}
          </span>
        )}
      </header>
      {!onsite && portalReturn && (
        <Link className={styles.download} href={portalReturn}>
          Back to your paperwork
        </Link>
      )}
      <div className={onsite ? styles.onsiteBody : undefined}>
        <article className={styles.document}>
          <div className={styles.heading}>
            <span>{session.signer.roleLabel}</span>
            <h1>{template.name}</h1>
            {template.description && <p>{template.description}</p>}
            {!onsite && !complete && !session.blocked && (
              <a
                className={`button primary ${styles.nextRequired}`}
                href="#required-signing"
              >
                Complete this document
              </a>
            )}
          </div>
          {template.sourceType === "uploaded_pdf" ? (
            <iframe
              className={styles.pdfFrame}
              src={`/api/agreement-sign/${encodeURIComponent(token)}/document`}
              title={template.name}
            />
          ) : template.content ? (
            <section className={styles.content}>
              {template.content.blocks.map((block) =>
                block.type === "heading" ? (
                  <h2 key={block.id}>{block.text}</h2>
                ) : block.type === "divider" ? (
                  <hr key={block.id} />
                ) : block.type === "page_break" ? null : (
                  <p key={block.id}>{block.text}</p>
                ),
              )}
            </section>
          ) : null}
          {boundFields.length > 0 && (
            <section className={styles.boundFields}>
              <h2>
                {session.requiresSignature
                  ? "Agreement details"
                  : "Form details"}
              </h2>
              <dl>
                {boundFields.map((field) => (
                  <div key={field.id}>
                    <dt>{field.label}</dt>
                    <dd>
                      {typeof session.values[field.id] === "boolean"
                        ? session.values[field.id]
                          ? "Yes"
                          : "No"
                        : String(session.values[field.id] ?? "")}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <ol
            className={styles.progress}
            aria-label={
              session.requiresSignature ? "Signing order" : "Completion order"
            }
          >
            {session.signers.map((signer) => (
              <li key={`${signer.signingOrder}-${signer.roleLabel}`}>
                <span>{signer.signingOrder}</span>
                <strong>{signer.roleLabel}</strong>
                <small>
                  {signer.status === "signed"
                    ? session.requiresSignature
                      ? "Signed"
                      : "Completed"
                    : signer.status}
                </small>
              </li>
            ))}
          </ol>
          {!onsite && (
            <section
              id="required-signing"
              className={styles.requiredSigning}
              aria-label={
                session.requiresSignature
                  ? "Required signing section"
                  : "Required form section"
              }
            >
              {signingState}
            </section>
          )}
        </article>
        {onsite && (
          <aside
            className={styles.onsiteControls}
            aria-label={
              session.requiresSignature
                ? "Signing panel"
                : "Form completion panel"
            }
          >
            <header>
              <span>
                {session.requiresSignature ? "SIGNER" : "RECIPIENT"}{" "}
                {signerIndex + 1} OF {session.signers.length}
              </span>
              <h2>{session.signer.roleLabel}</h2>
              <p>
                {complete
                  ? "Your part is complete"
                  : session.requiresSignature
                    ? "Review and sign this document"
                    : "Review and complete this form"}
              </p>
            </header>
            <div className={styles.onsiteProgress}>
              {session.signers.map((signer, index) => (
                <span
                  key={`${signer.signingOrder}-${signer.roleLabel}`}
                  className={
                    signer.status === "signed" || index <= signerIndex
                      ? styles.progressComplete
                      : ""
                  }
                />
              ))}
            </div>
            {signingState}
            <footer>
              <ShieldCheck size={15} /> Your completion and this document
              version are saved together.
            </footer>
          </aside>
        )}
      </div>
    </main>
  );
}
