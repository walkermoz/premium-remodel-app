# Client quote experience: Jobber review and rollout

## What the supplied Jobber page actually does

The general `/client_hubs/{hub-id}/quotes` URL opens Royal HVAC's email-login screen when no client session exists. The email link supplied afterward contained a signed, expiring login token. Jobber exchanged it for a session and redirected to a URL without the token. The hub UUID identifies the business; the numeric quote ID identifies the quote. Neither should be treated as authorization on its own. The signed token and session are the access controls.

In the authenticated view, the sidebar offered Requests, Quotes, Appointments, Invoices, Wallet, and Contact Us. The Quotes list grouped the available quote under **Awaiting response** and summarized the quote number, sent date, address, deposit, and total. The quote detail had a PDF download, status, customer and address, sent date, product/service descriptions, subtotal, tax, total, deposit, customer message, terms, and **Approve & Pay Deposit** / **Request Changes** actions. Request Changes opened a text form; no response was submitted during this review. These observations describe the supplied Royal HVAC account, not settings that every Jobber business necessarily enables.

Jobber's own [client-hub overview](https://help.getjobber.com/en/articles/what-do-your-clients-see-in-client-hub/) confirms that draft and archived quotes are hidden, that approved quotes remain listed, and that PDF downloads and response actions depend on settings. The [client guide](https://help.getjobber.com/en/articles/a-guide-for-your-clients-how-to-navigate-client-hub/) describes quote approvals, change requests, and required deposits.

## What Premium Remodel has now

The project-update portal already uses a cryptographically random UUID plus an HMAC signature, checks the signing secret and revocation on every request, and records link views. The UUID has roughly 122 random bits; the signature prevents a guessed or edited ID from becoming a valid link. It is an unguessable bearer link, however, rather than Jobber's email-verified client session. A person who receives the link can forward it.

This change extends that system with a separate **quote** link type. Admins can create, copy, preview, replace, and disable a link from the quote dashboard. Only sent quotes are shareable. The link captures a published quote version, so later price edits do not silently rewrite what the client saw; replacing the link publishes a revised version. The client view shows the quote's number, status, client/address, grouped scope rows, quoted prices, total, customer-facing notes, and PDF. It omits subcontractor and material costs, internal notes, and files. A converted quote continues to display as approved, and its link can be managed from the resulting project. Project-update tokens cannot be used to read quote prices, and quote tokens cannot open the project-update page.

This first slice stays local until migration and release. It does **not** change quote emails or automate approval or deposit collection.

## Recommended next releases

1. **Delivery and identity.** Generate a client quote link as part of the email-send transaction and include a clear **View quote** button while retaining the PDF attachment. For a Jobber-level access model, send an expiring, single-use email login link, exchange it for a short-lived HttpOnly session, remove the token from the browser URL, and show all quotes tied to that verified email. Rate-limit requests and revoke sessions when access is removed. The current quote URL uses `no-referrer` and `no-store` but remains a bearer URL.
2. **Responses.** Add a customer change-request form, store the message and quote version, notify the dashboard, and show **Changes requested** without deleting the quote. Add approval only after the customer-facing terms and signature/name requirement are agreed. Record the exact quote version, response time, and acceptance evidence before converting it to a project.
3. **Money.** Add structured tax and deposit fields to the quote model; calculate and display them consistently in the grid, PDF, email, and client page. Connect an approved deposit to the existing Stripe payment flow with webhook-confirmed payment state. Do not infer a deposit from free-text notes.
4. **Hub breadth.** Once client identity exists, add a quote list grouped by awaiting/approved, then appointments and invoices. Requests and stored payment methods should be separate product decisions; the current dashboard does not yet provide the same client-facing records or wallet behavior as Jobber.

Before the approval release, decide whether Premium Remodel requires a typed name, drawn signature, or both, and which terms are shown at acceptance. Before the deposit release, decide whether amounts are fixed, percentage-based, or optional by quote.
