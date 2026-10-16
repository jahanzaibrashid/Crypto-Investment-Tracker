#!/usr/bin/env node
/**
 * Database migrations without the Supabase dashboard.
 *
 * Wraps the official Supabase CLI (downloaded on demand by npx, so it is not an app
 * dependency and doesn't slow down Vercel builds). The CLI records applied files in
 * supabase_migrations.schema_migrations, so every file in supabase/migrations/ runs once.
 *
 *   npm run db:migrate                 apply new migrations (lists them and asks first)
 *   npm run db:migrate -- --dry-run    only show what would run
 *   npm run db:status                  which migrations are applied
 *   npm run db:baseline                one-time setup for a database created by hand in the SQL Editor
 *
 * Connection settings come from .env (the password is never printed):
 *   VITE_SUPABASE_URL      the project URL the app already uses → project ref
 *   SUPABASE_DB_PASSWORD   the database password, as-is (no URL encoding needed)
 *   SUPABASE_DB_HOST       optional: the Session pooler host, for networks without IPv6
 *                          (e.g. aws-0-ap-south-1.pooler.supabase.com)
 */
import { spawnSync } from 'node:child_process'

const CLI = 'supabase@2.118.0'

/** Migrations that were run by hand before this script existed and can't safely run twice. */
const BASELINE = ['001']

const fail = (message) => {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

/** Build the Postgres connection string from the project URL and the database password. */
function databaseUrl() {
  const env = process.env
  let ref
  try {
    ref = new URL(env.VITE_SUPABASE_URL ?? '').hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1]
  } catch {
    ref = undefined
  }
  if (!ref) fail('VITE_SUPABASE_URL in .env must be your project URL, like https://<project-ref>.supabase.co')

  const password = env.SUPABASE_DB_PASSWORD
  if (!password) {
    fail(
      'SUPABASE_DB_PASSWORD is not set in .env.\n' +
        '  Add your database password (Supabase → Project Settings → Database → reset it there if you forgot it):\n' +
        '  SUPABASE_DB_PASSWORD=your-password',
    )
  }

  // Direct connection by default (needs IPv6); the Session pooler works on any network.
  const host = env.SUPABASE_DB_HOST?.trim() || `db.${ref}.supabase.co`
  const user = host.endsWith('.pooler.supabase.com') ? `postgres.${ref}` : 'postgres'
  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:5432/postgres`
}

const [command, ...extra] = process.argv.slice(2)
const commands = {
  migrate: (url) => ['db', 'push', '--db-url', url, ...extra],
  status: (url) => ['migration', 'list', '--db-url', url, ...extra],
  baseline: (url) => ['migration', 'repair', '--status', 'applied', ...BASELINE, '--db-url', url, ...extra],
}
if (!commands[command]) fail(`Unknown command "${command ?? ''}". Use: migrate, status or baseline.`)

const url = databaseUrl()
if (command === 'baseline') {
  console.log(`Marking ${BASELINE.join(', ')} as already applied (they were run in the SQL Editor). Later files are safe to re-run.\n`)
}

const result = spawnSync('npx', ['--yes', CLI, ...commands[command](url)], { stdio: 'inherit', shell: process.platform === 'win32' })
if (result.error) fail(`Could not start the Supabase CLI: ${result.error.message}`)
if (result.status !== 0 && !process.env.SUPABASE_DB_HOST) {
  console.error(
    '\nIf the error above is about connecting (timeout, "no route to host", "network is unreachable"), your network\n' +
      'probably has no IPv6. Supabase → Connect → Session pooler: copy the host and add it to .env:\n' +
      '  SUPABASE_DB_HOST=aws-0-<region>.pooler.supabase.com\n',
  )
}
process.exit(result.status ?? 1)
