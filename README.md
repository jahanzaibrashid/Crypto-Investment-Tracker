# Crypto Investment Tracker

A single-page web app for tracking cryptocurrency purchases and sales in USD. It shows live CoinGecko prices, profit/loss and ROI, keeps sale history and notes, and exports the portfolio to Excel. Data is stored in Supabase (PostgreSQL), protected by Row Level Security.

---

## Features

- **Authentication:** register, log in, log out, password reset by email, persistent sessions, protected routes. When a session expires, the user is signed out and shown a message explaining why.
- **Investments:** each row is one purchase lot. Supports multiple purchases of the same coin at different dates and prices, and many coins.
- **Add / edit / delete:** validated forms (Zod) with a live preview of invested amount and cost basis. Deleting asks for confirmation first.
- **Sales:** "Mark as sold" records a full or **partial** sale. Every sale is kept in a separate history table. Deleting a sale re-opens that quantity.
- **Coin selector:** quick picks (BTC, ETH, SOL, BNB, XRP, ADA, DOGE, DOT) plus CoinGecko search. The CoinGecko ID is stored separately from the ticker, because tickers are not unique.
- **Live prices:** CoinGecko USD prices, de-duplicated and cached (TanStack Query). The app refreshes every 2 minutes, and there's a manual refresh button.
  - Each price is labelled **live**, **stale** (last good price kept after a failed refresh, or too old) or **unavailable**.
  - A missing price is never shown as zero.
- **Summary cards:** Total Invested, Current Value, Unrealized P/L, Realized P/L, Total Return, Overall ROI, Holdings.
- **Holdings by coin:** multiple lots combined per coin, with fee-inclusive average cost and allocation.
- **Table:** TanStack Table with search, status filter, buy-date range, sorting (buy date, invested, current value, P/L, ROI), pagination and clear-filters.
  - **Saved order:** new investments appear at the top. Drag open (unsold or partially sold) investments by the ⋮⋮ grip next to the row number to any position (keyboard: focus the grip, Space, ↑/↓, Space). The order is stored in the database (`sort_order`), so it survives refreshes and other devices.
  - Fully sold investments are listed after the open ones, most recently sold first. They can't be dragged.
  - Sorting by a column is temporary. Click the header again until the arrow disappears, or use **Back to saved order**, to return to the saved order. Dragging is paused while a column sort is active.
- **Notes:** a note on each investment, plus a portfolio-level note.
  - The portfolio note autosaves, syncs across devices (Supabase Realtime) and detects conflicting edits.
- **Excel import:** the **Import** button reads a workbook in the export format and adds its investments and sales to the signed-in account (see [Excel import](#excel-import)).
- **Excel export (SheetJS):** sheets `Investments`, `Portfolio Summary` and `Sales History`.
  - Always exports the complete dataset, not just the visible page.
  - Numbers use currency, percent and date formats.
  - Text cells are neutralized against formula injection.
  - Unavailable prices are labelled explicitly.
- **Layout:** responsive dark UI (desktop and mobile), accessible dialogs, keyboard navigation.

## Pages and theme

- **Pages:** `/overview` (summary cards), `/holdings` (positions per coin), `/investments` (table, filters, all investment dialogs) and `/notes` (portfolio note).
  - `/` redirects to `/overview`.
  - The sidebar on desktop, or the pill bar on smaller screens, highlights the current page.
- **Investments table:** columns are #, Coin, Bought (qty @ buy price + buy date), Invested, Current value (@ live price), Sold amount (@ sold price + sold date), Profit / Loss ($ + %), Status, Note, ⋯ (actions menu).
  - Every header has an ⓘ explaining the column.
  - A color legend (with counts) sits above the table; click an item to filter by that status.
  - A totals row sums the rows currently shown (after filters).
  - Visual style: profit/loss pills, a header and totals row that stay visible while the table scrolls, page-number pagination, and a "⋯" menu that appears on row hover (always visible on touch screens).
  - On phones the same table is shown, one row per investment, and scrolls sideways. The Holdings page switches to one card per coin below 768px.
  - Click a row, or press Enter on a focused row, to open its details.
  - The action buttons (edit, note, sell, delete) open only their own dialog.
- **Theme:** Light, Dark and System, chosen with the toggle in the header and on the auth pages.
  - The choice is saved in `localStorage` (`cit-theme`) and applied before first paint by an inline script in `index.html`, so the page never flashes the wrong theme.
  - All colors are semantic tokens in [`src/styles/theme.css`](src/styles/theme.css), mapped to Tailwind utilities in `src/index.css` (`bg-card`, `text-muted-foreground`, `border-input-border`, …). Components never use raw colors.
  - [`src/test/unit/theme-contrast.test.ts`](src/test/unit/theme-contrast.test.ts) checks WCAG contrast for every text/background pair in both themes. Where a specified color fails AA for a particular use (for example, green `#16A34A` as small text on white), the token file documents the variant used for that use.
  - Profit and loss always show a +/− sign and an arrow icon, not just color.

## Tech stack

| Area | Choice |
| --- | --- |
| Frontend | React 19 + TypeScript, **Vite 8** (SPA), React Router 8 |
| Styling | Tailwind CSS 4 |
| Data | TanStack Query 5, TanStack Table 9 |
| Forms | React Hook Form + Zod 4 |
| Money math | decimal.js (no floating-point arithmetic for money) |
| Backend | Supabase PostgreSQL, Auth, RLS, Realtime, optional Edge Function |
| Market data | CoinGecko API |
| Export | SheetJS `xlsx` 0.20.3 (official CDN build) |
| Icons | lucide-react |
| Tests | Vitest + React Testing Library, PGlite (Postgres in WASM) for RLS, Playwright |

> **Why Vite and not Next.js?** The spec asked for Next.js *and* Vite, `VITE_*` variables, `main.tsx` and an SPA structure. Next.js and Vite are separate build systems, and everything else in the spec describes a Vite single-page app, so this project is a Vite + React SPA.

## Prerequisites

- Node.js ≥ 22 (developed on Node 24) and npm
- A Supabase project (free tier is fine)
- Optional: [Supabase CLI](https://supabase.com/docs/guides/cli) for migrations, Edge Functions and a local stack (needs Docker)
- Optional: a CoinGecko Demo API key (free)

## Run it locally

1. **Get the code and install dependencies**

   ```bash
   git clone https://github.com/jahanzaibrashid/Crypto-Investment-Tracker.git
   cd Crypto-Investment-Tracker
   npm install        # or: pnpm install
   ```

2. **Create your env file**

   ```bash
   cp .env.example .env.local
   ```

   Open `.env.local` and fill in at least:

   ```bash
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon / publishable key>
   VITE_SITE_URL=http://localhost:3000
   ```

   Both Supabase values are under Supabase → Project Settings → API. All variables are described in [Environment variables](#environment-variables).

3. **Set up the database (first time only).** Run the migration and the auth URL settings described in [Supabase setup](#supabase-setup).

4. **Start the app**

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000>, create an account and sign in. Code changes reload instantly.

If the Supabase variables are missing, the app shows a "not configured" screen listing them. It never falls back to fake data. After changing `.env.local`, stop the dev server (Ctrl+C) and start it again.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on <http://localhost:3000>, with hot reload. |
| `npm run build` | Type-checks, then builds the production app (including the PWA service worker) into `dist/`. |
| `npm run preview` | Serves the `dist/` build on <http://localhost:3000>. Use it to try the production build and the installable app. |
| `npm test` | Unit, integration and database (RLS) tests with Vitest. No Supabase project needed. |
| `npm run test:watch` | Same tests, re-run on every change. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | TypeScript check without building. |
| `npm run db:migrate` | Applies new database migrations to Supabase (see [Database migrations from the terminal](#database-migrations-from-the-terminal)). `db:status` lists them. |
| `npm run test:e2e` | Playwright end-to-end tests against mocked Supabase and CoinGecko. Run `npx playwright install` once first. |

### Common problems

- **"… is not configured" screen:** `.env.local` is missing, has a typo in a variable name, or the dev server wasn't restarted after editing it.
- **Port 3000 is already in use:** stop the other process, or run `npm run dev -- --port 3001`. Then also use that port in `VITE_SITE_URL` and in Supabase's Redirect URLs.
- **No confirmation email after signing up:** Supabase's built-in email sender is rate-limited and meant for testing. Turn off **Confirm email** for personal use, or set up custom SMTP. See step 3 of [Supabase setup](#supabase-setup).
- **Email link opens the wrong site:** check `VITE_SITE_URL` and Supabase → Authentication → URL Configuration.

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | The **anon / publishable** key. It is public by design; RLS protects the data. **Never** use the service-role key here. |
| `VITE_MARKET_DATA_MODE` | no | `direct` (default) or `proxy`. See CoinGecko below. |
| `VITE_COINGECKO_API_KEY` | no | Demo key, used only in `direct` mode. **Every `VITE_*` value is visible in the browser bundle.** |
| `VITE_SITE_URL` | no | The app's public address (`http://localhost:3000` locally, your Vercel URL in production). Links in confirmation and password-reset emails point here. If empty, they use the address the app is open on. It must also be allowed in Supabase → Authentication → URL Configuration. |

`.env`, `.env.local` and the other `.env.*` files are git-ignored. Only `.env.example` (names only) is committed.

## Supabase setup

1. **Create a project** at supabase.com. Turning on *Automatic RLS* is recommended as a safety net for future tables; the migration enables RLS explicitly anyway.
2. **Apply the migrations** in `supabase/migrations/`, in filename order. Choose one:
   - **SQL Editor:** paste and run each file in order: `001_initial_schema.sql`, `002_long_term_holding.sql`, `003_import_investments.sql` (Excel import), `004_investment_sort_order.sql` and `005_reorder_investments.sql` (saved table order). Easier: `npm run db:migrate` (see below).
   - **CLI:** `supabase link --project-ref <ref>` then `supabase db push`.
3. **Authentication → Providers → Email:** enable it.
   - If "Confirm email" is on, new users must click the emailed link before signing in. The UI handles both cases.
   - Supabase's built-in email sender only sends a few emails per hour and is meant for testing. For real users, set up custom SMTP (Authentication → Emails → SMTP Settings, for example with Resend or Brevo). For personal use, you can turn "Confirm email" off instead.
4. **Authentication → URL Configuration:**
   - Site URL: `http://localhost:3000` (production: your Vercel URL).
   - Redirect URLs: `http://localhost:3000/reset-password`, `http://localhost:3000/login`, and the same paths on your production domain.
5. **Verify RLS:** Table Editor should show "RLS enabled" on `profiles`, `investments`, `investment_sales` and `portfolio_notes`.
   - For a manual check, create two users, add data as each, and confirm neither can see the other's rows.
6. *(Optional)* **Realtime:** the migration adds `portfolio_notes` to the `supabase_realtime` publication.
   - Without it, notes still sync whenever the page regains focus.

### Database migrations from the terminal

Instead of pasting SQL into the dashboard, run new files in `supabase/migrations/` with one command. It uses the official Supabase CLI (fetched by `npx`, nothing to install). The CLI records applied files in `supabase_migrations.schema_migrations`, so each file runs only once.

**One-time setup**

1. Add your database password to `.env.local`, as-is (it is git-ignored and never sent to the browser). The script builds the connection from it and the `VITE_SUPABASE_URL` you already have:

   ```bash
   SUPABASE_DB_PASSWORD=your-database-password
   ```

   Forgot it? Supabase → Project Settings → Database → **Reset database password**.
2. Only if the connection times out: your network probably has no IPv6, which Supabase's direct database host needs. In Supabase, click **Connect**, choose **Session pooler**, and add its host:

   ```bash
   SUPABASE_DB_HOST=aws-0-<region>.pooler.supabase.com
   ```

3. If your database was set up by pasting files into the SQL Editor, tell the CLI that `001` already ran. Files from `002` on are safe to run again.

   ```bash
   npm run db:baseline
   ```

**Every time the schema changes**

```bash
npm run db:status                 # which migrations are applied
npm run db:migrate -- --dry-run   # what would run
npm run db:migrate                # lists the new files and asks before applying them
```

Run `db:migrate` **before** deploying code that needs the change; otherwise the app shows "The database is missing a recent update".

### Local Supabase stack (optional)

```bash
supabase start          # requires Docker
supabase db reset       # applies migrations + seed.sql
```

`supabase/seed.sql` adds example purchase lots for `demo@example.com`, if that user exists. It contains no prices.

## Database design

| Table | Purpose |
| --- | --- |
| `profiles` | One per auth user. Created by the `on_auth_user_created` trigger (`security definer`, fixed `search_path`; identity taken only from `auth.users.id`). |
| `investments` | One row per purchase lot. `NUMERIC(30,12)` prices and `NUMERIC(36,18)` quantities. |
| `investment_sales` | One row per sale (partial or full). Its composite FK `(investment_id, user_id)` guarantees the sale belongs to the lot owner. |
| `portfolio_notes` | One per user (`UNIQUE(user_id)`). A `version` column, incremented by trigger, provides optimistic concurrency. |

**Partial-sale policy.** Sales live in `investment_sales`, so no history is overwritten.

- The `status`, `sold_date`, `sold_price`, `sold_quantity` and `sell_fee` columns on `investments` are a summary maintained by triggers:
  - `status` is `SOLD` exactly when the sold quantity equals the purchased quantity.
  - `sold_price` is the quantity-weighted average sale price.
- Clients have no privilege to write these columns.

**Database-enforced rules:**
- Price > 0, quantity > 0, fees ≥ 0.
- Valid status, consistent sold fields, sold quantity ≤ purchased quantity.
- Sale date ≥ buy date.
- No overselling: the parent lot row is locked during a sale, so concurrent sales cannot oversell.
- The purchased quantity cannot be edited below the quantity already sold.

**Authorization:**
- RLS on every table, with `auth.uid()` ownership checks for select, insert, update and delete.
- Column-level `GRANT`s mean clients can never write `user_id`, timestamps or derived columns. `user_id` defaults to `auth.uid()`, and the frontend never sends it.
- Ownership changes are rejected.
- `anon` has no table access.

Indexes cover `(user_id, buy_date)`, `(user_id, status)`, `(user_id, coin_id)` and the sales lookups.

## CoinGecko configuration

The app sends only **coin IDs** (for prices) and **search text** (for the coin picker) to CoinGecko. Notes, quantities and other investment data are never sent.

- **`direct` mode (default):** the browser calls `https://api.coingecko.com/api/v3`.
  - Works keyless, with low public rate limits, or with a Demo key in `VITE_COINGECKO_API_KEY`.
  - That key **is public** once deployed. CoinGecko Demo keys are free, but treat this as acceptable only for personal use.
- **`proxy` mode (recommended for production):** the browser calls the Supabase Edge Function `coingecko-proxy`, which keeps the key server-side.
  - It requires a signed-in user's JWT.
  - It allow-lists exactly two operations (USD simple price for ≤100 validated IDs, and search for queries of ≤64 characters).
  - It caches responses (30 s for prices, 10 min for search) and rate-limits each user (30 requests/min per isolate).

  ```bash
  supabase secrets set COINGECKO_API_KEY=<your key> COINGECKO_PLAN=demo   # or pro
  supabase secrets set ALLOWED_ORIGINS=https://your-app.vercel.app       # optional CORS allow-list
  supabase functions deploy coingecko-proxy
  # then set VITE_MARKET_DATA_MODE=proxy
  ```

**Polling:**
- Prices are considered fresh for 60 s and auto-refresh every 120 s (only while the tab is visible).
- Network errors retry twice with backoff. HTTP 429 is never retried.
- A price is labelled **stale** if the latest refresh failed, if the last successful fetch is older than 10 minutes, or if CoinGecko's own quote timestamp is older than 1 hour.

## Financial calculations

All math lives in pure functions in [`src/features/investments/investments.utils.ts`](src/features/investments/investments.utils.ts) and uses decimal.js with 40 significant digits. Values are rounded only for display or export.

| Quantity | Formula |
| --- | --- |
| Gross purchase cost | `Q × buy price` |
| Total cost basis | `Q × buy price + buy fee` (the fee is counted **once**, here) |
| Cost allocated to a sale of S units | `cost basis × S / Q` (proportional, i.e. average cost within the lot) |
| Remaining cost basis | `cost basis − allocated cost of all sales` |
| Net sale proceeds | `S × sale price − sale fee` |
| **Realized P/L** | `Σ net proceeds − Σ allocated cost` |
| Current value | `remaining Q × current price` (only when a price is known) |
| **Unrealized P/L** | `current value − remaining cost basis` |
| Unrealized ROI | `unrealized P/L ÷ remaining cost basis × 100` |
| Realized ROI | `realized P/L ÷ allocated cost of sold units × 100` |
| Total P/L | `realized + unrealized` |
| Overall ROI | `total P/L ÷ (sold cost basis + remaining cost basis of priced holdings) × 100` |

- **Realized vs unrealized:** realized P/L is locked in by sales that already happened. Unrealized P/L is a paper gain or loss on what you still hold, at today's price. Sale proceeds are never added to current holdings value, so nothing is double-counted.
- **Missing prices:** holdings without a price are left out of current value, unrealized P/L and the ROI denominator. The dashboard and export then show "totals incomplete" and list the coins that are missing a price.
- **Zero cost basis:** ROI is shown as "—", never as a division by zero.
- **Fees** must be entered in USD. The form asks you to convert fees paid in other currencies; they are never silently mixed.
- **Total Invested** is the cost basis of everything ever bought, including sold lots. The remaining cost basis is shown underneath it.

## Excel export

The **Export to Excel** button builds `crypto-portfolio-YYYY-MM-DD.xlsx`. SheetJS is loaded on demand.

- **Investments:** every lot.
  - Coin, symbol, CoinGecko ID, buy date, buy price, quantity.
  - Gross purchase, fees, cost basis, sold and remaining quantity.
  - Current price and its status, current value, remaining cost basis.
  - Unrealized and realized P/L, ROI, status.
  - Last sale date, average sale price, net proceeds, sale fees, note.
- **Portfolio Summary:**
  - Timestamp, totals, ROI, holdings and sold counts, portfolio note.
  - Price fetch time and stale or missing price warnings, plus calculation definitions.
- **Sales History:** one row per sale, with allocated cost and realized P/L.

Text that starts with `= + - @`, a tab or a carriage return is prefixed with `'` so it cannot run as a formula. Unavailable prices are written as `Unavailable`, never `0`. Export uses only the signed-in user's RLS-scoped data.

The last two Investments columns, **Long-term** and **Lot ID**, and the **Lot ID** column in Sales History, are there for importing the file back.

## Excel import

**Import** (next to Export in the header) takes an `.xlsx` in the export format, up to 5 MB and 2000 investments. Nothing is saved until you confirm.

1. **Read and validate.** Columns are matched by header name. Only purchase and sale inputs are read: coin, symbol, CoinGecko ID, buy date, buy price, quantity, fee, note and long-term from **Investments**, and sale date, quantity, price, fee and note from **Sales History**. Computed columns such as P/L are ignored. Each row is checked with the same rules as the Add and Sell forms.
2. **Preview.** The dialog lists what will be added, what is skipped as a duplicate, and which rows can't be imported, with the reason.
   - **Duplicate:** an investment with the same coin, buy date, price, quantity and fee is already in your portfolio. Matching is one-to-one, so two identical rows in the file against one existing investment import one of them.
   - **Sales** are linked to their purchase by **Lot ID**. Files without that column match by coin and buy date, and ask for a Lot ID when that is ambiguous. If a sale is invalid, its purchase is skipped too, so a position is never saved with the wrong status.
3. **Import.** The new investments are saved by the `import_investments` database function in one transaction: if anything fails, nothing is saved.

**Ownership:** imported rows always belong to the signed-in account. The file contains no owner information, and the database sets `user_id` from the session (`auth.uid()`), exactly as for investments added by hand, so other users can never see them. Existing investments are never changed or deleted.

## Installable app (PWA)

The app can be installed to the home screen or desktop ("Install app" in Chrome/Edge, Share → **Add to Home Screen** in iOS Safari). It is built with [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) (Workbox `generateSW`), configured in `vite.config.ts`.

- **Icons:** generated at build time from `public/favicon.svg` (see `pwa-assets.config.ts`): `favicon.ico`, 64/192/512 PNGs, a maskable 512 for Android and a 180 apple-touch-icon. To change the icon, replace the SVG.
- **Offline:** the app shell (HTML, JS, CSS, icons) is precached, so the app opens without a connection and shows an offline banner. Supabase and CoinGecko requests are **never cached**: balances and prices always come from the network.
- **Updates:** after a deploy, open apps show "A new version of the app is available" with an **Update** button (`src/app/PwaUpdatePrompt.tsx`). It never reloads on its own, so an unsaved form is not lost. Open apps also check for a new version every hour.
- **Development:** the service worker is only built for production. Use `npm run build && npm run preview` to try it locally.

## Testing

```bash
npm run typecheck   # tsc
npm run lint        # eslint
npm run test        # Vitest: unit + component/integration + database/RLS
npm run test:e2e    # Playwright (first run: npx playwright install chromium)
```

- **Unit tests** cover:
  - Cost basis with fees, current value, realized and unrealized P/L, ROI, zero cost basis.
  - Full and partial sales, decimal precision, missing and stale prices.
  - The CoinGecko service: rate limits, network errors, malformed responses.
  - Workbook generation and formula-injection protection, Zod schemas, error mapping.
- **Component and integration tests** (services and CoinGecko mocked in memory) cover:
  - Login, registration, password reset and protected routes.
  - Add, edit, delete, full and partial sell.
  - Filter and sort, API-error display, stale prices.
  - Full-dataset export, note autosave and conflict handling.
  - Cache clearing when the account changes.
- **Database / RLS tests** ([`src/test/db/rls.test.ts`](src/test/db/rls.test.ts)) run the **real migration** inside PGlite (Postgres 17 in WASM). A small shim stands in for Supabase's `auth` schema, roles and default privileges. With two users, they check that:
  - User A cannot read, update, delete or take over User B's investments, sales, notes or profile.
  - `anon` sees nothing.
  - Constraints, triggers, oversell protection and note versioning work.

  This emulates PostgREST's role and JWT handling. Still repeat the manual two-user check (step 5 above) on your hosted project.
- **E2E (Playwright)** runs the real app against a mocked Supabase and CoinGecko at the network level ([`src/test/e2e/mock-api.ts`](src/test/e2e/mock-api.ts)). It covers auth, the full add/edit/sell/filter/export/delete flow with download verification, note persistence, price-failure display and a phone-viewport smoke test (`@mobile`).

No test depends on live prices or external services.

## Deployment

### Supabase
1. Create the project, then apply the migration (see above).
2. Verify RLS in the Table Editor and with two test accounts.
3. Configure Email auth and the redirect URLs for your production domain.
4. If you use `proxy` mode: set the Edge Function secrets and deploy `coingecko-proxy`.
5. Run `npm run test` locally, which includes the RLS suite.

### Vercel
1. Import the repository. Framework preset **Vite**; root is the repository root.
   - Build command `npm run build`, output directory `dist`. Both are already set in `vercel.json`.
2. Add environment variables (Production and Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL` (your Vercel URL), optionally `VITE_MARKET_DATA_MODE` and `VITE_COINGECKO_API_KEY`.
   - `VITE_*` values are built into the app, so redeploy after adding or changing one.
3. Deploy. `vercel.json` rewrites all non-asset paths to `index.html` so client-side routes (`/login`, `/reset-password`) work. It also adds basic security headers.
4. In Supabase → Authentication → URL Configuration, set the Site URL to the Vercel URL and add `https://<domain>/reset-password` and `https://<domain>/login`.
5. Check the live app: register, add a purchase, confirm prices load, export, log out and back in.

Updates: push to the main branch (Vercel redeploys). For schema changes, add a new numbered file under `supabase/migrations/` and run `supabase db push`.

## Security notes

- Only the anon key reaches the browser. Authorization is enforced by RLS and column grants in Postgres, not by the frontend.
- The frontend never sends `user_id`. The database fills it in from `auth.uid()` and rejects ownership changes.
- Inputs are validated with Zod and again by database constraints.
- Error messages are mapped to friendly text; raw SQL errors are not shown.
- Submit buttons are disabled while a request is in flight, so double submissions are prevented.
- React escapes all rendered text, coin-search thumbnails must be `https:` URLs, and spreadsheet text is neutralized against formula injection.
- Nothing sensitive is logged. The error boundary logs only the error type and component stack.
- The TanStack Query cache is keyed by user and cleared on logout or account switch.

## Known limitations

- **Cost-basis method:** proportional within each lot. Across lots, each sale is tied to the lot you choose; there is no automatic FIFO, LIFO or global average across lots.
- **USD only;** no currency conversion for fees.
- Prices come from CoinGecko only. Assets CoinGecko doesn't list show as "unavailable".
- Excel stores numbers as IEEE doubles (about 15 significant digits). The exact decimals live in the database.
- The Edge Function's cache and rate limit are per isolate (best effort). Use a shared store such as Redis or Upstash if you need strict global limits.
- **Not yet verified against a hosted Supabase project:**
  - RLS tests run in PGlite, so the hosted project needs the manual two-user check.
  - The Edge Function has not been deployed or executed in this repo's CI.
- **E2E specs** are written and type-checked but haven't been run yet.
- Values shown are estimates for personal tracking, not tax or financial advice.

## Project structure

```
src/
  app/            App, providers, routes, config-missing screen
  components/     layout (header, sidebar, container) and ui primitives (Button, Input, Dialog, …)
  features/
    auth/         pages, provider/context, guard, service, schemas
    dashboard/    DashboardPage, summary cards, holdings-by-coin
    investments/  table, filters, form, dialogs, hooks, service, schemas, pure utils
    prices/       CoinGecko service, hooks, types
    notes/        portfolio note UI, hooks, service
    export/       SheetJS workbook builder
    import/       workbook parser/validator and the import dialog
  lib/            supabase client, env, decimal, formatters, errors, query client
  test/           unit, integration, db (PGlite RLS), e2e (Playwright)
supabase/
  migrations/      001 schema, 002 long-term flag, 003 import function, 004–005 saved order
  functions/coingecko-proxy/index.ts
  seed.sql, config.toml
```
