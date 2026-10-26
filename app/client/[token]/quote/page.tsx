import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CalendarDays,
  CreditCard,
  Download,
  FileText,
  Inbox,
  Mail,
  Menu,
  Phone,
  Plus,
  ReceiptText,
} from "lucide-react";
import {
  readClientQuoteSource,
  type ClientQuoteView,
} from "@/lib/client-quote";
import {
  createClientWalletFormToken,
  isExpiredClientPortalToken,
  parseClientPortalAccess,
} from "@/lib/client-portal";
import {
  clientQuotesForEmail,
  type ClientEmailQuote,
} from "@/lib/client-access";
import {
  cancellationDeadline,
  easternDate,
  msaPaymentRows,
} from "@/lib/msa-contract";
import { stripeClient } from "@/lib/stripe-payments";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Activity } from "@/lib/types";
import MsaDocument from "@/components/msa-document";
import { savedPaymentMethods } from "@/lib/client-wallet";
import { changeOrderTerms, paymentTerms } from "@/lib/quote-pdf";
import {
  DEFAULT_QUOTE_PROJECT_NAME,
  UNGROUPED_SCOPE_PROJECT_ID,
} from "@/lib/scope-projects";
import ClientNewRequestForm from "./client-new-request-form";
import CustomerAcceptance from "./customer-acceptance";
import MsaAcceptance from "./msa-acceptance";
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

type PortalView =
  | "detail"
  | "requests"
  | "new-request"
  | "quotes"
  | "invoices"
  | "wallet"
  | "contact"
  | "msa";

function ClientNavigation({
  quoteUrl,
  view,
  className,
  hasMsa,
}: {
  quoteUrl: string;
  view: PortalView;
  className: string;
  hasMsa: boolean;
}) {
  const links = [
    { id: "requests", label: "Requests", icon: Inbox },
    { id: "quotes", label: "Quotes", icon: FileText },
    ...(hasMsa
      ? [{ id: "msa" as const, label: "Agreement", icon: FileText }]
      : []),
    { id: "invoices", label: "Invoices", icon: ReceiptText },
    { id: "wallet", label: "Wallet", icon: CreditCard },
    { id: "contact", label: "Contact us", icon: Phone },
  ] as const;
  return (
    <nav className={className} aria-label="Client navigation">
      {links.map(({ id, label, icon: Icon }) => (
        <a
          key={id}
          href={`${quoteUrl}?view=${id}`}
          aria-current={
            view === id ||
            (view === "new-request" && id === "requests") ||
            (view === "detail" && id === "quotes")
              ? "page"
              : undefined
          }
        >
          <Icon size={18} aria-hidden="true" /> {label}
        </a>
      ))}
    </nav>
  );
}

async function ClientSectionView({
  section,
  quoteUrl,
  quoteView,
  contactPhone,
  contactHref,
  token,
  result,
  organizationId,
  emailQuotes,
}: {
  section: Exclude<PortalView, "detail">;
  quoteUrl: string;
  quoteView: ClientQuoteView;
  contactPhone: string;
  contactHref: string;
  token: string;
  result: string;
  organizationId: string;
  emailQuotes: ClientEmailQuote[];
}) {
  const { quote, total } = quoteView;
  const requestUrl = `${quoteUrl}?view=new-request`;

  if (section === "msa") {
    const agreement = quoteView.msa;
    if (!agreement)
      return (
        <main className={styles.sectionPage}>
          <h1>Agreement unavailable</h1>
        </main>
      );
    const today = easternDate(new Date());
    const displayedAgreement =
      agreement.status === "sent"
        ? {
            ...agreement,
            transactionDate: today,
            cancellationDeadline: cancellationDeadline(today),
          }
        : agreement;
    let paidCents = 0;
    let cardAvailable = Boolean(
      process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET,
    );
    if (agreement.status === "signed") {
      const { data: payments, error } = await supabaseAdmin()
        .from("remodel_records")
        .select("data")
        .eq("organization_id", organizationId)
        .eq("project_id", quote.id)
        .eq("kind", "activity")
        .limit(1000);
      if (error) throw error;
      paidCents = payments.reduce((sum, row) => {
        const payment = row.data as Activity;
        return payment.activityType === "Payment received"
          ? sum + Math.round((payment.amount || 0) * 100)
          : sum;
      }, 0);
      if (cardAvailable) {
        try {
          cardAvailable =
            (await stripeClient().accounts.retrieve(null)).payouts_enabled ===
            true;
        } catch {
          cardAvailable = false;
        }
      }
    }
    const depositCents = Math.round(msaPaymentRows(agreement)[0].amount * 100);
    const dueCents = Math.max(0, depositCents - paidCents);
    return (
      <main className={styles.sectionPage}>
        <h1>Master Services Agreement</h1>
        <p className={styles.sectionIntro}>
          {agreement.status === "signed"
            ? "Your signed agreement and deposit options are below."
            : "Review the full agreement before signing."}
        </p>
        <MsaDocument agreement={displayedAgreement} />
        {agreement.status === "sent" && (
          <MsaAcceptance token={token} agreement={displayedAgreement} />
        )}
        {agreement.status === "signed" && (
          <div
            className={styles.walletCard}
            style={{ maxWidth: 850, margin: "24px auto" }}
          >
            <h2>Signed agreement</h2>
            <a
              className={styles.outlineAction}
              href={`/api/client-quote/${encodeURIComponent(token)}/msa/pdf`}
            >
              <Download size={18} /> Download signed PDF
            </a>
            <h2>Deposit</h2>
            <p>
              {dueCents > 0
                ? `${money(dueCents / 100)} remaining toward the ${money(depositCents / 100)} deposit.`
                : "Deposit recorded. Thank you."}{" "}
              Work begins after the deposit is received.
            </p>
            {dueCents > 0 && (
              <>
                {cardAvailable ? (
                  <form
                    method="post"
                    action={`/api/client-quote/${encodeURIComponent(token)}/msa/deposit`}
                  >
                    <input
                      type="hidden"
                      name="authenticity"
                      value={createClientWalletFormToken(token)}
                    />
                    <button type="submit" className={styles.outlineAction}>
                      <CreditCard size={18} /> Pay deposit online
                    </button>
                  </form>
                ) : (
                  <p>Online card payment is temporarily unavailable.</p>
                )}
                <h3>Pay by check</h3>
                <p>
                  Make the check payable to Premium Living Home Improvement LLC
                  d/b/a Premium Remodel. Contact us to arrange delivery, or mail
                  it to 309 Amiable Loop, Cary, North Carolina 27519. We will
                  record it when received.
                </p>
              </>
            )}
            {result === "payment-return" && (
              <p role="status">
                If you completed checkout, your payment may take a moment to
                appear. Refresh this page to check.
              </p>
            )}
            {result === "unavailable" && (
              <p role="alert">
                Online payment could not be started. Please try again later or
                contact us.
              </p>
            )}
            {result === "expired" && (
              <p role="alert">
                This payment form expired. Refresh and try again.
              </p>
            )}
          </div>
        )}
      </main>
    );
  }

  if (section === "contact")
    return (
      <main className={styles.sectionPage}>
        <h1>Contact us</h1>
        <div className={styles.contactCard}>
          <h2>Contact details</h2>
          <a href={`tel:${contactPhone.replace(/[^\d+]/g, "")}`}>
            <Phone size={21} aria-hidden="true" /> {contactPhone}
          </a>
          <a href={contactHref}>
            <Mail size={21} aria-hidden="true" /> contact@premiumremodel.com
          </a>
        </div>
      </main>
    );

  if (section === "requests")
    return (
      <main className={styles.sectionPage}>
        <h1>Your requests</h1>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            <Inbox size={30} aria-hidden="true" />
          </span>
          <h2>Get work done</h2>
          <p>Send us a request to fill us in on the details.</p>
          <a className={styles.outlineAction} href={requestUrl}>
            <Plus size={19} aria-hidden="true" /> New request
          </a>
        </div>
      </main>
    );

  if (section === "new-request")
    return (
      <main className={styles.sectionPage}>
        <h1>New request</h1>
        <ClientNewRequestForm requestsUrl={`${quoteUrl}?view=requests`} />
      </main>
    );

  if (section === "invoices")
    return (
      <main className={styles.sectionPage}>
        <h1>Your invoices</h1>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            <ReceiptText size={30} aria-hidden="true" />
          </span>
          <h2>No invoices are available in this quote link</h2>
          <p>Need a copy of an invoice? Contact us and we’ll help.</p>
          <a className={styles.outlineAction} href={contactHref}>
            <Mail size={18} aria-hidden="true" /> Email us
          </a>
        </div>
      </main>
    );

  if (section === "quotes")
    return (
      <main className={styles.sectionPage}>
        <h1>Your quotes</h1>
        {(emailQuotes.length
          ? emailQuotes
          : [{ id: quote.id, quote, items: [], url: quoteUrl }]
        ).map((entry) => {
          const entryApproved = Boolean(entry.quote.quoteAcceptedAt);
          const entryTotal =
            entry.quote.id === quote.id
              ? total
              : entry.items.reduce((sum, item) => sum + item.estimate, 0);
          return (
            <div key={entry.id}>
              <h2
                className={`${styles.quoteGroup} ${entryApproved ? styles.approved : ""}`}
              >
                {entryApproved ? "Approved" : "Awaiting response"}
              </h2>
              <a className={styles.quoteCard} href={entry.url}>
                <strong>
                  Quote #
                  {entry.quote.quoteNumber ||
                    entry.quote.id.slice(0, 8).toUpperCase()}
                </strong>
                <span>
                  <CalendarDays size={20} aria-hidden="true" />{" "}
                  {entryApproved ? "Approved" : "Sent"}{" "}
                  {date(
                    entryApproved
                      ? entry.quote.quoteAcceptedAt
                      : entry.quote.quoteSentAt,
                  ) || date(entry.quote.revisedDate || entry.quote.updatedAt)}
                </span>
                <span className={styles.quoteAddress}>
                  {entry.quote.address || "Project address to be confirmed"}
                </span>
                <span className={styles.quoteCardTotal}>
                  <small>Total</small>
                  <b>{money(entryTotal)}</b>
                </span>
              </a>
            </div>
          );
        })}
      </main>
    );

  let methods: Awaited<ReturnType<typeof savedPaymentMethods>> = [];
  let methodsUnavailable = !process.env.STRIPE_SECRET_KEY;
  if (!methodsUnavailable) {
    try {
      methods = await savedPaymentMethods(token);
    } catch {
      methodsUnavailable = true;
    }
  }
  const walletFormToken = createClientWalletFormToken(token);
  return (
    <main className={styles.sectionPage}>
      <h1>Payment methods</h1>
      <p className={styles.sectionIntro}>
        Add a card or bank account securely with Stripe for future invoices.
        Nothing is charged today.
      </p>
      <div className={styles.walletCard}>
        <h2>Saved payment methods</h2>
        {methodsUnavailable ? (
          <p>
            Payment methods are temporarily unavailable. Please contact us for
            help.
          </p>
        ) : methods.length ? (
          <ul className={styles.savedMethods}>
            {methods.map((method) => (
              <li key={method.id}>
                <CreditCard size={18} aria-hidden="true" /> {method.label}
              </li>
            ))}
          </ul>
        ) : (
          <p>No payment methods saved yet.</p>
        )}
        {result === "unavailable" && (
          <p role="alert" className={styles.walletError}>
            We couldn’t open secure payment setup. Please try again later or
            contact us.
          </p>
        )}
        {result === "expired" && (
          <p role="alert" className={styles.walletError}>
            Please try saving your payment method again.
          </p>
        )}
        {!methodsUnavailable && (
          <div className={styles.walletActions}>
            <form
              method="post"
              action={`/api/client-quote/${encodeURIComponent(token)}/wallet`}
            >
              <input
                type="hidden"
                name="authenticity"
                value={walletFormToken}
              />
              <button type="submit">
                <CreditCard size={18} aria-hidden="true" /> Add payment method
              </button>
            </form>
          </div>
        )}
        <p className={styles.walletNote}>
          You’ll enter your details on Stripe’s secure page. Nothing is charged
          today; we’ll only charge an amount you agree to for future work.
        </p>
      </div>
    </main>
  );
}

export default async function ClientQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    view?: string | string[];
    result?: string | string[];
  }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const source = await readClientQuoteSource(token);
  if (!source) {
    if (isExpiredClientPortalToken(token))
      redirect("/client/sign-in?expired=1");
    notFound();
  }
  const view = source.view;

  const rawSection = typeof query.view === "string" ? query.view : "";
  const section: PortalView = [
    "requests",
    "new-request",
    "quotes",
    "invoices",
    "wallet",
    "contact",
    "msa",
  ].includes(rawSection)
    ? (rawSection as PortalView)
    : "detail";
  const { quote, items, total, approved } = view;
  const number = quote.quoteNumber || quote.id.slice(0, 8).toUpperCase();
  const quoteUrl = `/client/${encodeURIComponent(token)}/quote`;
  const access = parseClientPortalAccess(token);
  const emailQuotes =
    section === "quotes" &&
    access?.emailTag &&
    access.expiresAt &&
    quote.clientEmail
      ? await clientQuotesForEmail(
          source.organizationId,
          quote.clientEmail,
          "",
          (access.expiresAt - 30 * 24 * 60 * 60) * 1000,
        )
      : [];
  const contactHref = `mailto:contact@premiumremodel.com?subject=${encodeURIComponent(`Question about Premium Remodel Quote #${number}`)}`;
  const contactPhone = quote.preparedByPhone || "(919) 413-9782";
  const sectionTotals = new Map<string, number>();
  const sections: Array<{
    key: string;
    name: string;
    items: Array<{ item: (typeof items)[number]; striped: boolean }>;
  }> = [];
  items.forEach((item, index) => {
    const name = item.sectionName?.trim() || DEFAULT_QUOTE_PROJECT_NAME;
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
        </div>
        <a className={styles.newRequest} href={`${quoteUrl}?view=new-request`}>
          <Plus size={18} aria-hidden="true" /> New request
        </a>
        <ClientNavigation
          quoteUrl={quoteUrl}
          view={section}
          className={styles.sidebarNav}
          hasMsa={Boolean(view.msa)}
        />
        <div className={styles.sidebarContact}>
          <span>Need help with your quote?</span>
          <a href={`tel:${contactPhone.replace(/[^\d+]/g, "")}`}>
            <Phone size={15} aria-hidden="true" /> {contactPhone}
          </a>
          <a href="mailto:contact@premiumremodel.com">
            <Mail size={15} aria-hidden="true" /> Email us
          </a>
          <Link href="/client/sign-in">Sign in on another device</Link>
        </div>
        <details className={styles.mobileMenu}>
          <summary>
            <Menu size={18} aria-hidden="true" /> Menu
          </summary>
          <div className={styles.mobileMenuPanel}>
            <a
              className={styles.mobileNewRequest}
              href={`${quoteUrl}?view=new-request`}
            >
              <Plus size={18} aria-hidden="true" /> New request
            </a>
            <ClientNavigation
              quoteUrl={quoteUrl}
              view={section}
              className={styles.mobileNav}
              hasMsa={Boolean(view.msa)}
            />
          </div>
        </details>
      </aside>

      <div
        className={`${styles.content} ${section !== "detail" ? styles.sectionContent : ""}`}
      >
        {section === "detail" ? (
          <>
            <nav className={styles.toolbar} aria-label="Quote actions">
              <div className={styles.toolbarMeta}>
                <span>Premium Remodel Quote #{number}</span>
                <span className={styles.toolbarStatus}>
                  {approved ? "Approved" : "Awaiting response"}
                </span>
              </div>
              <div className={styles.toolbarActions}>
                <a
                  className={styles.download}
                  href={`/api/client-quote/${encodeURIComponent(token)}/pdf${view.acceptance ? `?signed=${encodeURIComponent(view.acceptance.signedAt)}` : ""}`}
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
                  <small>
                    Prepared by {quote.preparedBy || "Premium Remodel"}
                  </small>
                </div>
                <div>
                  <h2>Project address</h2>
                  {quote.address ? (
                    quote.address
                      .split(",")
                      .map((part) => part.trim())
                      .filter(Boolean)
                      .map((part, index) => (
                        <p key={`${index}-${part}`}>{part}</p>
                      ))
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
                    {section.key !== `id:${UNGROUPED_SCOPE_PROJECT_ID}` && (
                      <div className={styles.sectionHeader}>
                        <h3>Project&nbsp; | &nbsp;{section.name}</h3>
                        <span>
                          Section total&nbsp;{" "}
                          {money(sectionTotals.get(section.key) || 0)}
                        </span>
                      </div>
                    )}
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

              {!!quote.quotePhotos?.length && (
                <section
                  className={styles.quotePhotos}
                  aria-label="Quote photos"
                >
                  <h2>Quote photos</h2>
                  <div className={styles.quotePhotoGrid}>
                    {quote.quotePhotos.map((photo) => (
                      <figure key={photo.attachmentId}>
                        <img
                          src={`/api/client-quote/${encodeURIComponent(token)}/photos/${encodeURIComponent(photo.attachmentId)}`}
                          alt={photo.caption || `${photo.kind} project photo`}
                        />
                        <figcaption>
                          <strong>
                            {photo.kind === "before"
                              ? "Before"
                              : photo.kind === "concept"
                                ? "AI concept"
                                : "Example photo"}
                          </strong>
                          {photo.caption && <span>{photo.caption}</span>}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                  {quote.quotePhotos.some(
                    (photo) => photo.kind === "concept",
                  ) && (
                    <p className={styles.quotePhotoNote}>
                      AI concepts illustrate a possible finished look. The
                      agreed work and materials are defined in the scope above.
                    </p>
                  )}
                </section>
              )}

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
                <CustomerAcceptance
                  token={token}
                  clientName={quote.client}
                  today={new Intl.DateTimeFormat("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "America/New_York",
                  }).format(new Date())}
                  quoteUpdatedAt={quote.updatedAt}
                  approved={approved}
                  acceptance={view.acceptance}
                />
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
          </>
        ) : (
          <ClientSectionView
            section={section}
            quoteUrl={quoteUrl}
            quoteView={view}
            contactPhone={contactPhone}
            contactHref={contactHref}
            token={token}
            result={typeof query.result === "string" ? query.result : ""}
            organizationId={source.organizationId}
            emailQuotes={emailQuotes}
          />
        )}
      </div>
    </div>
  );
}
