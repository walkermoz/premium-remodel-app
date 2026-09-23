import { config } from "dotenv";
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";
config({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for migrations.");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
try {
  await client.connect();
  await client.query("select pg_advisory_lock(8675309)");
  await client.query(`create table if not exists public.remodel_schema_migrations (
    name text primary key, applied_at timestamptz not null default now()
  ); alter table public.remodel_schema_migrations enable row level security;
  revoke all on public.remodel_schema_migrations from anon, authenticated;`);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const name of readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const applied = await client.query(
      "select 1 from public.remodel_schema_migrations where name = $1",
      [name],
    );
    if (applied.rowCount) continue;
    await client.query(readFileSync(new URL(name, directory), "utf8"));
    await client.query(
      "insert into public.remodel_schema_migrations(name) values ($1)",
      [name],
    );
    console.log(`Applied ${name}`);
  }
  console.log(
    "Premium Remodel schema applied; existing records and accounts retained.",
  );
} finally {
  await client.end();
}
