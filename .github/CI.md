# CI performance and safety

Web static checks, the web build/tests, the credits site, and mobile checks run
in parallel. The existing `quality` job remains the single deployment gate and
fails if **any** prerequisite fails, is cancelled, or is skipped. Audits and test
coverage are unchanged. Database migrations still run after quality succeeds and
before production deployment.

Installed dependencies use exact OS/architecture/Node-version/lockfile caches.
Changing a lockfile or Node version automatically performs a clean `npm ci`.
There are no partial dependency restores. If a future package adds install
scripts that generate files outside `node_modules`, regenerate those files on
cache hits too, or bump the cache prefix and update the cached paths.

Only the test build writes `.next/cache` to the shared compilation cache.
Deployment builds restore that cache but never save it: production/preview
environment files, generated output, and `.vercel` must not enter shared caches.
Preview and production still build separately with their own environment.
The Vercel CLI is pinned to the same version for both.

CI demo/unit tests use four workers with file-level parallelism; local and
Supabase integration runs keep one worker for shared database fixtures.

## Measuring

Compare the Actions run's start/end time, not the sum of concurrent job times.
Also record dependency cache hits and `npm test` duration. A cold run installs
and populates caches; use a warm run to measure routine update latency. Cache
eviction, lockfile updates, runner allocation, and provider latency still affect
individual runs.

Baseline: main run [45323556086](https://github.com/walkermoz/premium-remodel-app/actions/runs/45323556086)
took **9m14s**, with **3m18s** in tests and roughly **one minute each** in two
root dependency installs. It ran 273 passing tests and skipped the 42 tests that
require a database integration environment.
