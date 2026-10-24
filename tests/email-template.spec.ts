import { expect, test } from "@playwright/test";
import {
  renderLeadAcknowledgement,
  renderQuoteEmail,
} from "../lib/email-template";

test("quote message remains readable in both formats and escapes customer text", () => {
  const email = renderQuoteEmail({
    message:
      'Hi Alex,\n\nPlease review <the scope> & reply. <script>alert("x")</script>',
    portalUrl: "https://servicebuddy-ui.vercel.app/client/private-link/quote",
  });

  expect(email.html).toContain("Please review &lt;the scope&gt; &amp; reply.");
  expect(email.html).toContain(
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
  );
  expect(email.html).not.toContain("<script>alert");
  expect(email.html).toContain('src="cid:premium-remodel-logo"');
  expect(email.html).toContain(
    "background:#ffffff;border-bottom:3px solid #e2e7e9",
  );
  expect(email.text).toContain("Please review <the scope> & reply.");
  expect(email.html).toContain("Open your quote");
  expect(email.html).toContain(
    'href="https://servicebuddy-ui.vercel.app/client/private-link/quote"',
  );
  expect(email.text).toContain("This private email link is valid for 30 days");
  expect(email.html).toContain(
    'href="https://servicebuddy-ui.vercel.app/client/sign-in"',
  );
  expect(email.html).not.toContain("Attached for your review");
  expect(email.html).not.toContain("Quote 130.pdf");
  expect(email.html).toContain('href="tel:+19194544012"');
  expect(email.html).toContain('href="mailto:contact@premiumremodel.com"');
  expect(email.html).toContain('href="https://premiumremodel.com"');
  expect(email.html).toContain("border-top:1px solid #d5e0e6");
  expect(email.html).not.toContain("background:#f0f1f1");
  expect(email.text).toContain("(919) 454-4012");
  expect(email.text).not.toContain("\n\nPremium Remodel\n");
});

test("lead acknowledgement uses the same remodel wording for every lead", () => {
  const email = renderLeadAcknowledgement({ firstName: "Walker" });
  expect(email.text).toContain(
    "We received your remodel request and will review",
  );
  expect(email.html).toContain("We received your remodel request");
  expect(email.text).not.toContain("bathroom remodel request");
  expect(email.text).not.toContain("undefined");
  expect(email.text).toContain("Thanks,\nPremium Remodel Team");
  expect(email.text).toContain("contact@premiumremodel.com");
});
