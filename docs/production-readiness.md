# VitaminKu — Production Readiness Audit

Run date: 2026-09-17 (UTC). Store: `vitaminku-commerce-u8xhy-ja6xbxet.myshopify.com` (claimed
Shopify store). Baseline preserved: `f0ebd10a4c89793915d533a040e98205ea95512e`.
Nothing was published. No Shopify or backend business data was created, changed or deleted.

Evidence types used below:
- **CODE** — read/verified in this repository
- **API** — real HTTP call against the live Shopify API
- **BROWSER** — real Playwright run against the running app (390px unless stated)
- **UNIT** — vitest logic test (never treated as payment/delivery end-to-end proof)

## Test commands and results

| Command | Result |
| --- | --- |
| `bunx tsgo --noEmit` | 0 errors |
| `bunx eslint src` | 1 error + 7 warnings, all in auto-generated/vendored files (`src/integrations/supabase/previewAuthStorage.ts`, shadcn `src/components/ui/*`, `src/routes/admin/route.tsx` fast-refresh warning). No errors in hand-written commerce code. |
| `bun run build` | Production build succeeds (client + SSR + nitro worker) |
| `bunx vitest run` | 12 tests passed (`src/lib/__tests__/commerce.test.ts`) |
| Playwright 360/390/430px, 9 routes | 27/27 route+width combinations: no horizontal overflow |
| Playwright funnel 390px | search → PDP → add to cart → cart → payment tab (real Shopify `/checkouts/cn/...` URL with `channel=online_store`) |
| Storefront GraphQL `POST /api/2026-07/graphql.json` | HTTP 200, 6 products, product types + tags present |
| Admin GraphQL `POST /admin/api/2026-07/graphql.json` and `2025-07` | **HTTP 401** `Invalid API key or access token` |
| Client bundle secret scan (`grep -rE "shpat_|shpca_|SHOPIFY_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE|ADMIN_BOOTSTRAP" dist/client`) | No matches |

## Fixed in this run

| Issue | Severity | File |
| --- | --- | --- |
| Repeated taps on "Lanjut ke Pembayaran" opened multiple payment tabs (BROWSER-verified: 3 taps → 3 tabs) | P1 | `src/routes/keranjang.tsx`, `src/stores/cartStore.ts` (single in-flight checkout preparation + tap cooldown; now 3 taps → 1 tab, one Shopify checkout) |
| 404 page and error boundaries were in English on an Indonesian storefront | P2 | `src/routes/__root.tsx`, `src/lib/error-page.ts` |
| Store-status banner issued a duplicate catalog request on every page | P2 | `src/components/StoreStatusBanner.tsx`, `src/lib/shopify.ts` (`storeStatusQueryOptions`, cheap `shop { name }` probe, 5-min stale time) |
| No normalized order/delivery status vocabulary; risk of future fabricated statuses | scaffold | `src/lib/order-status.ts` (inactive, tested) |
| No provider boundary for couriers; risk of fake selectable shipping | scaffold | `src/lib/delivery-providers.ts` (all third-party providers `enabled: false`) |
| No automated regression tests | P2 | `src/lib/__tests__/commerce.test.ts` |
| `addItem` with no `cartId` created a Shopify cart containing ONLY the new item, silently dropping retained local items | **P0** | `src/stores/cartStore.ts` (`rebuildCart` from merged lines; BROWSER-verified: 2 items kept, both with line ids) |
| `syncCart` cleared the whole cart when Shopify reported `totalQuantity === 0`, assuming payment without payment evidence | **P0** | `src/stores/cartStore.ts` (now drops only stale `cartId`/`checkoutUrl`/applied code; BROWSER-verified: missing remote cart → 2 items kept, `cartId` null) |
| `syncCart` wrote back a pre-`await` snapshot, able to overwrite a concurrent edit | P1 | `src/stores/cartStore.ts` (re-reads `get().items`, reconciles against fresh remote lines) |
| Cart writes had no store-level in-flight guard; add/update/remove/prepare could interleave | P1 | `src/stores/cartStore.ts` (`enqueueCartWork` serial queue, re-entrant safe; BROWSER-verified: 4 rapid quantity taps → consistent single quantity, no duplicate lines) |
| Remote mutation response quantities were ignored (local quantity trusted over Shopify) | P1 | `src/stores/cartStore.ts` (add/update mutations now return `quantity`; `parseRemoteLines` + `reconcileItems`, 4 UNIT tests) |
| `prepareCheckout` reused an existing cart on `totalQuantity > 0` alone, without comparing exact remote lines | P1 | `src/stores/cartStore.ts` (`remoteLinesMatch` exact variant+quantity comparison, else rebuild) |
| `window.open` fired after an awaited API call, exposed to mobile popup blockers | P1 | `src/routes/keranjang.tsx` (tab claimed synchronously inside the tap; same-tab fallback when blocked; BROWSER-verified: 2 rapid taps → 1 tab, one checkout URL) |

## Audit results

### Customer journey
| Area | Status | Evidence |
| --- | --- | --- |
| Home, category, goal, search discovery | PASS | BROWSER: all render real Shopify products; category/goal use real `product_type`/`tag` queries (CODE `src/lib/catalog.ts`, UNIT) |
| Search hardening | PASS | UNIT: operators/quotes stripped; BROWSER: "vitamin" → 6 results |
| Cursor pagination "Muat lagi" | PARTIAL | CODE + UNIT dedupe; button not observable live because the catalog has only 6 products (< page size 12) |
| PDP data, price, variants, sold-out safety | PASS | BROWSER: price and CTA present; CODE: available-variant selection, max 99 qty |
| Cart: add, quantity, remove, save-for-later, visible errors | PASS | BROWSER + CODE |
| Cart never silently lost | PASS | BROWSER: cart intact after checkout hand-off and after forced cart corruption |
| Expired/missing Shopify cart recovery | PASS | BROWSER: `cartId` overwritten with a broken id → fresh checkout URL, 1 item preserved, 1 tab |
| Promo (blank / invalid / valid / cleared / after rebuild) | PASS | BROWSER: invalid code shows a notice and checkout still proceeds; blank changes nothing; CODE: code re-applied on rebuild, cleared code removed from the Shopify cart |
| Revalidation before payment | PASS | CODE `prepareCheckout` re-reads every variant from Shopify before hand-off |
| Checkout hand-off | PASS | BROWSER: real `/checkouts/cn/...` URL, opened in one new tab |
| Order confirmation | PARTIAL | Shopify checkout owns confirmation and email; not verifiable without a test order |
| Order history / tracking UI | BLOCKED | Not implemented on purpose. `/akun` states honestly that customer login, order history and tracking are not available yet |
| Support | PARTIAL | `/bantuan` exists; no verified official support channel supplied by the owner |
| Empty / loading / error states | PASS | BROWSER: empty cart, empty wishlist, retry banner, skeleton grids |
| Mobile 360/390/430px | PASS | BROWSER: no overflow on 27 combinations; CTA 44px tall, above the bottom nav with safe-area padding |

### Payment
| Item | Status | Evidence |
| --- | --- | --- |
| Payment implementation | PARTIAL | Payment happens entirely on Shopify's hosted checkout (CODE + BROWSER). The app never handles card data. |
| Configured providers/methods (QRIS, VA, cards, e-wallets) | BLOCKED | Cannot be inspected: Admin API returns 401 and the Shopify MCP tools return `shopify_reauth_required`. No method is claimed anywhere in the UI. |
| Midtrans | Not installed | CODE: no Midtrans dependency, code or secret. No migration attempted. |
| Successful test transaction / order created | BLOCKED | No safe test environment available (no Shopify test-mode access, live money forbidden) |
| Cancellation / back navigation | PASS | BROWSER: leaving checkout keeps the cart and the same checkout URL |
| Checkout language | PARTIAL | Checkout resolves to `/en-id` (English). Owner must add Bahasa Indonesia in Shopify → Settings → Languages. |

### Delivery and tracking
| Item | Status | Evidence |
| --- | --- | --- |
| Shipping rates / profiles / fulfillments | BLOCKED | Admin API 401; cannot inspect. Shipping is quoted by Shopify checkout only. |
| Delivery fee shown in app | Not shown, by design | CODE: cart says shipping and tax are calculated at payment |
| GoSend / GrabExpress / Maxim | BLOCKED | No merchant credentials or verified API access. Adapters exist and are disabled (`src/lib/delivery-providers.ts`). Nothing selectable, no invented fees or endpoints. |
| Tracking UI | BLOCKED (scaffolded) | `src/lib/order-status.ts` defines the normalized statuses and Indonesian labels and maps only real Shopify financial/fulfillment signals; unknown values map to `UNKNOWN`. No UI, no public order lookup, so no guessable order enumeration exists. |

Activation dependency for tracking: an authenticated order source — Shopify Customer Accounts,
or a valid Admin API key (`SHOPIFY_ADMIN_ACCESS_TOKEN`) plus authenticated per-customer order
access. Webhook handling (signature verification, idempotency, out-of-order protection) is not
implemented and must not be until that dependency is met.

### Admin panel
| Item | Status | Evidence |
| --- | --- | --- |
| Login (email + password + activation code) | PARTIAL | CODE: no public sign-up; bootstrap owner requires `ADMIN_BOOTSTRAP_SECRET`, constant-time compare, 5 failures / 15 min / IP. First real login not yet performed by the owner. |
| Server-side role checks | PASS | CODE: roles live in the `user_roles` table with RLS + `has_role()` SECURITY DEFINER; every server function verifies the JWT and the role. No role data in user-editable metadata. |
| Customers cannot reach admin | PASS | CODE: `/akun` shows the admin link only when the signed-in user has a role; server rejects unauthorised calls with 401/403 |
| Keys server-side only | PASS | CODE + bundle scan: Shopify Admin token is only read inside server functions (`src/lib/shopify-admin.server.ts`) |
| Product / image / price / status management | BLOCKED | Code complete, every write fails with Admin API 401 |
| Order / payment / fulfillment / customer lookup | Not implemented | Depends on the same Admin API key |
| No duplicated Shopify data | PASS | Backend holds only `user_roles` and `admin_audit_log` |

### Trust
PASS — no reviews, ratings, countdowns, scarcity claims, fake ETAs or unverified payment logos
anywhere in the storefront (CODE grep + BROWSER copy inspection). Prices, variants and stock come
from Shopify at request time.

## The 20 critical gates

| # | Gate | Status |
| --- | --- | --- |
| 1 | Mobile customer journey | PASS |
| 2 | Search & category discovery | PASS |
| 3 | Product data correctness | PASS |
| 4 | Stock accuracy | PARTIAL — `availableForSale` respected; exact remaining quantity is not exposed by the storefront token |
| 5 | Cart | PASS |
| 6 | Promo | PASS |
| 7 | Checkout hand-off | PASS |
| 8 | Payment method verified | **FAIL (confirmed launch blocker)** — Shopify checkout states "This store can't accept payments right now", *Pay now* disabled. Independently observed by the owner on the published site and reproduced here (BROWSER, `/checkouts/cn/.../en-id`). No payment method is active. |
| 9 | Successful test transaction | BLOCKED — impossible while gate 8 fails; no test-mode gateway exists on this store |
| 10 | Order created correctly | BLOCKED |
| 11 | Delivery method | BLOCKED |
| 12 | Delivery fee | BLOCKED |
| 13 | Tracking works / honest provider link | BLOCKED (honest: not offered) |
| 14 | Admin login | PARTIAL |
| 15 | Product management | BLOCKED |
| 16 | Order management | BLOCKED |
| 17 | Secrets secure | PASS |
| 18 | No critical runtime/console errors | PASS |
| 19 | Production build | PASS |
| 20 | No P0/P1 commerce bugs | PASS (as of this run; gates 8-16 are untested risk, not known bugs) |

**Score: 10/20 PASS, 3 PARTIAL, 6 BLOCKED, 1 FAIL (gate 8, payments). NOT production-ready.**

## Owner actions required (exact)

1. **Shopify Admin API key** — Shopify admin → Settings → Apps and sales channels → Develop apps →
   create app → Admin API access scopes: `read_products`, `write_products`, `read_product_listings`,
   `write_files`, and (for gate 16 later) `read_orders`, `read_fulfillments`. Install the app, copy
   the Admin API access token, save it in Project Settings → Secrets as
   **`SHOPIFY_ADMIN_ACCESS_TOKEN`**. Unblocks gates 15, 16 and admin verification.
2. **Reconnect the Shopify account in Lovable** — the project's temporary store token has expired
   (`shopify_reauth_required`), which blocks payment/shipping inspection from here.
3. **Payments** — enable the payment methods you actually want (QRIS/VA/e-wallet/cards) in Shopify
   → Settings → Payments, then confirm; only then may the app mention them.
4. **Shipping** — configure real shipping zones/rates in Shopify → Settings → Shipping and delivery.
5. **Checkout language** — add Bahasa Indonesia in Shopify → Settings → Languages so checkout is
   not English.
6. **Support channel** — supply the real support email/WhatsApp so `/bantuan` can state it.
7. **Activation code** — replace `ADMIN_BOOTSTRAP_SECRET` in Project Settings → Secrets with a code
   you choose, then complete the first owner login at `/admin/login`.

## Known remaining P0/P1 bugs
Gate 8 (payments) is a **confirmed P0 launch blocker owned by store configuration, not code**: no payment method is active on the Shopify store, so no order can be placed. No other P0/P1 commerce bug is known after this round; the six baseline cart risks raised independently are fixed and tested. Everything else BLOCKED/PARTIAL is untested risk, not an observed bug.

## Round 2 — independent evidence incorporated (owner-supplied + reproduced here)

| Owner finding | Status here |
| --- | --- |
| Live published site funnel (Home → VitaFit Whey Protein 907g → Vanila → cart → blank-promo checkout): variant, quantity 1 and Rp429.000 agree in cart and Shopify checkout | Consistent with BROWSER runs here (cart total equals checkout total). No payment submitted. |
| Shopify checkout shows "This store can't accept payments right now", *Pay now* disabled | **Reproduced (BROWSER). Reclassified from BLOCKED/unknown to confirmed launch blocker (gate 8 FAIL).** |
| Invalid code `VITAMINKU_QA_INVALID_20260917` still allows checkout hand-off | Intended behaviour (promo is optional and must never block payment); Shopify rejects the code, the shopper is told it does not apply, checkout proceeds without a discount. |
| Baseline `cartStore.ts` risks (cart replacement on rebuild, sync clearing without payment evidence, stale snapshot writes, no in-flight guard, reuse without exact line comparison, ignored remote quantities) | **All six fixed and tested this round — see "Fixed in this run".** Fixes are CODE + UNIT + BROWSER verified; no payment/delivery claim is derived from them. |
| Backend read-only review: RLS on `user_roles`, `admin_audit_log`, legacy `products`; `has_role` checks `is_active` | Confirmed. Legacy `public.products` holds 1.413 rows, is referenced by **no** application code (`rg "from('products'" src` → no matches) and was left completely untouched. Commerce data is not duplicated anywhere; Shopify remains the only source of truth. |
| GoSend API requires merchant registration, NDA, staging, commercial agreement/integration fee, UAT, production credentials (gojek.com/en-id/gosend/api) | Recorded. Adapter stays `enabled: false`; nothing selectable, no rates, no tracking. |
| GrabExpress requires per-country/city enablement by a Grab PIC, OAuth `client_id`/`client_secret`, `grab_express.partner_deliveries` scope (developer.grab.com/docs/grab-express) | Recorded. Adapter stays `enabled: false`. |
| Maxim public Delivery page proves consumer service only, not merchant API access | Recorded. Adapter stays `enabled: false`; activation remains BLOCKED. |
| Cloud preview requires login for an external browser | Acknowledged; all browser evidence here is against the latest code on the project's own dev server at 360/390/430px. |

No credential, endpoint, rate, ETA or tracking link has been invented for any courier.

### Round 2 commands and results

| Command | Result |
| --- | --- |
| `bunx tsgo --noEmit` | 0 errors |
| `bunx vitest run` | 16 passed (12 previous + 4 new cart-reconciliation tests) |
| `bun run build` | see final run below |
| Playwright `/tmp/browser/pr/cart2.py` (390px) | add item → force-clear `cartId`/`checkoutUrl` → add second item: **both items kept, both line ids present, cart rebuilt**; point `cartId` at a non-existent cart → open `/keranjang`: **2 items kept, `cartId` cleared, nothing lost**; 4 rapid quantity taps: single consistent quantity; 2 rapid checkout taps: **1 tab**, one `/checkouts/cn/...` URL, cart total = checkout total; 0 page errors |
| Backend read-only count query | `products` 1.413 rows (legacy, unused, untouched), `user_roles` 0 rows (no owner activated yet — gate 14 stays PARTIAL), `admin_audit_log` 0 rows |
