import { expect, test } from "@playwright/test";
import {
  renderLeadAcknowledgement,
  renderQuoteEmail,
} from "../lib/email-template";

const premiumBusiness = {
  name: "Premium Remodel",
  website: "https://premiumremodel.com",
  email: "contact@premiumremodel.com",
  phone: "(919) 454-4012",
};

test("quote message remains readable in both formats and escapes customer text", () => {
  const email = renderQuoteEmail({
    message:
      'Hi Alex,\n\nPlease review <the scope> & reply. <script>alert("x")</script>',
    portalUrl: "https://servicebuddy-ui.vercel.app/client/private-link/quote",
    business: premiumBusiness,
  });

  expect(email.html).toContain("Please review &lt;the scope&gt; &amp; reply.");
  expect(email.html).toContain(
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
  );
  expect(email.html).not.toContain("<script>alert");
  expect(email.html).toContain('src="cid:servicebuddy-business-logo"');
  expect(email.html).toContain(
    "background:#ffffff;border-bottom:3px solid #e2e7e9",
  );
  expect(email.text).toContain("Please review <the scope> & reply.");
  expect(email.html).toContain("View your quote in the portal");
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
  const email = renderLeadAcknowledgement({
    firstName: "Walker",
    business: premiumBusiness,
  });
  expect(email.text).toContain(
    "We received your remodel request and will review",
  );
  expect(email.html).toContain("We received your remodel request");
  expect(email.text).not.toContain("bathroom remodel request");
  expect(email.text).not.toContain("undefined");
  expect(email.text).toContain("Thanks,\nPremium Remodel Team");
  expect(email.text).toContain("contact@premiumremodel.com");
});

test("lead acknowledgement uses organization-owned identity", () => {
  const email = renderLeadAcknowledgement({
    firstName: "Alex",
    business: {
      name: "North Star Renovations",
      website: "https://northstar.example",
      email: "hello@northstar.example",
      phone: "(555) 010-2020",
    },
  });
  expect(email.text).toContain(
    "Thanks for reaching out to North Star Renovations",
  );
  expect(email.text).toContain("North Star Renovations Team");
  expect(email.text).toContain("hello@northstar.example");
  expect(email.text).not.toContain("Premium Remodel");
  expect(email.html).not.toContain("premiumremodel.com");
});
