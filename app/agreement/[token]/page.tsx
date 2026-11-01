import { notFound } from "next/navigation";
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
  const complete = session.status === "completed" || session.signer.status === "signed";

  return (
    <main className={styles.shell}>
      <header className={styles.brand}>
        <img src={session.business.logoUrl} alt={`${session.business.name} logo`} />
        <span>Secure agreement</span>
      </header>
      <article className={styles.document}>
        <div className={styles.heading}>
          <span>{session.signer.roleLabel}</span>
          <h1>{template.name}</h1>
          {template.description && <p>{template.description}</p>}
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
        {complete ? (
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
                    <strong>
                      {session.business.paymentInstructions.checkPayee}
                    </strong>
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
            <p>This signing link will become active after the prior signer finishes.</p>
          </section>
        ) : (
          <AgreementSigningForm
            token={token}
            signerName={session.signer.name}
            fields={assignedFields}
          />
        )}
      </article>
    </main>
  );
}
