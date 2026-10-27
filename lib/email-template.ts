type EmailContent = {
  preheader: string;
  title: string;
  message: string;
  /** CID in delivered mail; a data URI may be used for local previews. */
  logoSrc?: string;
  business?: { name: string; website: string; email: string; phone: string };
  action?: {
    label: string;
    url: string;
    note?: string;
    secondary?: { label: string; url: string };
  };
};

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function paragraphs(message: string) {
  return message
    .trim()
    .split(/\n\s*\n/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 18px;color:#263b49;font-size:16px;line-height:1.7;">${escapeEmailHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

/** Shared email layout. Inline styles and tables keep it readable in Gmail and Outlook. */
export function renderPremiumEmail(content: EmailContent) {
  const business = content.business || {
    name: "Premium Remodel",
    website: "https://premiumremodel.com",
    email: "contact@premiumremodel.com",
    phone: "(919) 454-4012",
  };
  const logoSrc =
    content.logoSrc === undefined
      ? "cid:premium-remodel-logo"
      : content.logoSrc;
  const linkStyle = "color:#286fae;text-decoration:underline;";
  const phoneDigits = business.phone.replace(/\D/g, "");
  const phoneHref =
    phoneDigits.length >= 7
      ? `tel:+${phoneDigits.length === 10 ? `1${phoneDigits}` : phoneDigits}`
      : "";
  const footerLinks = [
    business.phone
      ? `<td class="footer-link" align="left" style="padding-top:16px;font-size:12px;line-height:1.6;white-space:nowrap;">${phoneHref ? `<a href="${phoneHref}" style="${linkStyle}">${escapeEmailHtml(business.phone)}</a>` : escapeEmailHtml(business.phone)}</td>`
      : "",
    business.email
      ? `<td class="footer-link" align="center" style="padding-top:16px;font-size:12px;line-height:1.6;white-space:nowrap;"><a href="mailto:${escapeEmailHtml(business.email)}" style="${linkStyle}">${escapeEmailHtml(business.email)}</a></td>`
      : "",
    business.website
      ? `<td class="footer-link" align="right" style="padding-top:16px;font-size:12px;line-height:1.6;white-space:nowrap;"><a href="${escapeEmailHtml(business.website)}" style="${linkStyle}">${escapeEmailHtml(new URL(business.website).host)}</a></td>`
      : "",
  ].join("");
  const footer = `<tr><td style="background:#ffffff;padding:0 44px 34px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;width:100%;border-top:1px solid #d5e0e6;"><tr>${footerLinks}</tr></table></td></tr>`;
  if (content.action && !/^https?:\/\//i.test(content.action.url))
    throw new Error("Email action must use an HTTP URL.");
  if (
    content.action?.secondary &&
    !/^https?:\/\//i.test(content.action.secondary.url)
  )
    throw new Error("Email action must use an HTTP URL.");
  const action = content.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 18px;"><tr><td style="background:#2f7cc7;border-radius:6px;"><a href="${escapeEmailHtml(content.action.url)}" style="display:inline-block;padding:14px 22px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">${escapeEmailHtml(content.action.label)}</a></td></tr></table>${content.action.note ? `<p style="margin:0;color:#62727d;font-size:13px;line-height:1.6;">${escapeEmailHtml(content.action.note)}</p>` : ""}${content.action.secondary ? `<p style="margin:10px 0 0;font-size:13px;line-height:1.6;"><a href="${escapeEmailHtml(content.action.secondary.url)}" style="color:#286fae;text-decoration:underline;">${escapeEmailHtml(content.action.secondary.label)}</a></p>` : ""}`
    : "";
  const brand = logoSrc
    ? `<img src="${escapeEmailHtml(logoSrc)}" width="228" height="65" alt="${escapeEmailHtml(business.name)}" style="display:block;width:228px;max-width:100%;height:auto;border:0;color:#183244;font-size:17px;font-weight:bold;">`
    : `<strong style="color:#183244;font-size:22px;line-height:1.3;">${escapeEmailHtml(business.name)}</strong>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeEmailHtml(content.title)}</title><style>@media only screen and (max-width:480px){.footer-link{display:block!important;width:100%!important;text-align:left!important;padding-top:8px!important;white-space:normal!important}.footer-link:first-child{padding-top:16px!important}}</style></head><body style="margin:0;padding:0;background:#f6f5f1;color:#183244;font-family:Arial,Helvetica,sans-serif;"><div style="display:none;font-size:1px;line-height:1px;color:#f6f5f1;max-height:0;opacity:0;overflow:hidden;">${escapeEmailHtml(content.preheader)}</div><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#f6f5f1;"><tr><td align="center" style="padding:32px 16px 48px;"><table role="presentation" cellpadding="0" cellspacing="0" width="600" style="border-collapse:collapse;width:100%;max-width:600px;"><tr><td style="background:#ffffff;border-bottom:3px solid #e2e7e9;padding:24px 34px;">${brand}</td></tr><tr><td style="background:#ffffff;padding:42px 44px 38px;"><h1 style="margin:0 0 22px;color:#183244;font-size:30px;line-height:1.2;font-weight:600;letter-spacing:-.6px;">${escapeEmailHtml(content.title)}</h1>${paragraphs(content.message)}${action}</td></tr>${footer}</table></td></tr></table></body></html>`;
  const actionText = content.action
    ? `\n\n${content.action.label}: ${content.action.url}${content.action.note ? `\n${content.action.note}` : ""}${content.action.secondary ? `\n${content.action.secondary.label}: ${content.action.secondary.url}` : ""}`
    : "";
  const text = `${content.title}\n\n${content.message.trim()}${actionText}\n\n${[business.phone, business.email, business.website].filter(Boolean).join("\n")}`;
  return { html, text };
}

export function renderQuoteEmail(input: {
  message: string;
  logoSrc?: string;
  portalUrl?: string;
  organizationId?: string;
  business?: EmailContent["business"];
}) {
  return renderPremiumEmail({
    preheader: "Your quote is attached and available in the client portal.",
    title: "Your project quote",
    message: input.message,
    logoSrc: input.logoSrc,
    business: input.business,
    action: input.portalUrl
      ? {
          label: "View your quote in the portal",
          url: input.portalUrl,
          note: "This private email link is valid for 30 days.",
          secondary: {
            label: "Need a new link? Sign in by email",
            url: (() => {
              const url = new URL("/client/sign-in", input.portalUrl);
              if (input.organizationId)
                url.searchParams.set("org", input.organizationId);
              return url.toString();
            })(),
          },
        }
      : undefined,
  });
}

/** Transactional acknowledgement for a submitted website lead. */
export function renderLeadAcknowledgement(input: {
  firstName?: string;
  logoSrc?: string;
}) {
  const greeting = input.firstName ? `Hi ${input.firstName},` : "Hello,";
  return renderPremiumEmail({
    preheader: "We received your remodel request.",
    title: "We received your remodel request",
    message: `${greeting}\n\nThanks for reaching out to Premium Remodel. We received your remodel request and will review the details before following up about next steps.\n\nIf there is anything else we should know, you can reply directly to this email.\n\nThanks,\nPremium Remodel Team`,
    logoSrc: input.logoSrc,
  });
}
