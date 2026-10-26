# SPARK

Capture → Organize → Evaluate → Activate → Execute → Rediscover.

This is **Phase 0 (Foundation)**: email sign-in, the full database schema with row-level security, fast capture with dictation and draft recovery, and a searchable library.

## Setup (about 10 minutes)

1. **Create a Supabase project** at supabase.com.
2. **Run the schema.** Either paste `supabase/migrations/20261026000000_init.sql` into the Supabase SQL Editor and run it, or with the Supabase CLI:
   ```bash
   supabase link --project-ref YOUR-PROJECT-REF
   supabase db push
   ```
3. **Configure auth** (Supabase dashboard → Authentication → URL Configuration):
   - Site URL: `http://localhost:3000` (your Vercel URL in production)
   - Redirect URLs: add `http://localhost:3000/auth/callback` and `https://YOUR-DOMAIN/auth/callback`
4. **Environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Project Settings → API.
5. **Run it:**
   ```bash
   npm install
   npm run typecheck
   npm run dev
   ```
   Open http://localhost:3000, sign in by email, capture an idea.

## Acceptance checks for Phase 0

- [ ] Signed-out visit to `/` or `/library` redirects to `/login`.
- [ ] Magic link signs you in and lands on Capture.
- [ ] Typing an idea and pressing Save (or Cmd/Ctrl+Enter) shows it under Recent.
- [ ] Refreshing mid-typing keeps the unsaved text.
- [ ] The mic button appears in Chrome/Edge/Safari and dictates into the box.
- [ ] Library search finds an idea by a word in its body; status chips filter.
- [ ] A second account sees none of the first account's ideas.
- [ ] RLS tests pass: `supabase start && supabase test db`.

## Deploy to Vercel

Import the repo, add the same environment variables (set `NEXT_PUBLIC_SITE_URL` to the production URL), and add the production callback URL in Supabase.

## Structure

```
src/app/login, auth/        sign-in, magic-link callback, sign-out
src/app/(app)/              signed-in screens (Capture, Library)
src/components/             UI components
src/lib/supabase/           server + middleware clients (all queries run as the user)
src/lib/validation/         Zod schemas
supabase/migrations/        schema, RLS, triggers
supabase/tests/             pgTAP RLS tests
```

## Design guarantees

- `ideas.original_body` is write-once, enforced by a database trigger.
- `idea_entries` is append-only (no update policy).
- No service-role key is used anywhere; RLS is the security boundary.
