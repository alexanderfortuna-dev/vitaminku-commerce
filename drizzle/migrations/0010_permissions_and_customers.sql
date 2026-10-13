-- 0010: izin per peran (has_permission), perlindungan owner terakhir, HPP hanya untuk yang berhak, tabel pelanggan.
-- Aditif & idempoten. Diterapkan oleh pemilik lewat sesi Lovable-MCP (JANGAN dijalankan otomatis).
-- Catatan nomor: 0009 dipakai cabang feat/own-stack-v2 (PR #1); cabang ini sengaja melompat ke 0010.

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS can_view_hpp boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.store_branches(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_title_check') THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_title_check
      CHECK (title IS NULL OR title IN ('general_manager','admin'));
  END IF;
END $$;

-- Registri izin. Cermin TypeScript: src/lib/permissions.ts (dijaga permissions.db-parity.test.ts).
CREATE OR REPLACE FUNCTION public.has_permission(_uid uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.app_role;
  hpp boolean;
  owner_only text[] := ARRAY[
    'users_manage','integrations_manage','money_move','hard_delete','customers_export',
    'blocklist_edit','hpp_view','hpp_edit','backup_export','audit_view'
  ];
  manager_perms text[] := ARRAY[
    'products_edit','products_photos','products_price_stock','products_weight','products_hero',
    'promos_manage','settings_edit','branches_manage','orders_manage','customers_view',
    'reports_view','uploads_use','links_manage'
  ];
  seller_perms text[] := ARRAY['products_edit','products_photos'];
BEGIN
  SELECT ur.role, ur.can_view_hpp INTO r, hpp FROM public.user_roles ur WHERE ur.user_id = _uid AND ur.is_active;
  IF r IS NULL THEN RETURN false; END IF;
  IF r = 'owner' THEN RETURN _perm = ANY(owner_only || manager_perms || seller_perms); END IF;
  IF r = 'admin' THEN RETURN _perm = ANY(manager_perms) OR (_perm = 'hpp_view' AND coalesce(hpp, false)); END IF;
  IF r = 'seller' THEN RETURN _perm = ANY(seller_perms); END IF;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

-- HPP: sebelumnya owner+admin; sekarang hanya izin hpp_view (owner, atau manajer yang diberi can_view_hpp).
CREATE OR REPLACE FUNCTION public.admin_get_product_hpp(_ids uuid[])
RETURNS TABLE(id uuid, hpp numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'hpp_view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT p.id, p.hpp FROM public.products p WHERE p.id = ANY(_ids);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_product_hpp(_id uuid, _hpp numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'hpp_edit') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _hpp IS NOT NULL AND _hpp < 0 THEN RAISE EXCEPTION 'invalid hpp'; END IF;
  UPDATE public.products SET hpp = _hpp WHERE id = _id;
END $$;

-- Owner terakhir tidak boleh dihapus/diturunkan/dinonaktifkan; pengguna tidak boleh mengubah perannya sendiri.
CREATE OR REPLACE FUNCTION public.user_roles_protect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE others int;
BEGIN
  IF OLD.role = 'owner' AND OLD.is_active
     AND (TG_OP = 'DELETE' OR NEW.role <> 'owner' OR NOT NEW.is_active) THEN
    SELECT count(*) INTO others FROM public.user_roles WHERE role = 'owner' AND is_active AND user_id <> OLD.user_id;
    IF others = 0 THEN
      RAISE EXCEPTION 'Tidak bisa menghapus atau menonaktifkan owner aktif terakhir.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL AND OLD.user_id = auth.uid()
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    RAISE EXCEPTION 'Tidak bisa mengubah peran sendiri.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.user_roles_protect() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS user_roles_protect_trg ON public.user_roles;
CREATE TRIGGER user_roles_protect_trg BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.user_roles_protect();

-- ============================== PELANGGAN ==============================
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_normalized text NOT NULL UNIQUE CHECK (whatsapp_normalized ~ '^628[0-9]{7,12}$'),
  name text NOT NULL,
  email text,
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  default_address text,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  first_order_at timestamptz,
  last_order_at timestamptz,
  order_count integer NOT NULL DEFAULT 0,
  total_spent bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
DROP POLICY IF EXISTS "Customer reads own record" ON public.customers;
CREATE POLICY "Customer reads own record" ON public.customers FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner reads all customers" ON public.customers;
CREATE POLICY "Owner reads all customers" ON public.customers FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'customers_export'));

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_customer_idx ON public.orders (customer_id);
DROP POLICY IF EXISTS "Customers read orders of own customer" ON public.orders;
CREATE POLICY "Customers read orders of own customer" ON public.orders FOR SELECT TO authenticated
  USING (customer_id IS NOT NULL AND customer_id IN (SELECT c.id FROM public.customers c WHERE c.user_id = auth.uid()));

-- Dipanggil server (service_role) setiap pesanan dibuat: tamu maupun pembeli yang login.
CREATE OR REPLACE FUNCTION public.upsert_customer_for_order(
  _whatsapp text, _name text, _address text, _opt_in boolean, _user_id uuid, _total bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE cid uuid; opt boolean := coalesce(_opt_in, false);
BEGIN
  IF _whatsapp IS NULL OR _whatsapp !~ '^628[0-9]{7,12}$' THEN RAISE EXCEPTION 'invalid whatsapp'; END IF;
  IF _user_id IS NOT NULL THEN
    SELECT id INTO cid FROM public.customers WHERE user_id = _user_id;
    IF cid IS NOT NULL THEN
      UPDATE public.customers SET
        name = coalesce(nullif(left(btrim(_name), 100), ''), name),
        default_address = coalesce(nullif(left(btrim(_address), 500), ''), default_address),
        first_order_at = coalesce(first_order_at, now()), last_order_at = now(),
        order_count = order_count + 1, total_spent = total_spent + greatest(coalesce(_total, 0), 0),
        consent_at = CASE WHEN NOT marketing_opt_in AND opt THEN now() ELSE consent_at END,
        marketing_opt_in = marketing_opt_in OR opt, updated_at = now()
      WHERE id = cid;
      RETURN cid;
    END IF;
  END IF;
  -- user_id hanya diisi saat baris BARU dibuat; nomor yang sudah ada TIDAK pernah diklaim lewat telepon saja.
  INSERT INTO public.customers (whatsapp_normalized, name, default_address, marketing_opt_in, consent_at,
                                first_order_at, last_order_at, order_count, total_spent, user_id)
  VALUES (_whatsapp, coalesce(nullif(left(btrim(_name), 100), ''), 'Pelanggan'), nullif(left(btrim(_address), 500), ''),
          opt, CASE WHEN opt THEN now() END, now(), now(), 1, greatest(coalesce(_total, 0), 0), _user_id)
  ON CONFLICT (whatsapp_normalized) DO UPDATE SET
    name = coalesce(nullif(left(btrim(_name), 100), ''), customers.name),
    default_address = coalesce(nullif(left(btrim(_address), 500), ''), customers.default_address),
    first_order_at = coalesce(customers.first_order_at, now()), last_order_at = now(),
    order_count = customers.order_count + 1, total_spent = customers.total_spent + greatest(coalesce(_total, 0), 0),
    consent_at = CASE WHEN NOT customers.marketing_opt_in AND opt THEN now() ELSE customers.consent_at END,
    marketing_opt_in = customers.marketing_opt_in OR opt, updated_at = now()
  RETURNING id INTO cid;
  RETURN cid;
END $$;
REVOKE ALL ON FUNCTION public.upsert_customer_for_order(text, text, text, boolean, uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_customer_for_order(text, text, text, boolean, uuid, bigint) TO service_role;

-- Klaim akun: wajib bukti token pesanan ATAU email terverifikasi yang cocok. Tidak pernah hanya dari nomor telepon.
CREATE OR REPLACE FUNCTION public.claim_customer_for_user(_user_id uuid, _verified_email text, _order_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE cid uuid; done uuid; em text := lower(btrim(coalesce(_verified_email, '')));
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO cid FROM public.customers WHERE user_id = _user_id;
  IF cid IS NOT NULL THEN RETURN cid; END IF;
  cid := NULL;
  IF _order_token IS NOT NULL AND length(_order_token) >= 32 THEN
    SELECT o.customer_id INTO cid FROM public.orders o WHERE o.access_token = _order_token;
  END IF;
  IF cid IS NULL AND em <> '' THEN
    SELECT c.id INTO cid FROM public.customers c WHERE lower(c.email) = em AND c.user_id IS NULL;
  END IF;
  IF cid IS NULL THEN RETURN NULL; END IF;
  UPDATE public.customers SET user_id = _user_id, email = coalesce(email, nullif(em, '')), updated_at = now()
   WHERE id = cid AND user_id IS NULL RETURNING id INTO done;
  RETURN done;
END $$;
REVOKE ALL ON FUNCTION public.claim_customer_for_user(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_customer_for_user(uuid, text, text) TO service_role;

-- Pelanggan memperbarui datanya sendiri.
CREATE OR REPLACE FUNCTION public.update_my_customer(_name text, _address text, _opt_in boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.customers SET
    name = coalesce(nullif(left(btrim(_name), 100), ''), name),
    default_address = coalesce(nullif(left(btrim(_address), 500), ''), default_address),
    consent_at = CASE WHEN NOT marketing_opt_in AND coalesce(_opt_in, false) THEN now() ELSE consent_at END,
    marketing_opt_in = coalesce(_opt_in, marketing_opt_in), updated_at = now()
  WHERE user_id = auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.update_my_customer(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_customer(text, text, boolean) TO authenticated;

-- Manajer mencari pelanggan satu per satu (bukan daftar penuh): minimal 4 karakter, maksimal 20 hasil.
CREATE OR REPLACE FUNCTION public.staff_find_customer(_q text)
RETURNS TABLE(id uuid, name text, whatsapp_normalized text, email text, order_count integer, total_spent bigint, last_order_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE q text := btrim(coalesce(_q, '')); digits text := regexp_replace(coalesce(_q, ''), '\D', '', 'g');
BEGIN
  IF NOT public.has_permission(auth.uid(), 'customers_view') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF length(q) < 4 THEN RAISE EXCEPTION 'Ketik minimal 4 karakter (nama atau nomor WhatsApp).'; END IF;
  RETURN QUERY
    SELECT c.id, c.name, c.whatsapp_normalized, c.email, c.order_count, c.total_spent, c.last_order_at
    FROM public.customers c
    WHERE c.name ILIKE '%' || q || '%' OR (length(digits) >= 4 AND c.whatsapp_normalized LIKE '%' || digits || '%')
    ORDER BY c.last_order_at DESC NULLS LAST LIMIT 20;
END $$;
REVOKE ALL ON FUNCTION public.staff_find_customer(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_find_customer(text) TO authenticated;

-- ROLLBACK (urut terbalik; data pelanggan hilang): DROP FUNCTION staff_find_customer, update_my_customer,
-- claim_customer_for_user, upsert_customer_for_order; DROP POLICY ... ON orders; ALTER TABLE orders DROP COLUMN customer_id;
-- DROP TABLE customers; DROP TRIGGER user_roles_protect_trg ON user_roles; DROP FUNCTION user_roles_protect, has_permission;
-- (fungsi admin_get/set_product_hpp: pulihkan dari drizzle 0001.)
