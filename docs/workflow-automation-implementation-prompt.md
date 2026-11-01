# Premium Remodel workflow automation implementation prompt

Use this prompt to continue or review the workflow-automation project in this repository.

## Objective

Build a production-grade, organization-scoped workflow system for Premium Remodel. Replace workflow-specific orchestration with a visual, versioned decision-tree builder inspired by the strongest HighLevel workflow concepts, while keeping Premium Remodel's language and interface.

The existing Website lead intake and Inbound text compliance flows are the behavioral baseline. Their topology, conditions, mappings, messages, defaults, and enabled actions must be stored as ordinary workflow data and executed by the same generic engine used by future workflows.

## Required preparation

1. Read `AGENTS.md`.
2. Read the relevant Next.js 16 documentation under `node_modules/next/dist/docs/` before changing Next.js code.
3. Read `docs/workflow-automation-architecture.md`.
4. Inspect the current workflow files and migrations instead of assuming framework or database behavior.
5. Preserve unrelated worktree changes.

## Non-negotiable architecture

- Routes emit typed, versioned domain events into an atomic outbox.
- Workflow definitions contain graph semantics; canvas layout is stored separately.
- Published versions are immutable. Every run and wait remains pinned to its enrolled version.
- Node types are registered typed capabilities with Zod configuration schemas and server-side executors. Do not use `eval`, custom JavaScript, or workflow-ID conditionals.
- Normal actions have one continuation. Fan-out requires an explicit Router.
- If/Else runs only the first matching branch in displayed order and always has a fallback.
- Router runs every matching branch sequentially in displayed order and supports Custom, Always, and Fallback branches.
- Waits are durable database records for durations, timestamps, object-relative dates, events, conditions, and event-or-timeout behavior.
- External and mutating actions use stable idempotency keys and claim/complete records.
- Bounded retries use durable wake records. Exhausted work moves to `needs_attention`.
- No serverless execution may depend on an in-memory timer or continuously running process.

## Platform safety policy

SMS consent, recipient ownership, organization-number isolation, and Do Not Disturb are platform rules, not optional workflow logic.

- Every Send SMS node must be immediately protected by a visible System policy gate at publish time.
- The actual sending boundary must independently enforce saved consent and DND so graph editing cannot bypass policy.
- STOP, START, HELP, Twilio signature validation, and message-SID deduplication must preserve current behavior.
- A new website submission must never override DND.
- Ambiguous email or SMS delivery outcomes must not be resent automatically.

## Domain model and context

Use consistent Premium Remodel objects: Organization, Contact, Lead, Quote, Project, Item, Communication, Appointment, Payment, and User. Use “Contact,” not “customer,” for the stored object.

Available workflow values include `trigger.*`, `event.*`, `organization.*`, `contact.*`, `lead.*`, `quote.*`, `project.*`, `item.*`, `actor.*`, and `outputs.<alias>.*`.

Conditions use a safe typed AST with nested AND/OR groups and type-aware comparisons. Text interpolation supports explicit missing-value behavior: blank, fallback, skip, or error.

## Initial capability surface

Support the trigger and action catalog already declared in `lib/workflows/registry.ts`, including Contact/Lead/Quote/Project/Item mutations, communications, notifications, outbound webhooks, workflow enrollment/removal, Wait, If/Else, Router, Go To, and End.

Adding a workflow must require no new route or engine function. Adding a capability should require one registry definition, typed configuration/editor metadata, validation, and one executor handler.

## Builder requirements

Keep the existing Premium Remodel visual system.

- Left: searchable workflows, folders/tags, status filters, create/duplicate/archive.
- Center: readable top-to-bottom tree, add-step controls, branch labels, drag and keyboard movement, collapse, zoom, and Fit workflow.
- Right: selected node/branch/settings inspector with context-aware variables and publish validation.
- Autosave only drafts; publishing is explicit.
- Include undo/redo, versions, restore-as-new-draft, draft-versus-published comparison, dry-run testing, and explainable run history.
- Dry runs never send or mutate anything.

## Preserve current flows

Website lead intake must retain origin and payload validation, submission deduplication/conflict detection, rate limiting, attribution, email-first then phone Contact reuse under concurrency, Lead defaults, independent SMS consent evidence, exact acknowledgement copy, non-fatal delivery failures, Contact communication history, and safe delivery outcomes.

Inbound text compliance must retain verified Twilio account/signature handling, exact whole-message keyword families, Twilio `OptOutType`, organization-scoped DND, START without invented consent, HELP without permission changes, empty TwiML, and message-SID deduplication.

## Security

- Scope all definitions, versions, events, enrollments, runs, steps, waits, and effects by organization.
- Only active administrators can mutate or publish workflows.
- Store connection references, never credentials, in workflow JSON.
- Redact secrets from logs.
- Restrict graph, payload, branch, and message sizes.
- Validate public HTTPS webhook destinations at configuration and execution time, resolve DNS, reject private/reserved addresses, forbid redirects, and send a stable idempotency key.

## Rollout

1. Characterize current behavior.
2. Add schemas, registry, validation, simulator, durable storage, and APIs.
3. Seed current flows from each organization's existing configuration.
4. Run side-effect-free shadow traces against real-shaped events.
5. Compare plans and outcomes with legacy behavior.
6. Enable the generic executor only behind a reversible feature flag.
7. Apply migrations and run organization-isolation/integration tests in a non-production database.
8. Cut over one current flow at a time only after parity is proven.
9. Remove legacy orchestration only after production-equivalent validation.

Do not apply the migration, enable live execution, or remove the legacy production path merely because the builder renders successfully.

## Definition of done

The work is complete only when both current flows execute through the generic engine with unchanged observable behavior; administrators can publish unrelated nested workflows without code; waits and retries survive deployment; duplicate events cannot duplicate effects; SMS policy cannot be bypassed; published versions and in-progress runs are isolated from draft edits; existing history remains visible; every run is explainable from the UI; tenant isolation is proven; and the complete existing and automation-specific test suites pass.
