import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  FileText,
  Inbox,
  Mail,
  Menu,
  Phone,
  Plus,
  ReceiptText,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  readClientQuoteSource,
  type ClientScheduleItem,
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
import {
  organizationStripeEnabled,
  organizationStripePayoutsEnabled,
} from "@/lib/stripe-payments";
import { getBusinessConfigForOrganization } from "@/lib/business-config";
import type { BusinessConfig } from "@/lib/business-config-schema";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Activity } from "@/lib/types";
import MsaDocument from "@/components/msa-document";
import { savedPaymentMethods } from "@/lib/client-wallet";
import { changeOrderTerms, paymentTerms } from "@/lib/quote-pdf";
import {
  customerQuoteSectionName,
  UNGROUPED_SCOPE_PROJECT_ID,
} from "@/lib/scope-projects";
import { appearsOnCustomerQuote } from "@/lib/customer-quote-scope";
import { resolveQuotePriceDisplay } from "@/lib/quote-price-display";
import { clientContractInvoice } from "@/lib/client-invoice";
import ClientNewRequestForm from "./client-new-request-form";
import CustomerAcceptance from "./customer-acceptance";
import MsaAcceptance from "./msa-acceptance";
import ClientQuoteFlow from "./client-quote-flow";
import { getPublicQuoteFlowInstance } from "@/lib/quote-flow-instances";
import styles from "./quote.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your project quote",
  description: "A private project quote.",
  robots: { index: false, follow: false, noarchive: true },
};

function money(value: number, business: BusinessConfig) {
  return new Intl.NumberFormat(business.regional.locale, {
    style: "currency",
    currency: business.regional.currency,
  }).format(value);
}

function date(value: string | undefined, business: BusinessConfig) {
  if (!value) return "";
  const day = value.slice(0, 10);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? new Date(`${day}T00:00:00Z`)
    : new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? ""
    : new Intl.DateTimeFormat(business.regional.locale, {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: business.regional.timezone,
      }).format(parsed);
}

function scheduleDate(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function scheduleWeekday(value: string, business: BusinessConfig) {
  return new Intl.DateTimeFormat(business.regional.locale, {
    weekday: "short",
    timeZone: "UTC",
  }).format(scheduleDate(value));
}

function scheduleDay(value: string, business: BusinessConfig) {
  return new Intl.DateTimeFormat(business.regional.locale, {
    day: "numeric",
    timeZone: "UTC",
  }).format(scheduleDate(value));
}

function scheduleMonthShort(value: string, business: BusinessConfig) {
  return new Intl.DateTimeFormat(business.regional.locale, {
    month: "short",
    timeZone: "UTC",
  }).format(scheduleDate(value));
}

function scheduleMonth(value: string, business: BusinessConfig) {
  return new Intl.DateTimeFormat(business.regional.locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(scheduleDate(value));
}

function scheduleLongDate(value: string, business: BusinessConfig) {
  return new Intl.DateTimeFormat(business.regional.locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(scheduleDate(value));
}

function scheduleTime(item: ClientScheduleItem, business: BusinessConfig) {
  const format = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return new Intl.DateTimeFormat(business.regional.locale, {
      hour: "numeric",
      minute: minute ? "2-digit" : undefined,
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2020, 0, 1, hour, minute)));
  };
  if (!item.startTime) return "";
  return item.endTime
    ? `${format(item.startTime)}–${format(item.endTime)}`
    : format(item.startTime);
}

async function receivedPaymentCents(organizationId: string, projectId: string) {
  const { data: payments, error } = await supabaseAdmin()
    .from("remodel_records")
    .select("data")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .eq("kind", "activity")
    .limit(1000);
  if (error) throw error;
  return payments.reduce((sum, row) => {
    const payment = row.data as Activity;
    return payment.activityType === "Payment received"
      ? sum + Math.round((payment.amount || 0) * 100)
      : sum;
  }, 0);
}

type PortalView =
  | "detail"
  | "schedule"
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
  hasWallet,
  hasSchedule,
}: {
  quoteUrl: string;
  view: PortalView;
  className: string;
  hasMsa: boolean;
  hasWallet: boolean;
  hasSchedule: boolean;
}) {
  const links = [
    ...(hasSchedule
      ? [{ id: "schedule" as const, label: "Schedule", icon: CalendarDays }]
      : []),
    { id: "requests", label: "Requests", icon: Inbox },
    { id: "quotes", label: "Quotes", icon: FileText },
    ...(hasMsa
      ? [{ id: "msa" as const, label: "Agreement", icon: FileText }]
      : []),
    { id: "invoices", label: "Invoices", icon: ReceiptText },
    ...(hasWallet
      ? [{ id: "wallet" as const, label: "Wallet", icon: CreditCard }]
      : []),
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
  business,
  onsite,
  schedule,
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
  business: BusinessConfig;
  onsite: boolean;
  schedule: ClientScheduleItem[];
}) {
  const { quote, total } = quoteView;
  const requestUrl = `${quoteUrl}?view=new-request`;

  if (section === "msa") {
    const agreement = quoteView.msa;
    if (!agreement || !business.features.agreements)
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
    let cardAvailable =
      business.features.payments &&
      business.quotePreferences.paymentProvider === "stripe" &&
      (await organizationStripeEnabled(organizationId));
    if (agreement.status === "signed") {
      paidCents = await receivedPaymentCents(organizationId, quote.id);
      if (cardAvailable) {
        try {
          cardAvailable =
            await organizationStripePayoutsEnabled(organizationId);
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
        <div
          className={styles.msaDocumentScroll}
          role="region"
          aria-label="Scrollable master services agreement"
          tabIndex={0}
        >
          <MsaDocument
            agreement={displayedAgreement}
            highlightOwnerSignature={onsite && agreement.status === "sent"}
          />
        </div>
        {agreement.status === "sent" && (
          <MsaAcceptance token={token} agreement={displayedAgreement} />
        )}
        {agreement.status === "signed" && (
          <div
            className={styles.walletCard}
            style={{ maxWidth: 850, margin: "24px auto" }}
          >
            <h2>Signed agreement</h2>
            <div className={styles.signedAgreementActions}>
              <a
                className={styles.outlineAction}
                href={`/api/client-quote/${encodeURIComponent(token)}/msa/pdf`}
              >
                <Download size={18} /> Download signed PDF
              </a>
              <a
                className={styles.outlineAction}
                href={`${quoteUrl}?view=invoices`}
              >
                <ReceiptText size={18} /> View invoice
              </a>
            </div>
            <h2>Deposit</h2>
            <p>
              {dueCents > 0
                ? `${money(dueCents / 100, business)} remaining toward the ${money(depositCents / 100, business)} deposit.`
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
                {business.compliance.checkPayee && (
                  <>
                    <h3>Pay by check</h3>
                    <p>
                      Make the check payable to {business.compliance.checkPayee}
                      .
                      {business.compliance.checkMailingAddress
                        ? " Contact us to arrange delivery, or mail it to " +
                          business.compliance.checkMailingAddress +
                          "."
                        : " Contact us to arrange delivery."}
                      &nbsp;We will record it when received.
                    </p>
                  </>
                )}
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
          {contactPhone && (
            <a href={`tel:${contactPhone.replace(/[^\d+]/g, "")}`}>
              <Phone size={21} aria-hidden="true" /> {contactPhone}
            </a>
          )}
          {business.profile.email && (
            <a href={contactHref}>
              <Mail size={21} aria-hidden="true" />{" "}
              {business.profile.email || "Email us"}
            </a>
          )}
        </div>
      </main>
    );

  if (section === "schedule") {
    const grouped = schedule.reduce<
      Array<{ dueDate: string; items: ClientScheduleItem[] }>
    >((days, item) => {
      const current = days.at(-1);
      if (current?.dueDate === item.dueDate) current.items.push(item);
      else days.push({ dueDate: item.dueDate, items: [item] });
      return days;
    }, []);
    const nextItem = schedule.find((item) => item.status !== "Done");
    const completed = schedule.filter((item) => item.status === "Done").length;
    const calendarRange = grouped.length
      ? `${scheduleMonth(grouped[0].dueDate, business)}${
          grouped.at(-1)?.dueDate !== grouped[0].dueDate
            ? ` – ${scheduleMonth(grouped.at(-1)!.dueDate, business)}`
            : ""
        }`
      : "Schedule pending";

    return (
      <main className={`${styles.sectionPage} ${styles.schedulePage}`}>
        <header className={styles.scheduleHeading}>
          <div>
            <span>Project calendar</span>
            <h1>What’s happening next</h1>
            <p>
              Your current project dates, delivery windows, and milestones in
              one place. We’ll keep this updated as the schedule changes.
            </p>
          </div>
          {schedule.length > 0 && (
            <dl className={styles.scheduleSummary}>
              <div>
                <dt>Scheduled</dt>
                <dd>{schedule.length}</dd>
              </div>
              <div>
                <dt>Complete</dt>
                <dd>{completed}</dd>
              </div>
            </dl>
          )}
        </header>

        {schedule.length ? (
          <>
            <section
              className={styles.scheduleCalendar}
              aria-label="Project calendar dates"
            >
              <div className={styles.scheduleCalendarHeader}>
                <span>Calendar</span>
                <strong>{calendarRange}</strong>
              </div>
              <div className={styles.scheduleDateRail}>
                {grouped.map((day) => (
                  <a key={day.dueDate} href={`#schedule-${day.dueDate}`}>
                    <span>{scheduleWeekday(day.dueDate, business)}</span>
                    <strong>{scheduleDay(day.dueDate, business)}</strong>
                    <small>
                      {day.items.length}{" "}
                      {day.items.length === 1 ? "item" : "items"}
                    </small>
                  </a>
                ))}
              </div>
            </section>

            {nextItem && (
              <p className={styles.scheduleNext}>
                <Clock3 size={17} aria-hidden="true" />
                <span>
                  <strong>Next up:</strong> {nextItem.title} ·{" "}
                  {scheduleLongDate(nextItem.dueDate, business)}
                  {scheduleTime(nextItem, business)
                    ? ` at ${scheduleTime(nextItem, business)}`
                    : ""}
                </span>
              </p>
            )}

            <ol className={styles.scheduleTimeline}>
              {grouped.map((day) => (
                <li key={day.dueDate} id={`schedule-${day.dueDate}`}>
                  <div className={styles.scheduleDate} aria-hidden="true">
                    <span>{scheduleWeekday(day.dueDate, business)}</span>
                    <strong>{scheduleDay(day.dueDate, business)}</strong>
                    <small>{scheduleMonthShort(day.dueDate, business)}</small>
                  </div>
                  <div className={styles.scheduleDayItems}>
                    {day.items.map((item) => (
                      <article key={item.id}>
                        <div className={styles.scheduleItemHeading}>
                          <div>
                            <span>{item.workType}</span>
                            <h2>{item.title}</h2>
                          </div>
                          <span
                            className={`${styles.scheduleStatus} ${
                              item.status === "Done"
                                ? styles.scheduleDone
                                : item.status === "In progress"
                                  ? styles.scheduleActive
                                  : ""
                            }`}
                          >
                            {item.status === "Done" && (
                              <CheckCircle2 size={14} aria-hidden="true" />
                            )}
                            {item.status === "To do"
                              ? "Scheduled"
                              : item.status}
                          </span>
                        </div>
                        {scheduleTime(item, business) && (
                          <p className={styles.scheduleItemTime}>
                            <Clock3 size={15} aria-hidden="true" />
                            {scheduleTime(item, business)}
                          </p>
                        )}
                        {item.description && <p>{item.description}</p>}
                      </article>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>
              <CalendarDays size={30} aria-hidden="true" />
            </span>
            <h2>No project dates are scheduled yet</h2>
            <p>
              Your project timeline will appear here as dates are confirmed.
            </p>
          </div>
        )}
      </main>
    );
  }

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
        <ClientNewRequestForm
          requestsUrl={`${quoteUrl}?view=requests`}
          portalToken={token}
          businessName={
            business.compliance.smsProgramName || business.profile.name
          }
          privacyUrl={business.compliance.privacyUrl}
          termsUrl={business.compliance.termsUrl}
          smsConsentEnabled={Boolean(
            business.compliance.smsPolicyVersion &&
            business.compliance.privacyUrl &&
            business.compliance.termsUrl,
          )}
        />
      </main>
    );

  if (section === "invoices") {
    const agreement = quoteView.msa;
    if (!agreement || agreement.status !== "signed")
      return (
        <main className={styles.sectionPage}>
          <h1>Your invoices</h1>
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>
              <ReceiptText size={30} aria-hidden="true" />
            </span>
            <h2>No invoices are available in this quote link</h2>
            <p>Your contract invoice will appear here after it is signed.</p>
            <a className={styles.outlineAction} href={contactHref}>
              <Mail size={18} aria-hidden="true" /> Email us
            </a>
          </div>
        </main>
      );

    const invoice = clientContractInvoice(
      agreement,
      await receivedPaymentCents(organizationId, quote.id),
    )!;
    const invoiceNumber = `INV-${quote.quoteNumber || quote.id.slice(0, 8).toUpperCase()}`;
    return (
      <main className={styles.sectionPage}>
        <h1>Your invoices</h1>
        <p className={styles.sectionIntro}>
          This invoice was created automatically from your signed agreement.
        </p>
        <section
          className={styles.invoice}
          aria-label={`Invoice ${invoiceNumber}`}
        >
          <header className={styles.invoiceHeader}>
            <div>
              <span>Contract invoice</span>
              <h2>{invoiceNumber}</h2>
              <p>
                {quote.name} · Signed{" "}
                {date(agreement.transactionDate, business)}
              </p>
            </div>
            <span
              className={`${styles.invoiceStatus} ${invoice.status === "paid" ? styles.invoicePaid : ""}`}
            >
              {invoice.status === "paid" ? "Paid" : "Open"}
            </span>
          </header>
          <dl className={styles.invoiceAmounts}>
            <div>
              <dt>Contract total</dt>
              <dd>{money(invoice.totalCents / 100, business)}</dd>
            </div>
            <div>
              <dt>Payments received</dt>
              <dd>{money(invoice.paidCents / 100, business)}</dd>
            </div>
            <div>
              <dt>Remaining balance</dt>
              <dd>{money(invoice.balanceCents / 100, business)}</dd>
            </div>
          </dl>
          <div className={styles.invoiceDue}>
            <span>Deposit currently due</span>
            <strong>{money(invoice.depositDueCents / 100, business)}</strong>
          </div>
          <footer className={styles.invoiceActions}>
            <a className={styles.outlineAction} href={`${quoteUrl}?view=msa`}>
              <FileText size={18} aria-hidden="true" /> View signed agreement
            </a>
            {invoice.depositDueCents > 0 && (
              <a className={styles.outlineAction} href={`${quoteUrl}?view=msa`}>
                <CreditCard size={18} aria-hidden="true" /> Payment options
              </a>
            )}
          </footer>
        </section>
      </main>
    );
  }

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
                    business,
                  ) ||
                    date(
                      entry.quote.revisedDate || entry.quote.updatedAt,
                      business,
                    )}
                </span>
                <span className={styles.quoteAddress}>
                  {entry.quote.address || "Project address to be confirmed"}
                </span>
                <span className={styles.quoteCardTotal}>
                  <small>Total</small>
                  <b>{money(entryTotal, business)}</b>
                </span>
              </a>
            </div>
          );
        })}
      </main>
    );

  let methods: Awaited<ReturnType<typeof savedPaymentMethods>> = [];
  let methodsUnavailable =
    !business.features.payments ||
    business.quotePreferences.paymentProvider !== "stripe" ||
    !(await organizationStripeEnabled(organizationId));
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
    onsite?: string | string[];
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
  const [business, quoteFlow] = await Promise.all([
    getBusinessConfigForOrganization(source.organizationId),
    getPublicQuoteFlowInstance(source.organizationId, source.view.quote.id),
  ]);
  const customQuoteFlow =
    quoteFlow?.portalRenderer === "legacy_quote_portal_v1" ? null : quoteFlow;
  const walletEnabled =
    business.features.payments &&
    business.quotePreferences.paymentProvider === "stripe" &&
    (await organizationStripeEnabled(source.organizationId));
  const logoSrc =
    business.profile.logoUrl === "/api/business-logo"
      ? `/api/client-quote/${encodeURIComponent(token)}/logo`
      : business.profile.logoUrl;
  const bannerSrc =
    business.profile.bannerUrl === "/api/business-branding/banner"
      ? `/api/client-quote/${encodeURIComponent(token)}/banner`
      : business.profile.bannerUrl;
  const onsite = query.onsite === "1";

  const rawSection = typeof query.view === "string" ? query.view : "";
  const section: PortalView = [
    "schedule",
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
  const priceDisplay = resolveQuotePriceDisplay(
    quote,
    business.quotePreferences.showCustomerLineItemPrices,
  );
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
  const contactHref = `mailto:${business.profile.email}?subject=${encodeURIComponent(`Question about ${business.profile.name} Quote #${number}`)}`;
  const contactPhone = quote.preparedByPhone || business.profile.phone;
  const sectionTotals = new Map<string, number>();
  const sections: Array<{
    key: string;
    name: string;
    items: Array<{ item: (typeof items)[number]; striped: boolean }>;
  }> = [];
  items.forEach((item) => {
    const key = item.sectionId?.trim()
      ? `id:${item.sectionId.trim()}`
      : item.sectionName?.trim()
        ? `name:${item.sectionName.trim().toLowerCase()}`
        : "ungrouped";
    sectionTotals.set(key, (sectionTotals.get(key) || 0) + item.estimate);
  });
  items.filter(appearsOnCustomerQuote).forEach((item, index) => {
    const name = customerQuoteSectionName(item.sectionName);
    const key = item.sectionId?.trim()
      ? `id:${item.sectionId.trim()}`
      : item.sectionName?.trim()
        ? `name:${item.sectionName.trim().toLowerCase()}`
        : "ungrouped";
    if (sections.at(-1)?.key !== key) sections.push({ key, name, items: [] });
    sections.at(-1)!.items.push({ item, striped: index % 2 === 1 });
  });

  return (
    <div className={`${styles.page} ${onsite ? styles.onsitePage : ""}`}>
      {onsite && (
        <header className={styles.onsiteHeader}>
          <div>
            {logoSrc ? (
              <img src={logoSrc} alt={business.profile.name} />
            ) : (
              <span className={styles.onsiteMark}>SB</span>
            )}
            <span>
              <strong>On-device signing</strong>
              <small>
                {business.profile.name} · Protected customer handoff
              </small>
            </span>
          </div>
          <div>
            <span className={styles.onsiteBadge}>
              <ShieldCheck size={15} /> Staff workspace hidden
            </span>
            <Link href="/?view=Quotes">
              <X size={16} /> Exit customer signing
            </Link>
          </div>
        </header>
      )}
      <aside
        className={styles.sidebar}
        aria-label={`${business.profile.name} client portal`}
      >
        <div className={styles.sidebarBrand}>
          {logoSrc ? (
            <img src={logoSrc} alt={business.profile.name} />
          ) : (
            <strong>{business.profile.name}</strong>
          )}
        </div>
        <a className={styles.newRequest} href={`${quoteUrl}?view=new-request`}>
          <Plus size={18} aria-hidden="true" /> New request
        </a>
        <ClientNavigation
          quoteUrl={quoteUrl}
          view={section}
          className={styles.sidebarNav}
          hasMsa={business.features.agreements && Boolean(view.msa)}
          hasWallet={walletEnabled}
          hasSchedule={approved}
        />
        <div className={styles.sidebarContact}>
          <span>Need help with your quote?</span>
          {contactPhone && (
            <a href={`tel:${contactPhone.replace(/[^\d+]/g, "")}`}>
              <Phone size={15} aria-hidden="true" /> {contactPhone}
            </a>
          )}
          {business.profile.email && (
            <a href={contactHref}>
              <Mail size={15} aria-hidden="true" /> Email us
            </a>
          )}
          <Link href={`/client/sign-in?org=${source.organizationId}`}>
            Sign in on another device
          </Link>
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
              hasMsa={business.features.agreements && Boolean(view.msa)}
              hasWallet={walletEnabled}
              hasSchedule={approved}
            />
          </div>
        </details>
      </aside>

      <div
        className={`${styles.content} ${section !== "detail" ? styles.sectionContent : ""} ${onsite ? styles.onsiteContent : ""}`}
      >
        {bannerSrc && !onsite && (
          <div className={styles.portalBanner}>
            <img src={bannerSrc} alt="" />
          </div>
        )}
        {section === "detail" ? (
          <>
            <nav className={styles.toolbar} aria-label="Quote actions">
              <div className={styles.toolbarMeta}>
                <span>
                  {business.profile.name} Quote #{number}
                </span>
                <span className={styles.toolbarStatus}>
                  {approved ? "Signed" : "Awaiting response"}
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

            {customQuoteFlow &&
              customQuoteFlow.definition.stages.length > 0 && (
                <ClientQuoteFlow
                  token={token}
                  initial={customQuoteFlow}
                  onsite={onsite}
                  quoteTotal={total}
                  projectType={quote.category}
                  locale={business.regional.locale}
                  currency={business.regional.currency}
                />
              )}

            <main className={styles.document}>
              <div className={styles.masthead}>
                <p>
                  {business.profile.name.toUpperCase()}&nbsp; | &nbsp;PROJECT
                  QUOTE
                </p>
                {logoSrc ? (
                  <img src={logoSrc} alt={business.profile.name} />
                ) : (
                  <strong>{business.profile.name}</strong>
                )}
              </div>

              <header className={styles.titleBlock}>
                <h1>{quote.name}</h1>
                <p>
                  Quote #{number} <span aria-hidden="true">|</span> Revised{" "}
                  {date(quote.revisedDate || quote.updatedAt, business)}
                </p>
              </header>

              <section className={styles.parties} aria-label="Quote details">
                <div>
                  <h2>Prepared for</h2>
                  <p>{quote.client || "Client"}</p>
                  {quote.clientPhone && <p>{quote.clientPhone}</p>}
                  <small>
                    Prepared by {quote.preparedBy || business.profile.name}
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
                <strong>{money(total, business)}</strong>
              </section>

              <section className={styles.scope} aria-label="Scope of work">
                <div className={styles.scopeHeader}>
                  <h2>Scope of work</h2>
                  {priceDisplay === "itemized" && <span>Line total</span>}
                </div>
                {sections.map((section, index) => (
                  <div key={`${section.key}-${index}`}>
                    {section.name &&
                      section.key !== `id:${UNGROUPED_SCOPE_PROJECT_ID}` && (
                        <div className={styles.sectionHeader}>
                          <h3>{section.name}</h3>
                          {priceDisplay !== "total" && (
                            <span>
                              Section total&nbsp;{" "}
                              {money(
                                sectionTotals.get(section.key) || 0,
                                business,
                              )}
                            </span>
                          )}
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
                        {priceDisplay === "itemized" && (
                          <span>{money(item.estimate, business)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
                <div className={styles.scopeTotal}>
                  <span>Total project investment</span>
                  <strong>{money(total, business)}</strong>
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

              {onsite && !approved && (
                <section className={styles.onsiteSignatureTarget}>
                  <span>Signing here</span>
                  <h2>Customer acceptance</h2>
                  <div>
                    <p>
                      <small>Print name</small>
                      <strong>{quote.client}</strong>
                    </p>
                    <p>
                      <small>Date</small>
                      <strong>
                        {new Intl.DateTimeFormat(business.regional.locale, {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                          timeZone: business.regional.timezone,
                        }).format(new Date())}
                      </strong>
                    </p>
                  </div>
                </section>
              )}

              <section
                className={styles.acceptance}
                aria-label="Customer acceptance"
              >
                <h2>Customer acceptance</h2>
                <CustomerAcceptance
                  token={token}
                  clientName={quote.client}
                  today={new Intl.DateTimeFormat(business.regional.locale, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    timeZone: business.regional.timezone,
                  }).format(new Date())}
                  quoteUpdatedAt={quote.updatedAt}
                  approved={approved}
                  acceptance={view.acceptance}
                  businessName={business.profile.name}
                  locale={business.regional.locale}
                  timeZone={business.regional.timezone}
                  onsite={onsite}
                />
              </section>

              <footer className={styles.footer}>
                <span>
                  {business.profile.website
                    ? new URL(business.profile.website).host
                    : business.profile.name}
                  &nbsp; | &nbsp;
                  {quote.preparedBy || business.profile.name}&nbsp; | &nbsp;
                  {quote.preparedByPhone || business.profile.phone}
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
            business={business}
            onsite={onsite}
            schedule={source.schedule}
          />
        )}
      </div>
    </div>
  );
}
