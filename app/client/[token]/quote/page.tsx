import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download, Mail, MapPin } from "lucide-react";
import { readClientQuote } from "@/lib/client-quote";
import { changeOrderTerms, paymentTerms } from "@/lib/quote-pdf";
import styles from "./quote.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your quote | Premium Remodel",
  description: "A private Premium Remodel quote.",
  robots: { index: false, follow: false, noarchive: true },
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function date(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? ""
    : new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(parsed);
}

export default async function ClientQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await readClientQuote(token);
  if (!view) notFound();

  const { quote, items, total, approved } = view;
  const sections = new Map<string, { name: string; items: typeof items }>();
  for (const item of items) {
    const name = item.sectionName?.trim() || quote.category || "Scope of work";
    const key = item.sectionId || name;
    if (!sections.has(key)) sections.set(key, { name, items: [] });
    sections.get(key)!.items.push(item);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <img src="/images/logo.png" alt="Premium Remodel" />
          <span>Client quote</span>
        </div>
      </header>
      <main className={styles.layout}>
        <article className={styles.document}>
          <div className={styles.heading}>
            <div className={styles.kicker}>
              PREMIUM REMODEL · QUOTE{" "}
              {quote.quoteNumber ? `#${quote.quoteNumber}` : ""}
            </div>
            <div className={styles.headingRow}>
              <h1>{quote.name}</h1>
              <span className={approved ? styles.approved : styles.awaiting}>
                {approved ? "Approved" : "Awaiting response"}
              </span>
            </div>
            {quote.address && (
              <p className={styles.address}>
                <MapPin size={16} aria-hidden="true" /> {quote.address}
              </p>
            )}
            <dl className={styles.meta}>
              <div>
                <dt>Prepared for</dt>
                <dd>{quote.client || "Client"}</dd>
              </div>
              <div>
                <dt>{approved ? "Approved" : "Sent"}</dt>
                <dd>
                  {date(approved ? quote.quoteAcceptedAt : quote.quoteSentAt) ||
                    "Date unavailable"}
                </dd>
              </div>
            </dl>
          </div>

          <section className={styles.scope} aria-labelledby="scope-title">
            <div className={styles.sectionHeading}>
              <h2 id="scope-title">Scope of work</h2>
              <span>
                {items.length} {items.length === 1 ? "item" : "items"}
              </span>
            </div>
            {sections.size ? (
              [...sections.entries()].map(([key, section]) => (
                <div className={styles.group} key={key}>
                  <h3>{section.name}</h3>
                  {section.items.map((item) => (
                    <div className={styles.item} key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        {item.details && <p>{item.details}</p>}
                      </div>
                      <span>{money(item.estimate)}</span>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <p className={styles.empty}>
                Scope details have not been added yet.
              </p>
            )}
            <div className={styles.total}>
              <span>Total project investment</span>
              <strong>{money(total)}</strong>
            </div>
          </section>

          <section className={styles.terms} aria-labelledby="terms-title">
            <h2 id="terms-title">Notes & payment</h2>
            {quote.quoteNotes && (
              <p className={styles.quoteNotes}>{quote.quoteNotes}</p>
            )}
            <p>{changeOrderTerms}</p>
            <p>{paymentTerms}</p>
          </section>
        </article>

        <aside className={styles.actions}>
          <p className={styles.actionsEyebrow}>YOUR QUOTE</p>
          <strong>{money(total)}</strong>
          <p>
            {approved
              ? "Thank you for approving this quote."
              : "Review the scope and reply to your quote email when you’re ready to move forward or need a change."}
          </p>
          <a
            className={styles.primary}
            href={`/api/client-quote/${encodeURIComponent(token)}/pdf`}
          >
            <Download size={17} aria-hidden="true" /> Download PDF
          </a>
          <a
            className={styles.secondary}
            href={`mailto:contact@premiumremodel.com?subject=${encodeURIComponent(`Question about Premium Remodel Quote ${quote.quoteNumber ? `#${quote.quoteNumber}` : quote.name}`)}`}
          >
            <Mail size={17} aria-hidden="true" /> Ask a question
          </a>
        </aside>
      </main>
      <footer className={styles.footer}>
        <span>Premium Remodel</span>
        <a href="mailto:contact@premiumremodel.com">
          contact@premiumremodel.com
        </a>
      </footer>
    </div>
  );
}
