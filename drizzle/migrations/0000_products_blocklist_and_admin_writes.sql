-- 1. Forbidden-product safeguard
CREATE TABLE IF NOT EXISTS public.product_blocklist (
  pattern text PRIMARY KEY,
  reason text NOT NULL
);
GRANT SELECT ON public.product_blocklist TO authenticated;
GRANT ALL ON public.product_blocklist TO service_role;
ALTER TABLE public.product_blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read blocklist" ON public.product_blocklist
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

INSERT INTO public.product_blocklist (pattern, reason) VALUES
  ('\mobat keras\M', 'Obat keras / resep dokter'),
  ('\mresep dokter\M', 'Obat keras / resep dokter'),
  ('\msarms?\M', 'SARMs'),
  ('ostarine', 'SARMs'), ('enobosarm', 'SARMs'), ('ligandrol', 'SARMs'), ('lgd-?4033', 'SARMs'),
  ('rad-?140', 'SARMs'), ('testolone', 'SARMs'), ('cardarine', 'SARMs'), ('gw-?501516', 'SARMs'),
  ('andarine', 'SARMs'), ('\myk-?11\M', 'SARMs'), ('ibutamoren', 'SARMs'), ('\mmk-?677\M', 'SARMs'),
  ('modafinil', 'Modafinil'), ('armodafinil', 'Modafinil'),
  ('yohimb', 'Yohimbe / yohimbine'),
  ('\mdhea\M', 'DHEA'), ('dehydroepiandrosterone', 'DHEA'), ('prasterone', 'DHEA')
ON CONFLICT (pattern) DO NOTHING;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS blocked_reason text;

CREATE OR REPLACE FUNCTION public.product_block_reason(_text text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT reason FROM public.product_blocklist WHERE _text ~* pattern ORDER BY pattern LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.product_block_reason(text) FROM anon, public;

CREATE OR REPLACE FUNCTION public.products_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _reason text;
  _is_admin boolean;
BEGIN
  -- Sellers may edit content only; price/SKU/stock/status/cost need admin or owner.
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL THEN
    _is_admin := public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin');
    IF NOT _is_admin AND (
      NEW.price IS DISTINCT FROM OLD.price OR
      NEW.compare_at_price IS DISTINCT FROM OLD.compare_at_price OR
      NEW.hpp IS DISTINCT FROM OLD.hpp OR
      NEW.stock IS DISTINCT FROM OLD.stock OR
      NEW.sku IS DISTINCT FROM OLD.sku OR
      NEW.is_active IS DISTINCT FROM OLD.is_active
    ) THEN
      RAISE EXCEPTION 'Hanya admin/owner yang boleh mengubah harga, SKU, stok, atau status';
    END IF;
  END IF;

  _reason := public.product_block_reason(
    concat_ws(' ', NEW.name, NEW.brand, NEW.category, NEW.subcategory, NEW.description)
  );
  IF _reason IS NOT NULL THEN
    NEW.is_blocked := true;
    NEW.blocked_reason := _reason;
    NEW.is_active := false;
  ELSE
    NEW.is_blocked := false;
    NEW.blocked_reason := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_guard_trg ON public.products;
CREATE TRIGGER products_guard_trg
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_guard();

-- Backfill: run every existing row through the guard (unpublishes matches).
UPDATE public.products SET is_blocked = is_blocked;

-- 2. RLS: storefront sees only active, non-blocked rows; staff writes.
DROP POLICY IF EXISTS "public read active products" ON public.products;
CREATE POLICY "public read active products" ON public.products
  FOR SELECT TO anon, authenticated
  USING (is_active = true AND is_blocked = false);

CREATE POLICY "Staff read all products" ON public.products
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'seller'));

CREATE POLICY "Admins insert products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff update products" ON public.products
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'seller'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'seller'));

CREATE POLICY "Owners delete products" ON public.products
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

-- Seller may be checked via has_role; let it be called inside policies by authenticated.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;