# LESSONS (maks 60 baris; format: - [YYYY-MM-DD][#issue] WHEN … DO … BECAUSE …)
- [2026-10-17][setup] WHEN SQL contains DELETE DO ship it as a migration file for the owner BECAUSE the Supabase tool auto-cancels it.
- [2026-10-17][setup] WHEN adding a route DO commit the regenerated src/routeTree.gen.ts BECAUSE typecheck fails without it.
- [2026-10-17][setup] WHEN user_roles.title is set DO use only general_manager|admin BECAUSE a CHECK constraint rejects others.
- [2026-10-18][hardening-v1] WHEN a DB test inserts a Live product DO give it price, photo, weight and stock BECAUSE products_guard forces Draf without them and the test then looks like a RLS failure.
- [2026-10-18][hardening-v1] WHEN a prompt assumes a different stack or base branch DO check git/package.json first and state the assumption BECAUSE this repo is TanStack Start and main is the old Lovable code.
