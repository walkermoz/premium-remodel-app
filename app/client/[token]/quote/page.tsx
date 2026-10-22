import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  Download,
  FileText,
  Mail,
  Menu,
  Phone,
  Plus,
} from "lucide-react";
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
  const day = value.slice(0, 10);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? new Date(`${day}T00:00:00Z`)
    : new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? ""
    : new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(parsed);
}

function ClientNavigation({
  quoteUrl,
  contactHref,
  className,
}: {
  quoteUrl: string;
  contactHref: string;
  className: string;
}) {
  return (
    <nav className={className} aria-label="Client navigation">
      <a href={quoteUrl} aria-current="page">
        <FileText size={18} aria-hidden="true" /> Quotes
      </a>
      <a href={contactHref}>
        <Mail size={18} aria-hidden="true" /> Contact us
      </a>
      <a
        href="https://www.premiumremodel.com/"
        target="_blank"
        rel="noopener noreferrer"
      >
        <ArrowUpRight size={18} aria-hidden="true" /> Website
      </a>
    </nav>
  );
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
  const number = quote.quoteNumber || quote.id.slice(0, 8).toUpperCase();
  const quoteUrl = `/client/${encodeURIComponent(token)}/quote`;
  const contactHref = `mailto:contact@premiumremodel.com?subject=${encodeURIComponent(`Question about Premium Remodel Quote #${number}`)}`;
  const contactPhone = quote.preparedByPhone || "(919) 413-9782";
  const sectionTotals = new Map<string, number>();
  const sections: Array<{
    key: string;
    name: string;
    items: Array<{ item: (typeof items)[number]; striped: boolean }>;
  }> = [];
  items.forEach((item, index) => {
    const name = item.sectionName?.trim() || quote.category || "General scope";
    const key = item.sectionId?.trim()
      ? `id:${item.sectionId.trim()}`
      : item.sectionName?.trim()
        ? `name:${item.sectionName.trim().toLowerCase()}`
        : "ungrouped";
    sectionTotals.set(key, (sectionTotals.get(key) || 0) + item.estimate);
    if (sections.at(-1)?.key !== key) sections.push({ key, name, items: [] });
    sections.at(-1)!.items.push({ item, striped: index % 2 === 1 });
  });

  return (
    <div className={styles.page}>
      <aside
        className={styles.sidebar}
        aria-label="Premium Remodel client portal"
      >
        <div className={styles.sidebarBrand}>
          <img src="/images/logo.png" alt="Premium Remodel" />
          <span>Client portal</span>
        </div>
        <a
          className={styles.newRequest}
          href="https://www.premiumremodel.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Plus size={18} aria-hidden="true" /> New request
        </a>
        <ClientNavigation
          quoteUrl={quoteUrl}
          contactHref={contactHref}
          className={styles.sidebarNav}
        />
        <div className={styles.sidebarContact}>
          <span>Need help with your quote?</span>
          <a href={`tel:${contactPhone.replace(/[^\d+]/g, "")}`}>
            <Phone size={15} aria-hidden="true" /> {contactPhone}
          </a>
          <a href="mailto:contact@premiumremodel.com">
            <Mail size={15} aria-hidden="true" /> Email us
          </a>
        </div>
        <details className={styles.mobileMenu}>
          <summary>
            <Menu size={18} aria-hidden="true" /> Menu
          </summary>
          <div className={styles.mobileMenuPanel}>
            <a
              className={styles.mobileNewRequest}
              href="https://www.premiumremodel.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Plus size={18} aria-hidden="true" /> New request
            </a>
            <ClientNavigation
              quoteUrl={quoteUrl}
              contactHref={contactHref}
              className={styles.mobileNav}
            />
          </div>
        </details>
      </aside>

      <div className={styles.content}>
        <nav className={styles.toolbar} aria-label="Quote actions">
          <div className={styles.toolbarMeta}>
            <span>Premium Remodel Quote #{number}</span>
            <span className={styles.toolbarStatus}>
              {approved ? "Approved" : "Awaiting response"}
            </span>
          </div>
          <div className={styles.toolbarActions}>
            <a href={contactHref}>
              <Mail size={16} aria-hidden="true" /> Ask a question
            </a>
            <a
              className={styles.download}
              href={`/api/client-quote/${encodeURIComponent(token)}/pdf`}
            >
              <Download size={16} aria-hidden="true" /> Download PDF
            </a>
          </div>
        </nav>

        <main className={styles.document}>
          <div className={styles.masthead}>
            <p>PREMIUM REMODEL&nbsp; | &nbsp;REMODEL QUOTE</p>
            <img src="/images/logo.png" alt="Premium Remodel" />
          </div>

          <header className={styles.titleBlock}>
            <h1>{quote.name}</h1>
            <p>
              Quote #{number} <span aria-hidden="true">|</span> Revised{" "}
              {date(quote.revisedDate || quote.updatedAt)}
            </p>
          </header>

          <section className={styles.parties} aria-label="Quote details">
            <div>
              <h2>Prepared for</h2>
              <p>{quote.client || "Client"}</p>
              {quote.clientPhone && <p>{quote.clientPhone}</p>}
              <small>Prepared by {quote.preparedBy || "Premium Remodel"}</small>
            </div>
            <div>
              <h2>Project address</h2>
              {quote.address ? (
                quote.address
                  .split(",")
                  .map((part) => part.trim())
                  .filter(Boolean)
                  .map((part, index) => <p key={`${index}-${part}`}>{part}</p>)
              ) : (
                <p>Address to be confirmed</p>
              )}
            </div>
          </section>

          <section
            className={styles.investment}
            aria-label="Total project investment"
          >
            <span>Total project investment</span>
            <strong>{money(total)}</strong>
          </section>

          <section className={styles.scope} aria-label="Scope of work">
            <div className={styles.scopeHeader}>
              <h2>Scope of work</h2>
              <span>Line total</span>
            </div>
            {sections.map((section, index) => (
              <div key={`${section.key}-${index}`}>
                <div className={styles.sectionHeader}>
                  <h3>Project&nbsp; | &nbsp;{section.name}</h3>
                  <span>
                    Section total&nbsp;{" "}
                    {money(sectionTotals.get(section.key) || 0)}
                  </span>
                </div>
                {section.items.map(({ item, striped }) => (
                  <div
                    className={`${styles.item} ${striped ? styles.striped : ""}`}
                    key={item.id}
                  >
                    <div>
                      <strong>{item.title}</strong>
                      {item.details && <p>{item.details}</p>}
                    </div>
                    <span>{money(item.estimate)}</span>
                  </div>
                ))}
              </div>
            ))}
            <div className={styles.scopeTotal}>
              <span>Total project investment</span>
              <strong>{money(total)}</strong>
            </div>
          </section>

          <section className={styles.terms} aria-labelledby="terms-title">
            <h2 id="terms-title">Notes &amp; payment</h2>
            {quote.quoteNotes && <p>{quote.quoteNotes}</p>}
            <p>{changeOrderTerms}</p>
            <p>{paymentTerms}</p>
          </section>

          <section
            className={styles.acceptance}
            aria-label="Customer acceptance"
          >
            <h2>Customer acceptance</h2>
            <div>
              <p>Signature: __________________________</p>
              <p>Print name: ______________________</p>
            </div>
            <p>Date: _______________</p>
          </section>

          <footer className={styles.footer}>
            <span>
              premiumremodel.com&nbsp; | &nbsp;
              {quote.preparedBy || "Premium Remodel"}&nbsp; | &nbsp;
              {quote.preparedByPhone || "(919) 413-9782"}
            </span>
            <span>Page 1</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
