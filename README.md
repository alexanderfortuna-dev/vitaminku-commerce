# VitaminKu Commerce

VITAMINKU — MASTER BUILD PROMPT FOR LOVABLE



Production-Grade Indonesian Vitamin & Sports Nutrition E-Commerce



You are acting as the combined:



- Chief Product Officer

- Senior E-Commerce UX Designer

- Senior Frontend Engineer

- Senior Backend Architect

- Conversion Rate Optimization Expert

- Mobile Commerce Specialist

- Shopify Commerce Architect

- Indonesian Consumer UX Specialist

- SEO & Performance Engineer

- QA Engineer



Your mission is to build VitaminKu, the most complete, trustworthy, easiest-to-use vitamin, supplement, wellness, and sports nutrition e-commerce experience in Indonesia.



This must NOT feel like a generic AI-generated store.



It should feel like a world-class commerce product combining the best principles of:



- iHerb — supplement credibility and product depth

- Decathlon — category clarity and easy product discovery

- Amazon — search and purchasing efficiency

- Zalora — polished mobile commerce

- modern pharmacy apps — trust and simplicity



But do NOT copy their designs.



Create a unique VitaminKu design system and user experience.



---



0. ABSOLUTE CREDIT-EFFICIENCY RULE



Before making changes:



1. Inspect the entire existing project.

2. Identify what already works.

3. Preserve all working components, routes, database structure, integrations, and UI that meet this specification.

4. DO NOT rebuild functioning sections unnecessarily.

5. Modify only what is missing, broken, inconsistent, or materially inferior.

6. Reuse existing components whenever possible.

7. Avoid duplicate components, duplicate routes, duplicate database tables, and duplicate business logic.

8. Do not perform cosmetic micro-changes before core functionality works.

9. Do not repeatedly redesign the same page.

10. Build shared reusable components first.



If this is an existing VitaminKu project, CONTINUE FROM THE CURRENT STATE.



Do not restart from scratch unless a component is fundamentally unusable.



Do not ask unnecessary questions.



When information is missing but not business-critical, make the strongest reasonable e-commerce assumption and continue.



Only request credentials/API keys when they are genuinely required for an external integration.



Never waste a build cycle simply explaining what you plan to do.



PLAN INTERNALLY → IMPLEMENT → VERIFY.



---



1. BRAND



Brand name:



VitaminKu



Primary positioning:



E-commerce Vitamin Terlengkap Indonesia



Core brand values:



- Complete

- Original

- Trusted

- Healthy

- Modern

- Easy

- Friendly

- Professional

- Premium but accessible



VitaminKu should feel trustworthy enough for parents buying vitamins, modern enough for Gen Z, and serious enough for athletes buying advanced supplements.



Use the uploaded VitaminKu logo / brand-board as the primary visual reference if available.



Do NOT redesign the logo unless specifically requested.



---



2. DESIGN DIRECTION



The design must be:



clean + premium + extremely easy to navigate + mobile-first.



Primary visual language:



- White / very light neutral background

- Deep navy or near-black typography

- VitaminKu fresh green as primary action color

- Subtle emerald/green gradients only where appropriate

- Very limited yellow accent if consistent with logo

- Generous whitespace

- Rounded cards

- Soft borders

- Subtle shadows

- Strong product photography

- Minimal clutter



Avoid:



- excessive gradients

- giant hero sections

- excessive animations

- too many badges

- crowded cards

- tiny text

- generic SaaS appearance

- excessive green everywhere

- unnecessary glassmorphism

- excessive promotional banners

- desktop-first layouts



The store must feel comfortable enough to browse for 20–30 minutes without visual fatigue.



---



3. MOBILE FIRST — NON NEGOTIABLE



Design first for:



360–430 px smartphones



Then adapt responsively for:



tablet → laptop → desktop.



Approximately 80% of design decisions should prioritize mobile shopping.



Important touch targets should be large and thumb-friendly.



Mobile bottom navigation:



Beranda

Kategori

Cari

Keranjang

Akun



Keep key actions reachable with one hand.



Use sticky elements strategically, not excessively.



---



4. PRIMARY CUSTOMER OBJECTIVE



A first-time customer should be able to:



OPEN APP

→ FIND PRODUCT

→ UNDERSTAND PRODUCT

→ ADD TO CART

→ CHECKOUT



with minimal friction.



Target:



product discovery to checkout in under 120 seconds.



Do not force registration before checkout.



Support:



Guest Checkout



Then offer account creation after purchase.



---



5. LANGUAGE SYSTEM



Default:



Bahasa Indonesia



Secondary:



English



Header language selector:



"ID | EN"



Never show both languages simultaneously.



All major content must support localization:



- navigation

- search

- category labels

- buttons

- product fields

- cart

- checkout guidance

- account

- order tracking

- policies

- educational pages

- system messages



Build translation structure centrally.



Do not hardcode translations separately across dozens of components.



---



6. COMMERCE ARCHITECTURE



Use:



Lovable = custom VitaminKu customer experience / storefront



Shopify = primary commerce engine



Shopify should be the source of truth whenever possible for:



- products

- variants

- inventory

- pricing

- discounts

- checkout

- orders

- customers

- fulfillment-related commerce data



Avoid maintaining duplicate product/order databases unnecessarily.



Use Shopify integration cleanly.



Use Lovable Cloud / Supabase only when extra application data is genuinely required, for example:



- extended customer profile

- wishlist

- recently viewed

- personalized preferences

- notification preferences

- custom loyalty metadata

- educational content metadata

- internal app configuration



If Shopify is not connected yet:



build all UI and architecture integration-ready WITHOUT inventing fake completed transactions.



Clearly isolate API adapters.



---



7. PRODUCT DATABASE SCALABILITY



Architecture must support:



1,000 SKUs immediately



and scale toward:



10,000+ SKUs



without redesigning the system.



Product model should accommodate:



- Brand

- Product name

- Product slug

- Category

- Subcategory

- Goal

- Product type

- Size

- Flavor

- Variant

- Number of servings

- Capsule/tablet count

- Price

- Compare-at price

- Discount

- Stock

- SKU

- Barcode

- Images

- Ingredients

- Supplement facts

- Benefits

- Usage

- Warnings

- BPOM number

- Halal status

- Country of origin

- Expiry information when appropriate

- Tags

- Search keywords

- Related products

- SEO title

- SEO description



Do not overload product cards with all this information.



---



8. CATEGORY ARCHITECTURE



Main categories should include:



Vitamins & Minerals



- Multivitamin

- Vitamin A

- Vitamin B

- Vitamin C

- Vitamin D

- Vitamin E

- Vitamin K

- Magnesium

- Zinc

- Calcium

- Iron

- Electrolytes



Sports Nutrition



- Whey Protein

- Isolate Protein

- Vegan Protein

- Mass Gainer

- Creatine

- Pre-Workout

- Amino / BCAA / EAA

- Electrolytes

- Recovery

- Energy

- Sports Performance



Wellness



- Immunity

- Sleep

- Stress

- Digestive Health

- Heart Health

- Joint & Bone

- Brain & Focus

- Healthy Aging

- Anti-Aging

- Energy



Men's Health



Women's Health



Mom & Kids



Beauty From Within



Herbal & Natural



Weight Management



Healthy Aging



Accessories



Architecture must allow categories to expand later without redesign.



---



9. SHOP BY GOAL



This is strategically important.



Create:



Belanja Sesuai Kebutuhanmu



Examples:



- Bangun Otot

- Turunkan Berat Badan

- Tingkatkan Energi

- Tidur Lebih Nyenyak

- Fokus & Produktivitas

- Jaga Imunitas

- Kesehatan Jantung

- Tulang & Sendi

- Pencernaan

- Healthy Aging

- Men's Performance

- Women's Wellness



This section should make VitaminKu easier for customers who don't know what supplement name they need.



---



10. HOMEPAGE



Mobile homepage order:



A. Compact Header



VitaminKu logo



Search field prominent.



Icons:



notifications only if implemented,

cart,

account.



B. Search



Large search:



“Cari vitamin, whey, creatine...”



Autocomplete should suggest:



products,

brands,

categories,

goals.



C. Hero



Keep hero compact.



Example:



Lengkap. Original. Terpercaya.



“Semua kebutuhan vitamin & supplement dalam satu tempat.”



CTA:



Belanja Sekarang



Secondary:



Cari Sesuai Kebutuhan



Do not consume the entire mobile screen with hero artwork.



D. Trust Strip



Examples:



✓ 100% Original

✓ Produk Terlengkap

✓ Pembayaran Aman

✓ Pengiriman Indonesia



E. Shop by Goal



Horizontal mobile-friendly cards.



F. Popular Categories



G. Best Sellers



H. Promo Hari Ini



I. Recommended For You



Only personalized when enough data exists.



Otherwise display smart curated recommendations.



J. Popular Brands



K. New Arrivals



L. Healthy Knowledge / Learn



Short educational content.



Do not allow editorial content to dominate commerce.



---



11. SEARCH EXPERIENCE



Search is a CORE VitaminKu feature.



Implement fast search with:



- autocomplete

- recent searches

- popular searches

- category suggestions

- brand suggestions

- typo tolerance where technically reasonable

- keyword matching

- empty-state recommendations



Example:



User searches:



"magnesiun"



System should still help find Magnesium products where possible.



Search result filters:



- Brand

- Category

- Goal

- Price

- Rating if real ratings exist

- Product form

- Flavor

- Stock

- Dietary preference

- BPOM where appropriate

- Halal where appropriate



Sorting:



- Paling Relevan

- Terlaris

- Harga Terendah

- Harga Tertinggi

- Terbaru

- Diskon Terbesar



Mobile filters should open as bottom sheet / drawer.



---



12. PRODUCT CARD



Keep cards clean.



Show only:



Product image



Brand



Product name



Size / essential variant



Price



Compare price when relevant



Discount %



Rating only if legitimate rating data exists



Stock urgency only when true



Simple CTA:



+ Keranjang



Wishlist heart.



Do not place paragraphs on product cards.



---



13. PRODUCT DETAIL PAGE



Prioritize above-the-fold information:



Product gallery



Brand



Product name



Variant



Rating/review if available



Price



Discount



Stock status



Variant selector



Quantity



Primary CTA:



Tambah ke Keranjang



Optional direct CTA:



Beli Sekarang



Trust line:



100% Original



Below:



Manfaat Utama



Use 3–5 concise bullets.



Deskripsi



Supplement Facts / Nutrition Facts



Ingredients



Cara Konsumsi



BPOM / Certifications



Only display verified information.



Never fabricate BPOM, halal certification, health claims, ratings, stock urgency, or certifications.



Cocok Untuk



FAQ



Produk Serupa



Sering Dibeli Bersama



Mobile:



sticky bottom Add-to-Cart area.



---



14. CART



Cart must be extremely simple.



Allow:



- quantity edit

- remove

- save for later

- variant clarity

- voucher entry

- shipping estimate if available

- subtotal

- discounts

- total



Show recommended cross-sell products carefully.



Do NOT interrupt checkout with aggressive upsells.



Main CTA:



Checkout



---



15. CHECKOUT EXPERIENCE



Checkout must feel safer and easier than marketplace checkout.



Goal:



minimum friction.



Support customer expectations for Indonesia.



Payment architecture must be provider-agnostic and capable of displaying relevant configured methods such as:



- QR payment

- bank transfer / virtual account

- e-wallet

- debit / credit card

- other Shopify-compatible payment methods



Never fake a successful payment.



Shipping system should support configured options such as:



- Instant

- Same Day

- Regular

- Economy



when provided by the connected commerce/shipping infrastructure.



Checkout hierarchy:



CONTACT

→ ADDRESS

→ DELIVERY

→ PAYMENT

→ REVIEW

→ PAY



Clear progress indicator.



Preserve cart if checkout is abandoned.



---



16. AUTHENTICATION



Do NOT require registration to browse.



Support:



- Guest checkout

- Email login

- Email registration

- Google login when configured

- Forgot password

- secure session handling



Registration form must be minimal.



After purchase:



offer:



“Buat akun untuk pantau pesanan dan checkout lebih cepat berikutnya.”



---



17. CUSTOMER ACCOUNT



Pages:



Profil Saya



Pesanan Saya



Lacak Pesanan



Beli Lagi



Wishlist



Alamat



Voucher



Notifikasi



Bahasa



Bantuan



Keluar



Make Beli Lagi / Reorder prominent.



Repeat purchase is important for supplements.



---



18. REORDER SYSTEM



VitaminKu products are recurring purchases.



Create:



Beli Lagi



Show previously purchased products.



Allow:



"Tambah Semua ke Keranjang"



or individual reorder.



Architecture should later support smart reorder reminders.



Do not build unnecessary reminder complexity unless infrastructure is ready.



---



19. WISHLIST



Heart icon.



Logged-out users may maintain temporary local wishlist where feasible.



After login, sync appropriately.



---



20. TRUST SYSTEM



VitaminKu must communicate authenticity strongly WITHOUT looking cheap.



Trust indicators:



100% Original



Produk Terpercaya



Pembayaran Aman



Pengiriman Terpercaya



Customer Support



Avoid giant repetitive trust badges.



Use clean, subtle placement.



---



21. BRANDS



Create brand directory:



A–Z



Search brand



Featured brands



Brand landing pages.



Architecture should support hundreds of brands.



---



22. PROMOTIONS



Support:



- percentage discounts

- fixed discounts

- product promotions

- collection promotions

- vouchers

- bundles when supported

- free shipping communication

- campaign landing pages



Do not create conflicting discount logic outside Shopify if Shopify controls promotions.



---



23. PRODUCT REVIEWS



Only enable reviews if real review infrastructure exists.



Never create fake reviews.



Display:



average rating,

review count,

verified purchase indicator when supported,

review photos where supported.



---



24. CUSTOMER SUPPORT



Create Help Center.



Primary topics:



- Cara Belanja

- Pembayaran

- Pengiriman

- Retur

- Keaslian Produk

- Pesanan

- Akun

- Hubungi Kami



Provide WhatsApp support entry if official number is configured.



Do not hardcode an invented number.



---



25. HEADER — DESKTOP



Desktop:



VitaminKu logo



large search



categories



Shop by Goal



Brands



Promo



Cart



Account



Language selector



Keep navigation simple.



---



26. DESKTOP EXPERIENCE



Desktop should NOT simply stretch the mobile interface.



Use:



larger product grids,

better filter sidebar,

mega-menu when helpful,

comfortable max-width container,

strong search prominence.



Maintain the same design system.



---



27. PWA / APP-LIKE EXPERIENCE



Build VitaminKu as an installable, app-like mobile web experience where supported.



Requirements:



- responsive

- proper icons

- app manifest where appropriate

- fast loading

- touch-friendly

- standalone-friendly

- safe-area awareness

- persistent navigation

- proper loading states

- offline-friendly handling where reasonable



The architecture should remain clean enough for future mobile-app packaging or native expansion.



---



28. PERFORMANCE



Performance is part of UX.



Optimize for:



- mobile networks

- lazy loading

- responsive images

- image compression

- minimized layout shifts

- efficient components

- code splitting where appropriate

- skeleton loaders

- caching where appropriate



Avoid unnecessary JavaScript and oversized visual effects.



Prioritize perceived speed.



---



29. SEO



Build correct:



semantic HTML



metadata



canonical URLs



product schema where applicable



breadcrumb structure



category indexing



product indexing



OpenGraph



clean URLs



sitemap readiness



robots readiness



Example:



"/products/nutrabio-creatine-monohydrate-500g"



not meaningless IDs whenever possible.



---



30. ANALYTICS EVENTS



Prepare analytics event architecture for:



- view_home

- search

- view_category

- view_product

- add_to_cart

- remove_from_cart

- begin_checkout

- add_shipping_info

- add_payment_info

- purchase

- wishlist

- login

- sign_up

- promo_click

- reorder



Do not duplicate events.



---



31. CONVERSION METRICS



Design around:



CTR



Product View → Add to Cart



Add to Cart → Checkout



Checkout → Purchase



AOV



Repeat Purchase Rate



Search → Product Click



Homepage → Product Discovery



Every UX decision should improve one of these metrics.



---



32. ADMIN / OWNER EXPERIENCE



Do NOT unnecessarily rebuild Shopify admin.



Shopify remains the primary commerce management backend.



Create custom VitaminKu admin functionality only if it adds real value beyond Shopify.



Avoid wasting development effort duplicating:



products,

orders,

inventory,

customers,

discount administration



unless technically necessary.



---



33. DATABASE & SECURITY



Follow least-privilege architecture.



Protect:



- customer information

- addresses

- orders

- payment-related data

- admin routes

- API secrets



Never expose private keys in frontend code.



Use environment secrets.



If Supabase is used:



create appropriate Row Level Security policies.



Separate customer/admin permissions clearly.



Run security checks before production release.



---



34. ERROR STATES



Every important flow needs:



loading



success



error



empty state



retry state



Examples:



- empty cart

- no wishlist

- no orders

- no search results

- API failure

- inventory unavailable

- checkout error

- network error



Messages must be human and easy to understand.



---



35. ACCESSIBILITY



Maintain:



strong contrast



keyboard support where appropriate



accessible labels



alt text



usable font size



clear focus state



touch-friendly controls



Do not sacrifice accessibility for visual aesthetics.



---



36. MICROCOPY



Tone:



simple,

helpful,

warm,

trustworthy.



Do not sound robotic.



Examples:



Instead of:



“Authentication required.”



Use:



“Masuk untuk melihat pesananmu.”



Instead of:



“Transaction successful.”



Use:



“Pesanan berhasil dibuat.”



---



37. EMPTY STATES



Make empty states commercially useful.



Example:



Wishlist empty:



Belum ada produk favorit.



“Temukan vitamin dan suplemen yang cocok untuk kebutuhanmu.”



CTA:



Jelajahi Produk



---



38. SEED CONTENT



If real product data is not yet connected:



use only a SMALL number of realistic placeholders necessary to validate UI.



Do NOT waste time generating hundreds of fake SKUs.



Prepare the system for bulk Shopify import instead.



Real product catalog will eventually be imported in bulk.



---



39. UI COMPONENT SYSTEM



Create reusable components for:



Header



Mobile navigation



Search



ProductCard



Price



Rating



Badges



CategoryCard



GoalCard



BrandCard



PromoCard



ProductGallery



VariantSelector



QuantitySelector



AddToCart



CartDrawer



FilterDrawer



Breadcrumb



TrustStrip



EmptyState



LoadingSkeleton



Modal



Toast



LanguageSwitcher



Do not duplicate component logic.



---



40. GLOBAL UX RULES



Every clickable element must work.



No dead buttons.



No misleading buttons.



No fake checkout.



No broken navigation.



No lorem ipsum.



No random stock numbers.



No fake reviews.



No fake certifications.



No fake medical claims.



No unnecessary popups.



No autoplay videos.



No aggressive signup wall.



No excessive promotional banners.



No horizontal overflow.



No inconsistent spacing.



No inconsistent button styles.



---



41. CHECKOUT SPEED TARGET



Optimize the purchase journey aggressively.



Existing customer:



target approximately:



HOME

→ PRODUCT

→ ADD CART

→ CHECKOUT

→ PAYMENT



with as few meaningful taps as realistically possible.



Never sacrifice transaction clarity or security merely to reduce one click.



---



42. RESPONSIVE QA



Verify at minimum:



360px



390px



430px



768px



1024px



1440px



Check:



navigation



search



cards



filters



product page



cart



checkout



forms



modals



account



footer



No broken layouts.



---



43. FINAL IMPLEMENTATION PRIORITY



Execute in this order:



P0 — COMMERCE CORE



Design system

Navigation

Search

Categories

Product listing

Product detail

Cart

Checkout integration

Authentication

Orders

Responsive mobile experience



P1 — CONVERSION



Shop by Goal

Wishlist

Beli Lagi

Best sellers

Bundles / related products

Trust system

Promotions

Brand pages



P2 — RETENTION



Personalization

Educational content

Notifications

Loyalty-ready architecture

Advanced recommendations



Do NOT spend build cycles on P2 while P0 has broken functionality.



---



44. QUALITY GATE



Do not consider VitaminKu complete merely because pages visually exist.



A feature counts
This project was built with [Lovable](https://lovable.dev).

**Live app**: https://vitaku-shop.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ceb042d8-dbf5-4723-867f-a5841def8b17).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
