import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  escapeEmailHtml,
  renderLeadAcknowledgement,
  renderQuoteEmail,
} from "../lib/email-template";

const logo = await readFile(
  path.join(process.cwd(), "public", "images", "logo.png"),
);
const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

const quote = renderQuoteEmail({
  message:
    "Hi Alex,\n\nThank you for inviting us to look at your bathroom project. Your quote is attached for review.\n\nIf you have questions about the scope or would like to discuss the next step, just reply to this email.\n\nThanks,\nPremium Remodel Team",
  logoSrc,
});
const lead = renderLeadAcknowledgement({
  firstName: "Alex",
  logoSrc,
});

const frame = (title: string, subtitle: string, html: string, narrow = false) =>
  `<section class="sample${narrow ? " narrow" : ""}"><div class="sample-head"><div><span class="eyebrow">${escapeEmailHtml(subtitle)}</span><h2>${escapeEmailHtml(title)}</h2></div><span class="sample-tag">${narrow ? "Mobile" : "Desktop"}</span></div><iframe title="${escapeEmailHtml(title)}" srcdoc="${escapeEmailHtml(html)}" onload="this.style.height='1px';this.style.height=this.contentDocument.documentElement.scrollHeight+'px'"></iframe></section>`;

const preview = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Premium Remodel — Email system preview</title><style>*{box-sizing:border-box}body{margin:0;background:#edf1f2;color:#183244;font-family:Arial,Helvetica,sans-serif}.intro{max-width:1300px;margin:auto;padding:48px 28px 30px}.eyebrow{color:#427ca7;text-transform:uppercase;letter-spacing:2px;font-size:11px;font-weight:700}h1{font-size:44px;line-height:1.1;letter-spacing:-1.5px;margin:12px 0 15px}p{color:#546a76;line-height:1.65;max-width:690px;margin:0}.grid{max-width:1300px;margin:auto;padding:0 28px 60px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:start}.sample{min-width:0;background:white;border:1px solid #d9e2e6}.sample-head{display:flex;justify-content:space-between;align-items:start;padding:22px 24px;border-bottom:1px solid #d9e2e6}h2{font-size:18px;margin:6px 0 0}.sample-tag{font-size:11px;color:#607a88;background:#eef4f6;padding:7px 10px}.sample iframe{display:block;border:0;width:100%;height:760px;background:#f6f5f1}.sample.narrow iframe{max-width:390px;margin:auto;border-left:1px solid #d9e2e6;border-right:1px solid #d9e2e6}.notes{max-width:1300px;margin:auto;padding:0 28px 60px;color:#546a76;font-size:14px;line-height:1.6}.notes strong{color:#183244}@media(max-width:900px){.grid{grid-template-columns:1fr}.intro{padding-top:32px}h1{font-size:34px}}</style></head><body><div class="intro"><span class="eyebrow">Premium Remodel · Email direction</span><h1>Clear notes, beautifully sent.</h1><p>One reusable layout for messages around a project. Quote emails attach the generated PDF, and website lead submissions receive the same branded acknowledgement regardless of project type.</p></div><div class="grid">${frame("Sending a quote", "01 · Quote email", quote.html)}${frame("Lead acknowledgement", "02 · Website lead", lead.html)}${frame("Quote on a phone", "03 · Responsive check", quote.html, true)}${frame("Lead on a phone", "04 · Responsive check", lead.html, true)}</div><div class="notes"><strong>Design choices.</strong> White logo header with a quiet divider, warm paper background, a clean three-link contact row, and a plain-text version for every message. The sent quote email embeds the logo so it does not depend on a remote image.</div></body></html>`;

await writeFile(
  path.join(process.cwd(), "docs", "email-template-preview.html"),
  preview,
);
