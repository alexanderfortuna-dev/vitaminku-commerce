# VitaminKu Roadmap

## Sprint 1 — funnel reliability (done)
- [x] 1. Cart/checkout recovery: no dead pay button, rebuild Shopify cart when missing/expired
- [x] 2. Cart error visibility (quantity, remove, sync, checkout prep) in Indonesian
- [x] 3. Revalidate cart against Shopify before checkout handoff
- [x] 4. ProductCard: pick an available variant, else sold-out state
- [x] 5. PDP: default to available variant, sane quantity limits
- [x] 6. Honest cross-sell label on PDP
- [x] 7. lang="id" + search text hardening
- [x] 8. Mobile fixed CTA bar vs BottomNav / safe-area at 360-430px
- [x] Type + lint clean; live 390px funnel test incl. broken-cart recovery

## Sprint 2 — discovery accuracy (done)
- [x] Promo regression audit; removed promo now cleared from the Shopify cart
- [x] Category/goal filters use real Shopify product types + tags (no collections exist yet)
- [x] Cursor "Muat lagi" on category, goal, search with de-duplication
- [x] Mobile 390px pass on discovery pages; sized product-card images

## Sprint 3 — production readiness audit (done)
- [x] Full audit persisted in docs/production-readiness.md (20 gates, evidence, blockers)
- [x] Double-tap / duplicate checkout tabs fixed (single in-flight prep + tap cooldown)
- [x] 404 + error boundaries localized to Indonesian
- [x] Duplicate StoreStatusBanner catalog request removed (cheap shop probe)
- [x] Normalized order-status vocabulary + disabled delivery-provider adapters (inactive scaffolds)
- [x] Regression tests: bunx vitest run (12 tests)

## Backlog (later sprints)
- Switch catalog mapping to real Shopify collections once the owner creates them
- Search suggestions accessibility (combobox semantics)
- Customer order history + tracking UI — blocked on authenticated order source
- Owner actions: valid SHOPIFY_ADMIN_ACCESS_TOKEN, Shopify reconnect, payments/shipping config

## Round 2 (production readiness, cart hardening) — done
- [x] addItem rebuild keeps all local items (no silent replacement)
- [x] syncCart never clears items without payment evidence; drops stale refs only
- [x] Serial cart write queue; remote quantities win; exact-line check before reusing cart
- [x] Checkout tab claimed inside the tap, same-tab fallback
- [x] docs/production-readiness.md updated with independent evidence
- [ ] BLOCKED: payment method activation in Shopify (gate 8 FAIL), Admin API token, courier credentials

## Milestone A1 — fix and harden
- [x] Admin panel saves to the database catalog (was failing on rejected Shopify admin key)
- [x] Forbidden-product blocklist + trigger (0 existing matches found)
- [x] Floating WhatsApp button (product name prefilled on product pages)
- [x] Server-side order quote from database prices (quoteOrder) + tests
- [ ] Signed-in admin save check — blocked: no admin account exists yet; owner must sign in once at /admin/login

## Seller Center (option A)
- [x] Produk Saya tabs/counts, filters, 50/page, inline price/stock, bulk Tampilkan/Arsipkan/Set stok
- [x] Form: weight, BPOM, 9 photos (WebP 1200), variants; publish rule in DB
- [x] Upload Massal (dry-run, fill/overwrite, batches+resume, server photo download, error CSV), Ubah Massal, Foto Massal ZIP
- [x] Daftar Blokir (owner), Log Aktivitas (owner)
- [ ] Signed-in tests (3 products → cart → WhatsApp, 6-row import in UI, customer refused) — blocked: no owner account
