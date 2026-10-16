-- 0013: gambar-ulang (snapshot) sebelum Upload Massal agar "Batalkan impor terakhir" bisa memulihkan.
CREATE TABLE IF NOT EXISTS public.product_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  file_name text,
  mode text,
  summary jsonb,
  undone_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.product_import_rows (
  import_id uuid NOT NULL REFERENCES public.product_imports(id) ON DELETE CASCADE,
  sku text NOT NULL,
  existed boolean NOT NULL,
  before jsonb,
  PRIMARY KEY (import_id, sku)
);
ALTER TABLE public.product_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_import_rows ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.product_imports TO authenticated;
GRANT ALL ON public.product_imports, public.product_import_rows TO service_role;
DROP POLICY IF EXISTS "Staff read imports" ON public.product_imports;
CREATE POLICY "Staff read imports" ON public.product_imports FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'uploads_use'));
-- product_import_rows: tanpa kebijakan (hanya fungsi di bawah dan service_role).

-- Memulihkan impor TERAKHIR yang belum dibatalkan. Produk baru hasil impor diarsipkan (is_active=false), tidak dihapus.
-- Kunci `before` yang dibaca: name, brand, category, subcategory, size, pack_count, servings, dose, flavor,
-- description, price, compare_at_price, stock, weight_grams, bpom_number, images, is_active, variant_group. HPP tidak pernah disentuh.
CREATE OR REPLACE FUNCTION public.undo_product_import(_import_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE imp public.product_imports%ROWTYPE; r record; restored int := 0; archived int := 0;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'uploads_use') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO imp FROM public.product_imports WHERE id = _import_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Impor tidak ditemukan'; END IF;
  IF imp.undone_at IS NOT NULL THEN RAISE EXCEPTION 'Impor ini sudah dibatalkan'; END IF;
  IF EXISTS (SELECT 1 FROM public.product_imports x WHERE x.undone_at IS NULL AND x.created_at > imp.created_at) THEN
    RAISE EXCEPTION 'Hanya impor terakhir yang bisa dibatalkan';
  END IF;
  FOR r IN SELECT * FROM public.product_import_rows WHERE import_id = _import_id LOOP
    IF r.existed THEN
      UPDATE public.products p SET
        name = coalesce(r.before->>'name', p.name), brand = coalesce(r.before->>'brand', p.brand),
        category = coalesce(r.before->>'category', p.category), subcategory = coalesce(r.before->>'subcategory', p.subcategory),
        size = r.before->>'size', pack_count = r.before->>'pack_count', servings = r.before->>'servings',
        dose = r.before->>'dose', flavor = r.before->>'flavor', description = r.before->>'description',
        price = (r.before->>'price')::numeric, compare_at_price = (r.before->>'compare_at_price')::numeric,
        stock = coalesce((r.before->>'stock')::int, p.stock), weight_grams = (r.before->>'weight_grams')::int,
        bpom_number = r.before->>'bpom_number',
        images = coalesce(ARRAY(SELECT jsonb_array_elements_text(r.before->'images')), p.images),
        variant_group = r.before->>'variant_group',
        is_active = coalesce((r.before->>'is_active')::boolean, p.is_active)
      WHERE p.sku = r.sku;
      restored := restored + 1;
    ELSE
      UPDATE public.products SET is_active = false WHERE sku = r.sku;
      archived := archived + 1;
    END IF;
  END LOOP;
  UPDATE public.product_imports SET undone_at = now() WHERE id = _import_id;
  INSERT INTO public.admin_audit_log(user_id, action, payload)
    VALUES (auth.uid(), 'import_undo', jsonb_build_object('import_id', _import_id, 'restored', restored, 'archived', archived));
  RETURN jsonb_build_object('restored', restored, 'archived', archived);
END $$;
REVOKE ALL ON FUNCTION public.undo_product_import(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_product_import(uuid) TO authenticated;

-- ROLLBACK: DROP FUNCTION undo_product_import; DROP TABLE product_import_rows, product_imports;
