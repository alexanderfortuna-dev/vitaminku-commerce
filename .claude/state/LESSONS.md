# LESSONS (maks 60 baris; format: - [YYYY-MM-DD][#issue] WHEN … DO … BECAUSE …)
- [2026-10-17][setup] WHEN SQL contains DELETE DO ship it as a migration file for the owner BECAUSE the Supabase tool auto-cancels it.
- [2026-10-17][setup] WHEN adding a route DO commit the regenerated src/routeTree.gen.ts BECAUSE typecheck fails without it.
- [2026-10-17][setup] WHEN user_roles.title is set DO use only general_manager|admin BECAUSE a CHECK constraint rejects others.
