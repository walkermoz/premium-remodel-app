type EmailContent = {
  preheader: string;
  title: string;
  message: string;
  /** CID in delivered mail; a data URI may be used for local previews. */
  logoSrc?: string;
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
  const logoSrc = content.logoSrc || "cid:premium-remodel-logo";
  const footer = `<tr><td align="center" style="background:#f0f1f1;padding:22px 24px;color:#697880;font-size:12px;line-height:1.7;"><strong style="color:#546773;">Premium Remodel</strong><br><a href="tel:+19194544012" style="color:#3178bd;text-decoration:underline;">(919) 454-4012</a><br><a href="mailto:contact@premiumremodel.com" style="color:#3178bd;text-decoration:underline;">contact@premiumremodel.com</a><br><a href="https://premiumremodel.com" style="color:#3178bd;text-decoration:underline;">premiumremodel.com</a></td></tr>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeEmailHtml(content.title)}</title></head><body style="margin:0;padding:0;background:#f6f5f1;color:#183244;font-family:Arial,Helvetica,sans-serif;"><div style="display:none;font-size:1px;line-height:1px;color:#f6f5f1;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeEmailHtml(content.preheader)}</div><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#f6f5f1;"><tr><td align="center" style="padding:32px 16px 48px;"><table role="presentation" cellpadding="0" cellspacing="0" width="600" style="border-collapse:collapse;width:100%;max-width:600px;"><tr><td style="background:#ffffff;border-bottom:3px solid #e2e7e9;padding:24px 34px;"><img src="${escapeEmailHtml(logoSrc)}" width="228" height="65" alt="Premium Remodel" style="display:block;width:228px;max-width:100%;height:auto;border:0;color:#183244;font-size:17px;font-weight:bold;"></td></tr><tr><td style="background:#ffffff;padding:42px 44px 38px;"><h1 style="margin:0 0 22px;color:#183244;font-size:30px;line-height:1.2;font-weight:600;letter-spacing:-.6px;">${escapeEmailHtml(content.title)}</h1>${paragraphs(content.message)}</td></tr>${footer}</table></td></tr></table></body></html>`;
  const text = `${content.title}\n\n${content.message.trim()}\n\nPremium Remodel\n(919) 454-4012\ncontact@premiumremodel.com\npremiumremodel.com`;
  return { html, text };
}

export function renderQuoteEmail(input: { message: string; logoSrc?: string }) {
  return renderPremiumEmail({
    preheader: "Your Premium Remodel quote is attached for review.",
    title: "Your project quote",
    message: input.message,
    logoSrc: input.logoSrc,
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
