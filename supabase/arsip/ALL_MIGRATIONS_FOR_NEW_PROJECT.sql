-- Gabungan otomatis (jangan edit). Hanya untuk proyek Supabase BARU yang kosong.

-- ===== supabase/migrations/20260908000000_baseline_products.sql =====
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

-- ===== supabase/migrations/20260908000001_storage_product_images.sql =====
-- Bucket foto produk (privat, 5 MB) seperti di Lovable; unggahan lewat service role di server.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('product-images', 'product-images', false, 5242880)
ON CONFLICT (id) DO NOTHING;

-- ROLLBACK: DELETE FROM storage.buckets WHERE id = 'product-images';  (kosongkan isinya dulu)

-- ===== supabase/migrations/20260908200458_e124f4bc-b376-49ef-b957-2c3cb9d89c63.sql =====
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'seller');

CREATE TABLE public.user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'seller',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND is_active
  )
$$;

CREATE OR REPLACE FUNCTION public.current_role_level()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(CASE role WHEN 'owner' THEN 3 WHEN 'admin' THEN 2 WHEN 'seller' THEN 1 END), 0)
  FROM public.user_roles
  WHERE user_id = auth.uid() AND is_active
$$;

CREATE POLICY "Users read own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  product_id text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);
-- ===== supabase/migrations/20260908200519_dba08410-2b72-4bd6-8fbd-325f5ccd0c6f.sql =====
DROP FUNCTION IF EXISTS public.current_role_level();
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
-- ===== drizzle/migrations/0000_products_blocklist_and_admin_writes.sql =====
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
-- ===== drizzle/migrations/0001_lock_down_products_hpp.sql =====
REVOKE SELECT ON public.products FROM anon, authenticated, PUBLIC;
REVOKE INSERT, UPDATE ON public.products FROM anon;
GRANT SELECT (id, sku, name, brand, category, subcategory, size, pack_count, servings, dose, flavor, price, compare_at_price, stock, image_url, description, bpom_number, is_active, slug, created_at, updated_at, is_blocked, blocked_reason) ON public.products TO anon, authenticated;
REVOKE INSERT (hpp), UPDATE (hpp) ON public.products FROM authenticated;
REVOKE UPDATE ON public.products FROM authenticated;
GRANT UPDATE (sku, name, brand, category, subcategory, size, pack_count, servings, dose, flavor, price, compare_at_price, stock, image_url, description, bpom_number, is_active, slug, updated_at) ON public.products TO authenticated;
REVOKE INSERT ON public.products FROM authenticated;
GRANT INSERT (id, sku, name, brand, category, subcategory, size, pack_count, servings, dose, flavor, price, compare_at_price, stock, image_url, description, bpom_number, is_active, slug) ON public.products TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_product_hpp(_ids uuid[])
RETURNS TABLE(id uuid, hpp numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT p.id, p.hpp FROM public.products p WHERE p.id = ANY(_ids);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_product_hpp(_id uuid, _hpp numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _hpp IS NOT NULL AND _hpp < 0 THEN RAISE EXCEPTION 'invalid hpp'; END IF;
  UPDATE public.products SET hpp = _hpp WHERE id = _id;
END $$;

REVOKE ALL ON FUNCTION public.admin_get_product_hpp(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_product_hpp(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_product_hpp(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_product_hpp(uuid, numeric) TO authenticated;
-- ===== drizzle/migrations/0002_native_orders.sql =====
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  access_token text NOT NULL UNIQUE,
  user_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','cancelled')),
  payment_mode text NOT NULL CHECK (payment_mode IN ('midtrans','mock')),
  customer_name text NOT NULL,
  whatsapp text NOT NULL,
  address text NOT NULL,
  province text NOT NULL,
  city text NOT NULL,
  district text NOT NULL,
  postal_code text NOT NULL,
  area_id text,
  courier_company text NOT NULL,
  courier_service text NOT NULL,
  courier_label text NOT NULL,
  shipping_mode text NOT NULL CHECK (shipping_mode IN ('biteship','mock')),
  subtotal integer NOT NULL CHECK (subtotal >= 0),
  shipping_cost integer NOT NULL CHECK (shipping_cost >= 0),
  total integer NOT NULL CHECK (total >= 0),
  payment_token text,
  payment_url text,
  last_transaction_status text,
  stock_applied boolean NOT NULL DEFAULT false,
  stock_shortage boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_status_created_idx ON public.orders (status, created_at DESC);
CREATE INDEX orders_user_idx ON public.orders (user_id);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  slug text NOT NULL,
  sku text NOT NULL,
  name text NOT NULL,
  unit_price integer NOT NULL CHECK (unit_price > 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total integer NOT NULL CHECK (line_total >= 0)
);
CREATE INDEX order_items_order_idx ON public.order_items (order_id);

GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.order_items TO authenticated;
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.order_items TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers read own orders" ON public.orders FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid());
CREATE POLICY "Staff read all orders" ON public.orders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Read items of readable orders" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (
    (o.user_id IS NOT NULL AND o.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))));

-- Guest access: only by the unguessable token, returns a safe projection.
CREATE OR REPLACE FUNCTION public.get_order_by_token(_token text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'payment_mode', o.payment_mode,
    'shipping_mode', o.shipping_mode, 'customer_name', o.customer_name, 'city', o.city,
    'courier_label', o.courier_label, 'subtotal', o.subtotal, 'shipping_cost', o.shipping_cost,
    'total', o.total, 'payment_url', CASE WHEN o.status = 'pending' THEN o.payment_url END,
    'created_at', o.created_at, 'paid_at', o.paid_at,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', i.slug, 'name', i.name,
      'quantity', i.quantity, 'unit_price', i.unit_price, 'line_total', i.line_total) ORDER BY i.name)
      FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb))
  FROM public.orders o
  WHERE length(_token) >= 32 AND o.access_token = _token
$$;
REVOKE ALL ON FUNCTION public.get_order_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_by_token(text) TO anon, authenticated, service_role;

-- Idempotent status transition + one-time atomic stock decrement. Server-only.
CREATE OR REPLACE FUNCTION public.apply_order_payment_status(_order_id uuid, _status text, _transaction_status text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  short boolean;
BEGIN
  IF _status NOT IN ('pending','paid','expired','cancelled') THEN RAISE EXCEPTION 'invalid status'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF o.status = _status THEN RETURN 'noop'; END IF;
  IF o.status = 'paid' THEN RETURN 'ignored_already_paid'; END IF;
  IF _status = 'pending' THEN RETURN 'noop'; END IF;
  IF o.status IN ('expired','cancelled') AND _status <> 'paid' THEN RETURN 'noop'; END IF;

  IF _status = 'paid' THEN
    IF NOT o.stock_applied THEN
      PERFORM 1 FROM public.products p JOIN public.order_items i ON i.product_id = p.id
        WHERE i.order_id = _order_id FOR UPDATE OF p;
      SELECT EXISTS (
        SELECT 1 FROM (SELECT product_id, sum(quantity) q FROM public.order_items WHERE order_id = _order_id GROUP BY product_id) i
        JOIN public.products p ON p.id = i.product_id WHERE p.stock < i.q
      ) INTO short;
      IF short THEN
        UPDATE public.orders SET stock_shortage = true WHERE id = _order_id;
      ELSE
        UPDATE public.products p SET stock = p.stock - i.q
          FROM (SELECT product_id, sum(quantity) q FROM public.order_items WHERE order_id = _order_id GROUP BY product_id) i
          WHERE p.id = i.product_id;
        UPDATE public.orders SET stock_applied = true WHERE id = _order_id;
      END IF;
    END IF;
    UPDATE public.orders SET status = 'paid', paid_at = now(), last_transaction_status = _transaction_status, updated_at = now() WHERE id = _order_id;
    RETURN 'paid';
  END IF;

  UPDATE public.orders SET status = _status, last_transaction_status = _transaction_status, updated_at = now() WHERE id = _order_id;
  RETURN _status;
END $$;
REVOKE ALL ON FUNCTION public.apply_order_payment_status(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_payment_status(uuid, text, text) TO service_role;
-- ===== drizzle/migrations/0003_whatsapp_orders_and_purchasable.sql =====
ALTER TABLE public.products ADD COLUMN is_purchasable boolean GENERATED ALWAYS AS (coalesce(price,0) > 0 AND stock > 0) STORED;
GRANT SELECT (is_purchasable) ON public.products TO anon, authenticated;
CREATE INDEX products_purchasable_name_idx ON public.products (is_purchasable DESC, name);

ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status = ANY (ARRAY['pending','menunggu_konfirmasi','paid','expired','cancelled']));
ALTER TABLE public.orders DROP CONSTRAINT orders_payment_mode_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_mode_check CHECK (payment_mode = ANY (ARRAY['midtrans','mock','whatsapp']));
ALTER TABLE public.orders DROP CONSTRAINT orders_shipping_mode_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_shipping_mode_check CHECK (shipping_mode = ANY (ARRAY['biteship','mock','manual']));

CREATE OR REPLACE FUNCTION public.staff_confirm_order(_order_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o public.orders%ROWTYPE; short text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pesanan tidak ditemukan'; END IF;
  IF o.status = 'paid' THEN RETURN 'noop'; END IF;
  IF o.status NOT IN ('menunggu_konfirmasi','pending') THEN RAISE EXCEPTION 'Pesanan sudah %', o.status; END IF;
  IF NOT o.stock_applied THEN
    PERFORM 1 FROM public.products p JOIN public.order_items i ON i.product_id = p.id WHERE i.order_id = _order_id FOR UPDATE OF p;
    SELECT string_agg(p.name, ', ') INTO short FROM (SELECT product_id, sum(quantity) q FROM public.order_items WHERE order_id = _order_id GROUP BY product_id) i
      JOIN public.products p ON p.id = i.product_id WHERE p.stock < i.q;
    IF short IS NOT NULL THEN RAISE EXCEPTION 'Stok tidak cukup: %', short; END IF;
    UPDATE public.products p SET stock = p.stock - i.q
      FROM (SELECT product_id, sum(quantity) q FROM public.order_items WHERE order_id = _order_id GROUP BY product_id) i
      WHERE p.id = i.product_id;
  END IF;
  UPDATE public.orders SET status = 'paid', stock_applied = true, paid_at = now(), last_transaction_status = 'staff_confirmed', updated_at = now() WHERE id = _order_id;
  INSERT INTO public.admin_audit_log(user_id, action, payload) VALUES (auth.uid(), 'order_confirm', jsonb_build_object('order_number', o.order_number));
  RETURN 'paid';
END $$;

CREATE OR REPLACE FUNCTION public.staff_cancel_order(_order_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o public.orders%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pesanan tidak ditemukan'; END IF;
  IF o.status = 'cancelled' THEN RETURN 'noop'; END IF;
  IF o.stock_applied THEN
    UPDATE public.products p SET stock = p.stock + i.q
      FROM (SELECT product_id, sum(quantity) q FROM public.order_items WHERE order_id = _order_id GROUP BY product_id) i
      WHERE p.id = i.product_id;
  END IF;
  UPDATE public.orders SET status = 'cancelled', stock_applied = false, last_transaction_status = 'staff_cancelled', updated_at = now() WHERE id = _order_id;
  INSERT INTO public.admin_audit_log(user_id, action, payload) VALUES (auth.uid(), 'order_cancel', jsonb_build_object('order_number', o.order_number, 'stock_restored', o.stock_applied));
  RETURN 'cancelled';
END $$;
REVOKE ALL ON FUNCTION public.staff_confirm_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_cancel_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_confirm_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_cancel_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_order_by_token(_token text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'payment_mode', o.payment_mode,
    'shipping_mode', o.shipping_mode, 'customer_name', o.customer_name, 'city', o.city,
    'whatsapp', o.whatsapp, 'address', o.address, 'district', o.district, 'province', o.province,
    'postal_code', o.postal_code,
    'courier_label', o.courier_label, 'subtotal', o.subtotal, 'shipping_cost', o.shipping_cost,
    'total', o.total, 'payment_url', CASE WHEN o.status = 'pending' THEN o.payment_url END,
    'created_at', o.created_at, 'paid_at', o.paid_at,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', i.slug, 'name', i.name,
      'quantity', i.quantity, 'unit_price', i.unit_price, 'line_total', i.line_total) ORDER BY i.name)
      FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb))
  FROM public.orders o
  WHERE length(_token) >= 32 AND o.access_token = _token
$function$;
-- ===== drizzle/migrations/0004_vita_chat_rate_limit.sql =====
CREATE TABLE public.chat_rate_hits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_rate_hits_visitor_idx ON public.chat_rate_hits (visitor_hash, created_at);
GRANT ALL ON public.chat_rate_hits TO service_role;
ALTER TABLE public.chat_rate_hits ENABLE ROW LEVEL SECURITY;
-- No policies: only the SECURITY DEFINER function below touches this table.

CREATE OR REPLACE FUNCTION public.chat_rate_hit(_visitor text, _limit int DEFAULT 20, _window_minutes int DEFAULT 10)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  IF _visitor IS NULL OR length(_visitor) <> 64 THEN RETURN false; END IF;
  DELETE FROM public.chat_rate_hits WHERE created_at < now() - interval '1 hour';
  SELECT count(*) INTO n FROM public.chat_rate_hits
   WHERE visitor_hash = _visitor AND created_at > now() - make_interval(mins => _window_minutes);
  IF n >= _limit THEN RETURN false; END IF;
  INSERT INTO public.chat_rate_hits (visitor_hash) VALUES (_visitor);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.chat_rate_hit(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_rate_hit(text, int, int) TO anon, authenticated;
-- ===== drizzle/migrations/0005_seller_center.sql =====
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS weight_grams integer CHECK (weight_grams IS NULL OR weight_grams > 0),
  ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS variant_group text,
  ADD COLUMN IF NOT EXISTS publish_issue text;

UPDATE public.products SET images = ARRAY[image_url] WHERE image_url IS NOT NULL AND cardinality(images) = 0;

CREATE INDEX IF NOT EXISTS products_variant_group_idx ON public.products(variant_group) WHERE variant_group IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.product_blocked_skus (
  sku text PRIMARY KEY,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_blocked_skus TO authenticated;
GRANT ALL ON public.product_blocked_skus TO service_role;
ALTER TABLE public.product_blocked_skus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read blocked skus" ON public.product_blocked_skus FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.product_blocklist ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Pure publish-rule reasons (empty string = ok). Used by the trigger and the dry-run.
CREATE OR REPLACE FUNCTION public.publish_missing(_price numeric, _has_photo boolean, _stock integer, _weight integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT concat_ws(', ',
    CASE WHEN _price IS NULL OR _price <= 0 THEN 'tanpa harga' END,
    CASE WHEN NOT _has_photo THEN 'tanpa foto' END,
    CASE WHEN _stock IS NULL OR _stock < 0 THEN 'stok tidak valid' END,
    CASE WHEN _weight IS NULL OR _weight <= 0 THEN 'tanpa berat' END)
$$;

CREATE OR REPLACE FUNCTION public.products_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  _reason text;
  _is_admin boolean;
  _missing text;
BEGIN
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

  -- Keep cover photo in sync with the gallery.
  IF cardinality(NEW.images) > 0 THEN NEW.image_url := NEW.images[1];
  ELSIF TG_OP = 'UPDATE' AND NEW.images IS DISTINCT FROM OLD.images THEN NEW.image_url := NULL;
  END IF;

  _reason := public.product_block_reason(
    concat_ws(' ', NEW.name, NEW.brand, NEW.category, NEW.subcategory, NEW.description)
  );
  IF _reason IS NULL THEN
    SELECT reason INTO _reason FROM public.product_blocked_skus WHERE lower(sku) = lower(NEW.sku);
  END IF;
  IF _reason IS NOT NULL THEN
    NEW.is_blocked := true;
    NEW.blocked_reason := _reason;
    NEW.is_active := false;
    NEW.publish_issue := 'Diblokir: ' || _reason;
  ELSE
    NEW.is_blocked := false;
    NEW.blocked_reason := NULL;
    -- Publish rule applies when a product goes Live (new or Draf -> Live).
    -- Products already Live before this rule keep their status.
    IF NEW.is_active AND (TG_OP = 'INSERT' OR NOT OLD.is_active) THEN
      _missing := public.publish_missing(NEW.price, NEW.image_url IS NOT NULL, NEW.stock, NEW.weight_grams);
      IF _missing <> '' THEN
        NEW.is_active := false;
        NEW.publish_issue := 'Belum bisa tampil: ' || _missing;
      ELSE
        NEW.publish_issue := NULL;
      END IF;
    ELSIF NEW.is_active THEN
      NEW.publish_issue := NULL;
    ELSIF TG_OP = 'UPDATE' AND OLD.is_active AND NOT NEW.is_active THEN
      NEW.publish_issue := NULL;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- Activity log for price, stock and status changes (any writer, including orders).
CREATE OR REPLACE FUNCTION public.products_activity_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ch jsonb := '{}'::jsonb;
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price THEN ch := ch || jsonb_build_object('harga', jsonb_build_array(OLD.price, NEW.price)); END IF;
  IF NEW.compare_at_price IS DISTINCT FROM OLD.compare_at_price THEN ch := ch || jsonb_build_object('harga_coret', jsonb_build_array(OLD.compare_at_price, NEW.compare_at_price)); END IF;
  IF NEW.stock IS DISTINCT FROM OLD.stock THEN ch := ch || jsonb_build_object('stok', jsonb_build_array(OLD.stock, NEW.stock)); END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN ch := ch || jsonb_build_object('live', jsonb_build_array(OLD.is_active, NEW.is_active)); END IF;
  IF ch <> '{}'::jsonb THEN
    INSERT INTO public.admin_audit_log(user_id, action, product_id, payload)
    VALUES (auth.uid(), 'product_change', NEW.id::text, ch || jsonb_build_object('sku', NEW.sku, 'name', NEW.name));
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS products_activity_trg ON public.products;
CREATE TRIGGER products_activity_trg AFTER UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_activity_log();

-- Dry-run helper: blocked reason per text/SKU pair (staff only).
CREATE OR REPLACE FUNCTION public.staff_check_blocked(_texts text[], _skus text[])
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE out text[] := '{}'; i int; r text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF cardinality(_texts) > 500 THEN RAISE EXCEPTION 'too many'; END IF;
  FOR i IN 1..coalesce(cardinality(_texts), 0) LOOP
    r := public.product_block_reason(_texts[i]);
    IF r IS NULL THEN SELECT reason INTO r FROM public.product_blocked_skus WHERE lower(sku) = lower(_skus[i]); END IF;
    out := out || coalesce(r, '');
  END LOOP;
  RETURN out;
END $$;

-- Owner-managed blocklist. Keywords are matched as literal text (case-insensitive).
CREATE OR REPLACE FUNCTION public.owner_add_block(_kind text, _value text, _reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v text := btrim(_value); pat text; n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v = '' OR length(v) > 80 OR coalesce(btrim(_reason), '') = '' THEN RAISE EXCEPTION 'Isi kata/SKU dan alasan'; END IF;
  IF _kind = 'keyword' THEN
    IF length(v) < 3 THEN RAISE EXCEPTION 'Kata kunci minimal 3 huruf'; END IF;
    pat := regexp_replace(lower(v), '([.\\+*?\[^\]$(){}=!<>|:\-#/])', '\\\1', 'g');
    INSERT INTO public.product_blocklist(pattern, reason) VALUES (pat, btrim(_reason)) ON CONFLICT DO NOTHING;
    UPDATE public.products SET updated_at = now()
      WHERE concat_ws(' ', name, brand, category, subcategory, description) ~* pat;
  ELSIF _kind = 'sku' THEN
    INSERT INTO public.product_blocked_skus(sku, reason) VALUES (v, btrim(_reason))
      ON CONFLICT (sku) DO UPDATE SET reason = EXCLUDED.reason;
    UPDATE public.products SET updated_at = now() WHERE lower(sku) = lower(v);
  ELSE RAISE EXCEPTION 'invalid kind'; END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO public.admin_audit_log(user_id, action, payload)
    VALUES (auth.uid(), 'blocklist_add', jsonb_build_object('kind', _kind, 'value', v, 'reason', _reason, 'products_blocked', n));
  RETURN n::text;
END $$;

CREATE OR REPLACE FUNCTION public.owner_remove_block(_kind text, _value text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _kind = 'keyword' THEN
    DELETE FROM public.product_blocklist WHERE pattern = _value;
    UPDATE public.products SET updated_at = now() WHERE is_blocked;
  ELSIF _kind = 'sku' THEN
    DELETE FROM public.product_blocked_skus WHERE sku = _value;
    UPDATE public.products SET updated_at = now() WHERE lower(sku) = lower(_value);
  ELSE RAISE EXCEPTION 'invalid kind'; END IF;
  INSERT INTO public.admin_audit_log(user_id, action, payload)
    VALUES (auth.uid(), 'blocklist_remove', jsonb_build_object('kind', _kind, 'value', _value));
END $$;

REVOKE ALL ON FUNCTION public.staff_check_blocked(text[], text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_add_block(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_remove_block(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_check_blocked(text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_add_block(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_remove_block(text, text) TO authenticated;
-- ===== drizzle/migrations/0006_seller_center_column_grants.sql =====
GRANT SELECT (weight_grams, images, variant_group) ON public.products TO anon;
GRANT SELECT (weight_grams, images, variant_group, publish_issue) ON public.products TO authenticated;
GRANT INSERT (weight_grams, images, variant_group), UPDATE (weight_grams, images, variant_group) ON public.products TO authenticated;
-- ===== drizzle/migrations/0007_store_branches_settings.sql =====
CREATE TABLE public.store_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 60),
  area text NOT NULL DEFAULT '' CHECK (length(area) <= 80),
  whatsapp text NOT NULL CHECK (whatsapp ~ '^62[0-9]{8,13}$'),
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.store_branches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_branches TO authenticated;
GRANT ALL ON public.store_branches TO service_role;
ALTER TABLE public.store_branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active branches" ON public.store_branches FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY "Staff read branches" ON public.store_branches FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Staff insert branches" ON public.store_branches FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Staff update branches" ON public.store_branches FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Staff delete branches" ON public.store_branches FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

INSERT INTO public.store_branches (name, area, whatsapp, display_order) VALUES
  ('Pusat', 'Bali', '6281339950000', 0),
  ('Pusat (cadangan)', 'Bali', '6282147739996', 1);

CREATE TABLE public.store_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  store_name text NOT NULL DEFAULT 'VitaminKu' CHECK (length(store_name) BETWEEN 2 AND 60),
  logo_url text CHECK (logo_url IS NULL OR (logo_url ~ '^https://' AND length(logo_url) <= 500)),
  hero_title text NOT NULL DEFAULT 'Sehat itu gampang, mulai dari yang kamu butuhkan' CHECK (length(hero_title) <= 120),
  hero_subtitle text NOT NULL DEFAULT 'Vitamin, suplemen, sports nutrition, dan aksesoris olahraga dalam satu katalog.' CHECK (length(hero_subtitle) <= 240),
  free_shipping_note text NOT NULL DEFAULT '' CHECK (length(free_shipping_note) <= 160),
  operating_hours text NOT NULL DEFAULT 'Setiap hari 09.00–21.00 WITA' CHECK (length(operating_hours) <= 120),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.store_settings TO anon;
GRANT SELECT, UPDATE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read settings" ON public.store_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Staff update settings" ON public.store_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
INSERT INTO public.store_settings (id) VALUES (1);

ALTER TABLE public.orders ADD COLUMN branch_id uuid REFERENCES public.store_branches(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN branch_name text;
ALTER TABLE public.orders ADD COLUMN branch_whatsapp text;

CREATE OR REPLACE FUNCTION public.get_order_by_token(_token text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'payment_mode', o.payment_mode,
    'shipping_mode', o.shipping_mode, 'customer_name', o.customer_name, 'city', o.city,
    'whatsapp', o.whatsapp, 'address', o.address, 'district', o.district, 'province', o.province,
    'postal_code', o.postal_code, 'branch_name', o.branch_name, 'branch_whatsapp', o.branch_whatsapp,
    'courier_label', o.courier_label, 'subtotal', o.subtotal, 'shipping_cost', o.shipping_cost,
    'total', o.total, 'payment_url', CASE WHEN o.status = 'pending' THEN o.payment_url END,
    'created_at', o.created_at, 'paid_at', o.paid_at,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', i.slug, 'name', i.name,
      'quantity', i.quantity, 'unit_price', i.unit_price, 'line_total', i.line_total) ORDER BY i.name)
      FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb))
  FROM public.orders o
  WHERE length(_token) >= 32 AND o.access_token = _token
$function$;
-- ===== drizzle/migrations/0008_promos_hero_branch_coords_referral.sql =====
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_hero boolean NOT NULL DEFAULT false;
GRANT SELECT (is_hero) ON public.products TO anon, authenticated;
GRANT UPDATE (is_hero) ON public.products TO authenticated;

ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS maps_url text;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promo_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_total integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_note text;

CREATE TABLE IF NOT EXISTS public.promos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'percent' CHECK (kind = 'percent'),
  value numeric NOT NULL CHECK (value > 0 AND value <= 90),
  brand text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
GRANT SELECT (id, code, label, kind, value, brand, starts_at, ends_at) ON public.promos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promos TO authenticated;
GRANT ALL ON public.promos TO service_role;
ALTER TABLE public.promos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read running promos" ON public.promos;
CREATE POLICY "Public read running promos" ON public.promos FOR SELECT TO anon, authenticated
  USING (is_active AND now() >= starts_at AND now() <= ends_at);
DROP POLICY IF EXISTS "Staff read promos" ON public.promos;
CREATE POLICY "Staff read promos" ON public.promos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Staff insert promos" ON public.promos;
CREATE POLICY "Staff insert promos" ON public.promos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Staff update promos" ON public.promos;
CREATE POLICY "Staff update promos" ON public.promos FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Staff delete promos" ON public.promos;
CREATE POLICY "Staff delete promos" ON public.promos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

INSERT INTO public.promos (code, label, kind, value, brand, starts_at, ends_at, is_active)
VALUES ('FITLIFE10', 'Diskon 10% Semua FITLIFE', 'percent', 10, 'fitlife',
        '2026-11-01 00:00:00+08', '2026-12-01 23:59:59+08', true)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_order_by_token(_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'payment_mode', o.payment_mode,
    'shipping_mode', o.shipping_mode, 'customer_name', o.customer_name, 'city', o.city,
    'whatsapp', o.whatsapp, 'address', o.address, 'district', o.district, 'province', o.province,
    'postal_code', o.postal_code, 'branch_name', o.branch_name, 'branch_whatsapp', o.branch_whatsapp,
    'courier_label', o.courier_label, 'subtotal', o.subtotal, 'shipping_cost', o.shipping_cost,
    'discount_total', o.discount_total, 'promo_code', o.promo_code, 'customer_note', o.customer_note,
    'total', o.total, 'payment_url', CASE WHEN o.status = 'pending' THEN o.payment_url END,
    'created_at', o.created_at, 'paid_at', o.paid_at,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', i.slug, 'name', i.name,
      'quantity', i.quantity, 'unit_price', i.unit_price, 'line_total', i.line_total) ORDER BY i.name)
      FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb))
  FROM public.orders o
  WHERE length(_token) >= 32 AND o.access_token = _token
$function$;
-- ===== drizzle/migrations/0009_revoke_trigger_function_exec.sql =====
-- Pengerasan: fungsi pemicu internal tidak perlu bisa dipanggil lewat API (/rest/v1/rpc/...).
-- Pemicu tetap berjalan (hak EXECUTE tidak diperiksa saat pemicu aktif).
REVOKE ALL ON FUNCTION public.products_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.products_activity_log() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.product_block_reason(text) FROM PUBLIC, anon, authenticated;

-- ROLLBACK:
-- GRANT EXECUTE ON FUNCTION public.products_guard(), public.products_activity_log(), public.product_block_reason(text) TO authenticated;
