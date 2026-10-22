import { expect, test } from "@playwright/test";
import {
  renderLeadAcknowledgement,
  renderQuoteEmail,
} from "../lib/email-template";

test("quote message remains readable in both formats and escapes customer text", () => {
  const email = renderQuoteEmail({
    message:
      'Hi Alex,\n\nPlease review <the scope> & reply. <script>alert("x")</script>',
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
  expect(email.html).not.toContain("Attached for your review");
  expect(email.html).not.toContain("Quote 130.pdf");
  expect(email.html).not.toContain("premiumremodel.com");
  expect(email.text).not.toContain("premiumremodel.com");
});

test("lead acknowledgement uses the same remodel wording for every lead", () => {
  const email = renderLeadAcknowledgement({ firstName: "Walker" });
  expect(email.text).toContain(
    "We received your remodel request and will review",
  );
  expect(email.html).toContain("We received your remodel request");
  expect(email.text).not.toContain("bathroom remodel request");
  expect(email.text).not.toContain("undefined");
});
