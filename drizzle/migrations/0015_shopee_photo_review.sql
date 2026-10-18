-- 0015: antrean "perlu ditinjau" untuk foto Shopee. Aditif & idempoten.
-- shopee_name hanya untuk ditampilkan saat memilih; TIDAK PERNAH disalin ke products (nama/deskripsi/kategori produk tidak disentuh).
CREATE TABLE IF NOT EXISTS public.shopee_photo_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  shopee_item_id text NOT NULL,
  shopee_name text NOT NULL,
  score numeric(4,3) NOT NULL,
  reason text NOT NULL,
  shared_with_others integer NOT NULL DEFAULT 0,
  image_urls text[] NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','skipped')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shopee_photo_candidates_urls_max CHECK (cardinality(image_urls) BETWEEN 1 AND 9),
  CONSTRAINT shopee_photo_candidates_uq UNIQUE (product_id, shopee_item_id)
);
CREATE INDEX IF NOT EXISTS shopee_photo_candidates_status_idx ON public.shopee_photo_candidates (status, product_id);

ALTER TABLE public.shopee_photo_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shopee_photo_candidates FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.shopee_photo_candidates TO authenticated;
GRANT ALL ON public.shopee_photo_candidates TO service_role;
REVOKE ALL ON public.shopee_photo_candidates FROM anon;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shopee_photo_candidates' AND policyname='photo staff read') THEN
    CREATE POLICY "photo staff read" ON public.shopee_photo_candidates FOR SELECT TO authenticated
      USING (public.has_permission(auth.uid(), 'products_photos'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shopee_photo_candidates' AND policyname='photo staff insert') THEN
    CREATE POLICY "photo staff insert" ON public.shopee_photo_candidates FOR INSERT TO authenticated
      WITH CHECK (public.has_permission(auth.uid(), 'products_photos'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shopee_photo_candidates' AND policyname='photo staff update') THEN
    CREATE POLICY "photo staff update" ON public.shopee_photo_candidates FOR UPDATE TO authenticated
      USING (public.has_permission(auth.uid(), 'products_photos')) WITH CHECK (public.has_permission(auth.uid(), 'products_photos'));
  END IF;
END $$;
-- Tanpa kebijakan DELETE: tidak ada penghapusan permanen (kandidat ditandai applied/skipped).
