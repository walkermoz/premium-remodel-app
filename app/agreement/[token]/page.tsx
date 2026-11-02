import { notFound } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, X } from "lucide-react";
import type {
  AgreementDocumentContent,
  AgreementField,
} from "@/lib/agreement-template-schema";
import { readAgreementSigningSession } from "@/lib/agreement-packets";
import AgreementSigningForm from "./agreement-signing-form";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function AgreementSigningPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await readAgreementSigningSession(token).catch(() => null);
  if (!session) notFound();
  const onsite = session.deliveryMode === "onsite";
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
        <h2>Signature saved</h2>
        <p>
          {session.status === "completed"
            ? "All required signers have completed this agreement."
            : "Your signature is complete. The agreement is waiting for the next signer."}
        </p>
        {session.status === "completed" && (
          <a
            className={styles.download}
            href={`/api/agreement-sign/${encodeURIComponent(token)}/document?download=1`}
          >
            Download signed agreement
          </a>
        )}
      </section>
      {session.status === "completed" &&
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
      <h2>Waiting for an earlier signer</h2>
      <p>
        This signing link will become active after the prior signer finishes.
      </p>
    </section>
  ) : (
    <AgreementSigningForm
      token={token}
      signerName={session.signer.name}
      fields={assignedFields}
      onsite={onsite}
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
              <strong>On-device signing</strong>
              <small>
                {session.business.name} · Protected customer handoff
              </small>
            </span>
          )}
        </div>
        {onsite ? (
          <div>
            <span className={styles.handoffBadge}>
              <ShieldCheck size={15} /> Staff workspace hidden
            </span>
            <Link href="/?view=Quotes">
              <X size={16} /> Exit customer signing
            </Link>
          </div>
        ) : (
          <span>Secure agreement</span>
        )}
      </header>
      <div className={onsite ? styles.onsiteBody : undefined}>
        <article className={styles.document}>
          <div className={styles.heading}>
            <span>{session.signer.roleLabel}</span>
            <h1>{template.name}</h1>
            {template.description && <p>{template.description}</p>}
            {!onsite && !complete && !session.blocked && (
              <a className={styles.nextRequired} href="#required-signing">
                Next required step
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
              <h2>Agreement details</h2>
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
          <ol className={styles.progress} aria-label="Signing order">
            {session.signers.map((signer) => (
              <li key={`${signer.signingOrder}-${signer.roleLabel}`}>
                <span>{signer.signingOrder}</span>
                <strong>{signer.roleLabel}</strong>
                <small>{signer.status}</small>
              </li>
            ))}
          </ol>
          {!onsite && (
            <section
              id="required-signing"
              className={styles.requiredSigning}
              aria-label="Required signing section"
            >
              {signingState}
            </section>
          )}
        </article>
        {onsite && (
          <aside className={styles.onsiteControls} aria-label="Signing panel">
            <header>
              <span>
                SIGNER {signerIndex + 1} OF {session.signers.length}
              </span>
              <h2>{session.signer.roleLabel}</h2>
              <p>
                {complete
                  ? "Signing complete"
                  : "Review and sign this agreement"}
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
              <ShieldCheck size={15} /> Signature evidence and this template
              version are recorded with the agreement.
            </footer>
          </aside>
        )}
      </div>
    </main>
  );
}
