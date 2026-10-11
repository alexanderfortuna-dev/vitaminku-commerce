<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Architecture rules
- Admin product edits write to `public.products` via `src/lib/admin-products.functions.ts` as the signed-in user (RLS + `products_guard` trigger); the storefront reads the same table.
- Forbidden products are enforced in the database (`product_blocklist` + `products_guard` trigger sets `is_blocked`); storefront RLS hides blocked/inactive rows, so never bypass it with the service key for reads.
- Order totals are computed only server-side from database prices (`quoteOrder` / `order-pricing.ts`); never accept prices from the browser.
- Product photos live in the private `product-images` bucket, served via long-lived signed links stored in `image_url`.
- Bulk price/stock import is planned by pure `planImport` (src/lib/bulk-price-stock.ts) and re-planned server-side on save; never trust the browser preview.
- Native checkout: cart is slug-keyed in the browser (`cartStore`); `createOrder` (checkout.functions.ts) re-quotes from DB and re-fetches shipping server-side; payment status changes only through `apply_order_payment_status` (idempotent, one-time stock decrement) via the signed Midtrans webhook or mock path. There is no simulated payment: without a Midtrans key `resolveModes` gives WhatsApp ordering (status `menunggu_konfirmasi`, stock untouched) and staff confirm/cancel via `staff_confirm_order`/`staff_cancel_order` (role-checked, one-time stock change).
- Guests read orders only via `get_order_by_token` (unguessable token); no browser writes to orders.
- Vita assistant: streaming server route `/api/vita-chat` (`vita-chat.server.ts`) reads the catalog as anon with `is_purchasable`, blocks forbidden requests before the model (`vita-safety.ts`), rate-limits via `chat_rate_hit`, and finds orders only through tokens saved in this browser or pasted links; the chat UI is lazy-loaded and never persisted.
- Seller Center = the /admin panel (/seller redirects there); its server logic lives in `src/lib/seller.functions.ts` + pure planner `src/lib/seller-import.ts`. Why: one panel, one set of role checks.
- Publish rule (price>0, photo, stock>=0, weight>0, not blocked) is enforced by `products_guard` only when a product goes Live (insert or Draf→Live); already-Live products keep status. Why: owner chose rules for new/changed products only.
- `products.images` is the gallery (max 9); the trigger keeps `image_url` = first photo. `slug` is generated from `name`, so variants get name+flavour/size. New product columns need explicit column GRANTs (products uses column-level privileges).
- Promos live in `public.promos` (anon sees only running rows, public columns); the browser sends only a code and `quoteLines` re-prices from DB via pure `src/lib/promo.ts` + `quoteOrderLines`. Strike-through/promo badges render only while a matching promo is running. Why: no fake discounts, no client-set prices.
- Branch auto-select uses straight-line Haversine (`src/lib/geo.ts`) only after the customer taps "Gunakan lokasi saya"; branches without coordinates are never auto-picked. Why: honest distance, explicit consent.
