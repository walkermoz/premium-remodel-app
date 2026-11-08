# ServiceBuddy product learning loop

## Outcome

ServiceBuddy should continuously learn what to build next, turn evidence into
implementation-ready specifications, and measure whether shipped work improved
the business. It should not autonomously rewrite itself or deploy unreviewed
changes.

The product loop has one purpose: help ServiceBuddy reach and then exceed the
core operating quality of Jobber, the operational depth of ServiceTitan, and the
growth leverage of Topline Pro while preserving ServiceBuddy's differentiators:
modular workflows, organization-owned configuration, flexible quoting and
agreements, and strong tenant isolation.

Premium Remodel remains the regression tenant. Product improvements may be
offered to it, but its saved behavior must not silently change.

## Product principles

1. **Evidence before backlog.** Ideas enter a discovery queue, not an automatic
   build queue.
2. **Ask high-value questions.** The system asks only when an answer changes the
   proposed behavior, priority, or risk. It does not create constant noise.
3. **Specify against the current platform.** Every proposal must name the
   records, events, permissions, modules, connections, screens, workflows, and
   customer-facing surfaces it affects.
4. **Configuration before forks.** Organization-specific behavior belongs in
   settings, templates, workflow definitions, or registered capabilities.
5. **Human approval at consequential gates.** AI may draft research, specs,
   tests, prototypes, and pull requests. A permissioned person approves the
   problem, specification, release candidate, and production rollout.
6. **Measure the outcome.** A feature is not complete until its adoption,
   business outcome, reliability, and support burden can be observed.
7. **Prefer coherent journeys over feature count.** Parity is judged by whether
   a contractor can complete the job, not whether a checkbox exists.

## The loop

### 1. Listen

Collect product signals from:

- Discord ideas, replies, reactions, and decisions
- In-app feedback tied to the current screen and object
- Support problems and onboarding blockers
- Workflow failures, setup gaps, and repeated manual work
- Product analytics and funnel drop-off
- Sales objections and lost-deal reasons
- Competitor research using dated, source-linked evidence
- Regression findings and security or compliance incidents

Each signal stores its source, author, organization, affected object or screen,
date, privacy classification, and a link back to the original evidence.

### 2. Understand

The system deduplicates related signals into an **Opportunity**. It summarizes
the user problem, identifies affected personas and workflows, and separates the
requested solution from the underlying need.

The system may ask a focused Discord question when uncertainty is material. A
question must include why the answer matters and the concrete alternatives it
changes. The default question budget is:

- no more than one unsolicited question per active opportunity per day;
- no more than three open questions on one opportunity;
- bundle low-priority questions into a weekly digest;
- interrupt immediately only for a production regression, security issue, or a
  decision blocking already-approved work.

### 3. Compare

Maintain a versioned capability map with four statuses:

- **Missing:** no usable end-to-end path exists.
- **Partial:** foundations exist, but the journey is incomplete or confusing.
- **Competitive:** the normal journey is complete, tested, and measurable.
- **Differentiated:** ServiceBuddy materially reduces work or increases results
  beyond the comparison products.

Competitor evidence expires after 90 days unless reconfirmed. Marketing claims
and observed product behavior are labeled separately.

### 4. Specify

Every candidate feature becomes a versioned **Feature Spec** using the standard
contract below. The spec generator reads the current ServiceBuddy capability
registry and repository map before proposing integration points.

### 5. Decide

Score candidates on a 0-5 scale:

- user pain and frequency;
- strategic fit;
- revenue, retention, or cost impact;
- workflow leverage across organizations;
- competitor gap;
- evidence confidence;
- implementation effort;
- operational, privacy, compliance, and migration risk.

The first six factors increase priority. Effort and risk reduce it. The score is
decision support, not an automatic approval.

### 6. Build safely

An approved spec can produce a prototype or a code branch. Generated work must:

- remain organization-scoped;
- use existing domain objects or explicitly propose a reusable new object;
- preserve Premium Remodel through characterization tests;
- add authorization, tenant-isolation, migration, rollback, and audit coverage;
- pass lint, typecheck, build, unit/integration tests, and relevant Playwright
  journeys;
- never access production secrets from the planning model;
- never deploy itself.

### 7. Release and learn

Release behind an organization-aware feature flag when risk warrants it. Start
with an internal or synthetic organization, then Premium Remodel only after its
regression journey passes. Record the release, exposed organizations, owner,
rollback path, and expected metrics.

The system compares the result with the spec's success criteria and sends a
short Discord follow-up: keep, adjust, expand, or roll back. Findings become new
evidence in the next loop.

## Standard feature spec object

Every feature spec must contain:

1. **Problem:** who is struggling, what they are trying to accomplish, and the
   current workaround.
2. **Evidence:** linked feedback, observed funnel data, support history, and
   dated competitor references.
3. **Outcome:** the measurable behavior or business result to improve.
4. **Users and permissions:** roles that can configure, execute, view, approve,
   or audit it.
5. **Current journey:** how the task works today across web, field app, client
   portal, email, SMS, PDF, and automation.
6. **Proposed journey:** normal path plus empty, loading, invalid, offline,
   blocked-connection, permission-denied, and recovery states.
7. **Domain objects:** records created or changed, ownership rules, lifecycle,
   history, deletion, and tenant boundaries.
8. **Events and automations:** emitted events, available triggers/actions,
   idempotency, retries, blocked-run behavior, and audit history.
9. **Configuration:** organization defaults, templates, modules, feature flags,
   and what remains platform policy.
10. **Connections:** required providers, setup state, degraded behavior, secret
    references, and data shared externally.
11. **Interfaces:** APIs, webhooks, import/export, mobile behavior, accessibility,
    and regional formatting.
12. **Data transition:** schema migration, backfill, compatibility, rollback,
    and Premium Remodel's exact saved default.
13. **Security and compliance:** authorization, isolation, consent, retention,
    privacy, abuse cases, and audit events.
14. **Observability:** product events, outcome metrics, reliability measures,
    alerts, and support diagnostics.
15. **Acceptance:** executable user journeys and regression tests.
16. **Non-goals:** adjacent work intentionally excluded.
17. **Rollout:** prototype, staging, pilot, production, rollback owner, and
    decision dates.

No spec can be marked ready when an affected surface is silently omitted.

## Discord product council

Use a Discord application with signed interactions, not a bot that passively
scrapes every message. The process uses exactly three channels.

### 1. Ideas channel

The product bot posts one recommendation batch containing **exactly four
recommendations**. Each recommendation includes:

- the user problem and affected workflow;
- the evidence and competitor gap;
- the proposed outcome and a short integration outline;
- expected value, effort, risk, and confidence;
- a link to the full draft specification;
- **Approve to build**, **Ask a question**, **Park**, and **Reject** actions.

Recommendations may also originate from `/idea` or from the **Create
opportunity** action on an existing Discord message. They join the evidence pool
for a future batch; they do not skip ranking or specification.

Approval in Ideas means: **the problem and specification are approved, and the
system is authorized to create an implementation branch and pull request.** It
does not authorize merge or production deployment.

Once a recommendation is approved:

1. Lock the approved specification version.
2. Create the implementation work item and dedicated branch.
3. Implement the feature and its required migration, permission, audit,
   compatibility, and observability work.
4. Add unit, integration, isolation, and relevant Playwright journey tests.
5. Run the full required CI suite.
6. Create a pull request linked to the approved specification and Discord
   decision.
7. Create a protected preview deployment using non-production data and
   credentials.
8. Post the completed review packet in the Approval channel.

A new recommendation batch is posted on the configured cadence only when the
previous batch has no unresolved urgent question. Unselected recommendations
remain in the opportunity backlog and may be rescored for a later batch.

### 2. Approval channel

The Approval channel contains implementation-ready pull requests, not raw
ideas. Each review packet must include:

- feature name and approved spec version;
- implementation summary and explicit non-goals;
- pull request and commit links;
- preview URL with expiration and test-account instructions;
- screenshots or recordings of affected desktop, mobile, field-app, and portal
  surfaces when applicable;
- tests added and the result of every required check;
- migrations, backfills, feature flags, and Premium Remodel compatibility;
- permissions, tenant-isolation, security, compliance, and accessibility notes;
- known limitations, rollout cohort, production verification, and rollback
  procedure;
- **Approve merge**, **Request changes**, and **Reject** actions.

Approval here means: **merge this exact reviewed commit when all required checks
remain green.** Any new commit after approval invalidates the approval and posts
an updated review packet. A permissioned reviewer must approve again.

The merge worker verifies the approving Discord identity, required role, PR head
SHA, checks, unresolved review threads, migration state, preview health, and
branch protection. It then merges through the normal repository mechanism. It
does not call a production deployment endpoint directly.

### 3. Existing CI/CD channel

The existing CI/CD channel remains the authoritative release feed. It receives:

- PR checks started, failed, or passed;
- preview deployment created or failed;
- approval invalidated because the PR changed;
- merge started and merge completed;
- production migration started and completed;
- production deployment started, ready, or failed;
- production smoke and critical-journey results;
- rollback started and completed;
- links to the PR, deployment, workflow run, and release record.

The CI/CD channel reports what happened; it does not become a third product
approval gate. Production is successful only after deployment readiness and the
defined smoke/regression checks pass. A failed verification automatically stops
the rollout or invokes the approved rollback procedure and alerts the Approval
channel.

Natural-language replies are attached as evidence, summarized, and quoted only
within the contributor's authorized product context. Discord is a discussion
surface; ServiceBuddy remains the system of record for recommendations, specs,
decisions, PR bindings, releases, and audit history.

## Cadence

- **Immediately:** ingest a new idea, acknowledge it, link duplicates, and ask a
  question only if the submitter is already engaged.
- **Nightly:** cluster signals, refresh opportunity confidence, identify broken
  journeys, and draft updates. No releases.
- **Recommendation cadence:** post four ranked recommendations at a time in the
  Ideas channel. Weekly is the safe default; an administrator may choose a
  different cadence without allowing overlapping recommendation floods.
- **Twice weekly:** post up to three high-value discovery questions only when
  answers will improve the next recommendation batch or approved work.
- **Weekly:** include a short digest under the four recommendations covering new
  evidence, parked work, measured releases, and competitor deltas.
- **After every release:** monitor reliability immediately and review product
  outcomes at 7 and 30 days.
- **Quarterly:** refresh the capability benchmark and retire stale assumptions.

## Platform architecture

### Records

- `product_signals`
- `product_opportunities`
- `product_opportunity_signals`
- `product_recommendation_batches` and `product_recommendations`
- `product_questions` and `product_answers`
- `product_spec_versions`
- `product_decisions`
- `product_builds` and `product_pull_requests`
- `product_preview_deployments`
- `product_experiments`
- `product_metric_definitions` and `product_metric_results`
- `competitor_capabilities` and `competitor_evidence`
- `product_release_links`
- `product_discord_channels` and `product_discord_messages`

Platform product records are separate from organization business records.
Organization feedback may reference an organization, but generated research must
not expose one tenant's customer data to another tenant.

### Services

1. **Signal ingest:** validates Discord signatures or authenticated in-app
   submissions and normalizes metadata.
2. **Privacy scrubber:** removes credentials and minimizes customer identifiers
   before model use.
3. **Opportunity clusterer:** suggests duplicates and themes; a human can split
   or merge them.
4. **Capability graph:** describes ServiceBuddy objects, modules, permissions,
   events, connections, surfaces, and known dependencies.
5. **Spec composer:** produces a structured draft and an integration impact map.
6. **Evaluation runner:** checks completeness, contradictions, tenant safety,
   Premium Remodel compatibility, and testability.
7. **Discord interaction adapter:** posts questions, approvals, and digests and
   records signed interaction results.
8. **Recommendation scheduler:** selects four non-duplicate, evidence-backed
   recommendations and maintains one active batch in the Ideas channel.
9. **Delivery adapter:** creates a dedicated branch and pull request only after
   Ideas approval, then binds the exact spec version and approval event.
10. **Preview and review packager:** waits for required checks, creates the
    protected preview, gathers artifacts, and posts the Approval packet.
11. **Merge gate:** verifies the approved PR head SHA and repository protections
    before merging after Approval-channel authorization.
12. **CI/CD relay:** mirrors build, merge, migration, production verification,
    and rollback states into the existing CI/CD channel.
13. **Outcome monitor:** compares shipped metrics with the approved spec.

### Model boundary

The model can read approved product metadata, redacted evidence, repository
structure, test results, and source-linked competitor research. After Ideas
approval, it can create draft records, a branch, implementation commits, tests,
and a pull request. It cannot read production secrets, alter approval history,
bypass tenant permissions, approve its own PR, merge a changed commit under an
old approval, apply production migrations directly, enable production flags, or
deploy outside the normal approved CI/CD path.

## Competitive direction

### Jobber lane: effortless daily operations

Prioritize the polish and completeness of booking, recurring work, scheduling,
dispatch, route awareness, time tracking, quote follow-up, invoicing, reminders,
payments, and client self-service. ServiceBuddy should need fewer clicks and
fewer explanations for the ordinary small-service-business day.

### ServiceTitan lane: operational depth

Build toward capacity-aware dispatch, equipment and property history,
memberships/service agreements, purchasing and inventory, budget-versus-actual
job costing, progress billing, advanced reporting, call handling, and accounting
integration. These should be modular capabilities rather than a mandatory
enterprise interface for every business.

### Topline Pro lane: growth that happens for the contractor

Connect lead response, AI-assisted qualification, website and local presence,
Google reviews, project showcases, social content, quote assistance, invoice
follow-up, and payments into a measurable growth loop. The standard is not an AI
button; it is completed work with clear review and control.

### ServiceBuddy differentiation

- Workflow composition across every major object instead of fixed automation
  recipes.
- Cost-first quoting, flexible price books, contractor-specific costs, and
  modular agreement/signature packets.
- Organization-configurable modules, branding, permissions, integrations, and
  onboarding without code forks.
- Field capture including photos, measurements, room scans, and reusable project
  evidence connected to quoting and delivery.
- Transparent runs, approvals, data bindings, and audit history rather than
  invisible AI behavior.

## Recommended first 90 days

### Phase 1: product intelligence foundation

- Add Product Lab records and capability graph.
- Add Discord `/idea`, message-to-opportunity, spec thread, and weekly digest.
- Add the standard spec renderer and approval history.
- Instrument the core lead-to-payment journey.
- Baseline Premium Remodel's critical regression journeys.

### Phase 2: close the highest-friction core gaps

- Use observed funnel data to choose between online booking/dispatch, recurring
  work/time tracking, and invoice/reminder improvements.
- Complete one end-to-end journey before starting the next.
- Pilot through organization flags and measure time saved and completion rate.

### Phase 3: growth and operational depth

- Add the highest-value Topline-style growth loop from the evidence, likely
  review/showcase automation or AI-assisted lead qualification.
- Start one ServiceTitan-depth module only after the core small-business journey
  is measurably reliable.

## Success measures

Track product outcomes by organization and cohort without exposing customer
content:

- median lead response time;
- lead-to-consultation and consultation-to-quote conversion;
- quote creation time, send rate, acceptance rate, and time to acceptance;
- signed-document and deposit completion rate;
- schedule fill rate, travel time, and on-time arrival where applicable;
- invoice creation delay, days to payment, and overdue balance;
- estimated-versus-actual gross margin variance;
- weekly active office and field users;
- feature adoption and successful journey completion;
- workflow blocked-run and retry rate;
- errors, regressions, support contacts, and rollback frequency;
- AI suggestion acceptance, edit distance, and reversal rate.

## Guardrails

- No autonomous production deployment.
- No automatically accepted product or legal decision.
- No competitor scraping that violates access controls or terms.
- No customer message, contract, or private record in product research unless it
  is authorized, minimized, and access controlled.
- No cross-tenant training corpus.
- No metric optimization without a paired quality or safety measure.
- No silent updates to published workflows, templates, permissions, or Premium
  Remodel defaults.
- Every AI output shows its evidence, uncertainty, model/version, and human
  decision history.

## First implementation slice

Build the three-channel path in two controlled milestones.

### Milestone A: recommendations and specification approval

1. Register the Ideas, Approval, and existing CI/CD channel IDs in secure
   platform configuration.
2. Verify signed Discord interactions and map Discord identities to ServiceBuddy
   platform-product roles.
3. Add signal, opportunity, recommendation-batch, question, spec-version, and
   decision records.
4. Seed a capability graph from current ServiceBuddy modules and domain objects.
5. Generate and post exactly four recommendations with the standard actions.
6. Lock the spec version when **Approve to build** is used.

Milestone A is complete when four evidence-backed recommendations can be
reviewed in Ideas and one can receive a fully audited approval without changing
the product or repository.

### Milestone B: PR, preview, approval, and release relay

1. Create an isolated branch and implementation run from the approved spec.
2. Require feature implementation, tests, migration/rollback analysis, and
   Premium Remodel regression coverage.
3. Open the PR and protected preview deployment.
4. Post the complete review packet in Approval only after required checks pass.
5. Bind Approval to the exact PR head SHA and invalidate it on any change.
6. Merge through branch protection after **Approve merge**.
7. Relay merge, migration, deployment, production verification, and rollback
   states to the existing CI/CD channel.

Milestone B is complete when an approved idea can safely reach a previewed,
tested PR, receive a separate merge approval, and travel through the existing
CI/CD production process with a complete audit trail. The model never approves
its own work and never bypasses repository or deployment protections.

## Research basis

- Jobber product features: https://www.getjobber.com/features/
- ServiceTitan product features: https://www.servicetitan.com/features
- Topline Pro product and pricing: https://www.toplinepro.com/ and
  https://www.toplinepro.com/pricing
- Discord interactions: https://docs.discord.com/developers/interactions/overview
- NIST AI Risk Management Framework: https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
