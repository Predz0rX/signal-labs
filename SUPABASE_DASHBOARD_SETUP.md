# Signal Labs Dashboard v1 — Supabase setup

## Required env vars

Add these on the app/server host:

- `SUPABASE_URL` — existing server-side Supabase URL for report persistence
- `SUPABASE_SERVICE_ROLE_KEY` — existing server-side write key
- `SIGNAL_LABS_SUPABASE_URL` — same project URL, exposed to the browser
- `SIGNAL_LABS_SUPABASE_ANON_KEY` — browser-safe anon/public key for auth + dashboard reads
- `BASE_URL` — public app URL used in email links

Notes:
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are used by `server.js` for background report upserts.
- `SIGNAL_LABS_SUPABASE_URL` + `SIGNAL_LABS_SUPABASE_ANON_KEY` are injected into `/auth` and `/app` pages for magic-link auth and protected dashboard reads.

## Expected `reports` table

If you already have a `reports` table, make sure it includes at least:

- `token text primary key`
- `email text not null`
- `payload jsonb not null`

Recommended SQL:

```sql
create table if not exists public.reports (
  token text primary key,
  email text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists reports_email_idx on public.reports (email);
create index if not exists reports_created_at_idx on public.reports (created_at desc);
```

## Enable auth magic links

In Supabase dashboard:

1. Authentication → Providers → Email
2. Enable Email provider
3. Enable Magic Link
4. Add your production site URL to redirect URLs, for example:
   - `https://signal-labs-omega.vercel.app/app`
   - `https://signal-labs-wddk.onrender.com/app`
   - your final custom domain `/app`

## Row Level Security

Enable RLS and let signed-in users read only their own reports by email.

```sql
alter table public.reports enable row level security;

create policy "users_can_read_their_own_reports"
on public.reports
for select
using (
  auth.jwt() ->> 'email' = email
);
```

Optional: if you ever want authenticated users to update report flags from the client, add a separate update policy later.

## Current app routes

- `/` → existing marketing landing page
- `/auth` → magic-link sign-in page
- `/app` → private dashboard shell
- `/dashboard` → alias of `/app`
- `/account` → alias of `/app`
- `/plans` → alias of `/app`
- `/report/:token` → existing report viewer

## UX flow

1. User gets a report generated on the landing page
2. Backend stores report in Supabase `reports`
3. User signs in via `/auth` with the same email
4. `/app` lists only reports for that email
5. Clicking a report opens `/report/:token`
