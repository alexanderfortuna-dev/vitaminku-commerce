-- Baseline: tabel public.products tidak pernah dibuat oleh migrasi mana pun (dibuat langsung di Lovable).
-- File ini membuatnya di proyek Supabase BARU sebelum migrasi lain. Kolom lain (is_blocked, blocked_reason,
-- is_purchasable, weight_grams, images, variant_group, publish_issue, is_hero), trigger, kebijakan RLS dan
-- pengunci kolom hpp ditambahkan oleh drizzle 0000–0008. Idempoten; tidak menyentuh data.
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  brand text NOT NULL,
  category text NOT NULL,
  subcategory text NOT NULL,
  size text,
  pack_count text,
  servings text,
  dose text,
  flavor text,
  price numeric(14,2),
  compare_at_price numeric(14,2),
  hpp numeric(14,2),
  stock integer NOT NULL DEFAULT 0,
  image_url text,
  description text,
  bpom_number text,
  is_active boolean NOT NULL DEFAULT true,
  slug text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_brand_idx ON public.products (brand);
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products (category, subcategory);
CREATE INDEX IF NOT EXISTS products_name_idx ON public.products USING gin (to_tsvector('simple'::regconfig, name));
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- ROLLBACK (hanya proyek baru, sebelum ada data): DROP TABLE public.products CASCADE;
