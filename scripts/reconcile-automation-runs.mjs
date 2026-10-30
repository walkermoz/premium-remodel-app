import pg from "pg";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
  const { rows } = await client.query(`
    with stale_organizations as materialized (
      select distinct organization_id
      from public.remodel_automation_runs
      where automation_key = 'website-lead-intake'
        and status = 'running'
        and last_activity_at < now() - interval '5 minutes'
    )
    select coalesce(sum(public.remodel_reconcile_stale_automation_runs(
      organization_id
    )), 0)::integer as recovered
    from stale_organizations
  `);
  const recovered = rows[0].recovered;
  console.log(`Reconciled ${recovered} interrupted website lead runs.`);
  if (recovered > 0)
    console.log(
      `::warning::${recovered} website lead runs stopped before completion and need review in Automation.`,
    );
} finally {
  await client.end();
}
