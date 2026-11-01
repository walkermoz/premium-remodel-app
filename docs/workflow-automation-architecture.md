# Workflow automation architecture

## Outcome

Premium Remodel will replace workflow-specific orchestration with an organization-scoped, versioned decision-tree engine. Workflow topology and configuration are data; reusable capabilities are registered code. The existing website-lead and inbound-SMS behavior remain the production baseline and are seeded as ordinary published workflows.

SMS consent, recipient validation, organization-number isolation, and Do Not Disturb enforcement remain non-bypassable platform policies. The builder exposes those gates, but a workflow cannot remove or reorder around them.

## Planned files and migrations

- `lib/workflows/schema.ts`: versioned graph, settings, event, and expression schemas.
- `lib/workflows/conditions.ts`: safe variable resolution, condition evaluation, and interpolation.
- `lib/workflows/registry.ts`: central trigger/action/logic registry and validation metadata.
- `lib/workflows/seeds.ts`: published definitions for the current website-lead and SMS-compliance workflows.
- `lib/workflows/validate.ts`: structural validation, context validation, reachability, branching, and loop limits.
- `lib/workflows/simulator.ts`: side-effect-free workflow planning and test traces.
- `lib/workflows/store.ts`: organization-scoped workflow/version persistence and publishing.
- `lib/workflows/engine.ts`: version-pinned execution, idempotent step claims, waits, retries, and run history.
- `lib/workflows/events.ts`: typed domain-event/outbox writes and dispatch.
- `components/automation-panel.tsx`: workflow list, tree builder, inspector, testing, versions, and runs.
- `app/api/workflows/**`: generic workflow CRUD, publish, test, versions, runs, and worker endpoints.
- `supabase/migrations/202610310002_workflow_engine.sql`: durable workflow, version, subscription, enrollment, event, run, step, wait, and deduplication storage; organization RLS; seed migration; legacy history retention.
- `tests/workflow-*.spec.ts`: graph, registry, decisions, safety, versioning, durability, and builder coverage.

Existing `app/api/leads/route.ts` and `app/api/twilio/inbound/route.ts` will emit domain events after their existing boundary validation. Legacy orchestration remains available during shadow comparison and is removed only after parity.

## Graph schema

The execution graph is a versioned JSON document with stable node IDs. It contains trigger, action, decision, wait, control, and terminal nodes plus explicit labeled edges. Layout is stored separately so moving a node does not change execution semantics.

Nodes carry a registered type, name, typed configuration, optional output alias, and ordered outgoing edges. If/Else selects the first matching branch and requires a fallback. Router executes every matching branch sequentially in displayed order and may include one fallback. Normal actions have at most one outgoing edge.

Conditions use a JSON expression tree with typed field references and literal/dynamic operands. No expression is executed as JavaScript. Text interpolation resolves only known context paths.

## Node registry contract

Every capability registers one definition containing its unique type, kind, category, label, description, icon, supported execution objects, Zod configuration schema, input/output field metadata, retry policy, connection requirements, side-effect flag, validation hook, and executor key. The core engine performs lookup through the registry and never branches on a workflow ID.

The client imports serializable registry metadata only. Server-only executors, credentials, and data access remain behind route handlers and `server-only` modules.

## Event and execution lifecycle

1. A domain mutation validates authorization and input at its route boundary.
2. The business record and a versioned event envelope are committed with an outbox record whenever they must be atomic.
3. A worker claims the event, loads matching published trigger subscriptions, evaluates trigger filters, and creates version-pinned enrollments/runs.
4. The engine claims one step at a time, resolves typed context, evaluates the node, records redacted input/output, and advances explicit edges.
5. Mutating or external actions use a unique `(run, node, attempt/effect)` idempotency key.
6. Waits serialize continuation state and are resumed by a claimed due-wait worker or a matching event.
7. Bounded exponential retries end in `needs_attention`; they never retry forever.
8. Publishing creates a new immutable version and trigger subscriptions. Existing runs remain pinned to their enrolled version.

The serverless deployment never relies on an in-memory timer or a continuously running process.

## Current workflow migration

The migration creates one Website lead intake workflow and one Inbound text compliance workflow for each organization. Existing configuration values are translated into node configuration. Existing revision and run tables remain intact and their history is copied or surfaced as legacy history; nothing is deleted.

During shadow mode, production routes keep their current effects while the generic simulator records the path the new engine would take. Shadow mode never sends messages or writes duplicate business objects. A feature flag enables the generic executor only after automated parity checks pass.

## Rollout risks and controls

- **Duplicate side effects:** outbox/event and action idempotency keys, atomic claims, and shadow-mode side-effect suppression.
- **Behavior drift:** characterization tests for lead capture, matching order, consent evidence, delivery outcomes, retry behavior, and Twilio keyword handling.
- **Compliance bypass:** SMS policy enforced in the sending boundary independently of the workflow graph.
- **Long-lived run drift:** every run pins an immutable version.
- **Bad graphs:** publish-time schema, reachability, branch, context, loop, and connection validation.
- **Serverless interruption:** database-backed events, step claims, waits, and resumable runs.
- **Tenant leakage:** organization keys on every table, RLS, server-side membership checks, and no client-supplied organization IDs.
- **Unsafe integrations:** secret references instead of secret values, redacted logs, and outbound-webhook SSRF validation.
- **Concurrent editors:** draft revision checks and immutable version history.

## Reviewable stages

1. Characterize the current workflows and add the graph schema, conditions, registry, seeds, and simulator.
2. Add durable storage, versioning, RLS, event/outbox, and legacy-history migration.
3. Add generic workflow APIs and the visual draft/publish/test builder.
4. Add the execution worker, waits, retries, run inspector, and object-level history.
5. Shadow current events, prove path parity, then cut over behind a reversible flag.
6. Remove workflow-specific orchestration only after production-equivalent verification.

## Builder design direction

- **Visual thesis:** a calm operations map on Premium Remodel's dark navy workspace, using one blue accent and clear vertical rhythm so complex automation reads like a construction plan rather than a dashboard of cards.
- **Content plan:** workflow navigation and status on the left; the decision tree as the dominant working surface; the selected step's configuration and validation context on the right; testing, versions, and run history as focused modes of the same workspace.
- **Interaction thesis:** inserting or moving a step animates the surrounding tree into place; selecting a node opens the inspector with a short lateral reveal; branches collapse smoothly while preserving a visible labeled path. Motion is disabled for reduced-motion preferences.

## HighLevel research takeaways

The design was checked against HighLevel's current official workflow guidance on October 31, 2026. We are adopting the useful operating concepts without copying its visual design:

- Re-entry is object-specific, does not duplicate an already-active enrollment, and belongs with Stop on Response, timezone, communication windows, and sender defaults in versioned workflow settings: https://help.gohighlevel.com/support/solutions/articles/48001239875
- Waits need durable support for fixed time, object-relative dates, events/replies, conditions, and timeout behavior; changing a published wait must not alter existing waits: https://help.gohighlevel.com/support/solutions/articles/155000002470/
- If/Else needs ordered first-match evaluation, searchable context-aware fields, nested AND/OR conditions, and a non-removable fallback: https://help.gohighlevel.com/support/solutions/articles/155000002471
- Execution logs need a path from both the workflow and the affected Contact/object so support staff can open the exact run from business context: https://help.gohighlevel.com/support/solutions/articles/155000003992-workflows-improved-execution-logs-enrollment-history
- Session undo/redo and scoped edits materially reduce builder risk, especially for large workflow changes: https://help.gohighlevel.com/support/solutions/articles/155000006100

Premium Remodel goes further in three places: explicit Router multi-match semantics, immutable version pinning for all runs and waits, and mandatory SMS policy gates backed by enforcement at the sending boundary.
