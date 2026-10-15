import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

/**
 * Minimal emulation of the pieces of a Supabase database that the migration
 * depends on: the `auth` schema, `auth.uid()`, the API roles, Supabase's
 * default privileges on `public`, and the realtime publication.
 *
 * `auth.uid()` reads `request.jwt.claim.sub`, which is what PostgREST sets for
 * an authenticated request, so policies are evaluated the same way.
 */
const SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url))
/** All migrations, applied in filename order — the same order `supabase db push` uses. */
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(MIGRATIONS_DIR + f, 'utf8'))

export async function createTestDatabase() {
  const db = await PGlite.create()
  await db.exec(SHIM)
  for (const sql of MIGRATIONS) await db.exec(sql)
  return db
}

export async function createUser(db: PGlite, id: string, email: string, displayName?: string) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    email,
    JSON.stringify(displayName ? { display_name: displayName } : {}),
  ])
}

/**
 * Run `fn` inside a transaction as the given authenticated user (or as anon when
 * userId is null), mirroring how PostgREST executes requests.
 */
export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  fn: (tx: Pick<PGlite, 'query' | 'exec'>) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`)
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ''])
    return fn(tx as unknown as Pick<PGlite, 'query' | 'exec'>)
  })
}
