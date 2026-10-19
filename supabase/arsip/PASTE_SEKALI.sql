-- PASTE_SEKALI.sql — HANYA untuk proyek Supabase vmhoohfwjtsojgcvopaf (VitaminKu baru). JANGAN dipakai di proyek lain
-- (bukan "nolimit-system"). Isi: migrasi 0010–0013 + dua fungsi (chat_rate_hit, owner_remove_block).
-- Aman diulang (idempoten: IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS). Tidak menghapus data pelanggan/produk.
-- Kata "DELETE" di sini hanya dalam aturan pengaman (trigger owner terakhir, FK ON DELETE) dan 2 fungsi bawaan lama.
-- Cara: Supabase → SQL Editor → New query → tempel SEMUA → Run → harus "Success".

-- ===== drizzle/migrations/0010_permissions_and_customers.sql =====
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

-- ===== drizzle/migrations/0011_branch_admins.sql =====
-- 0011: admin per cabang (Utama + Cadangan), kode cabang untuk tautan, kontak publik lewat fungsi.
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS opening_hours text;
CREATE UNIQUE INDEX IF NOT EXISTS store_branches_code_key ON public.store_branches (upper(code)) WHERE code IS NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_branches_code_check') THEN
    ALTER TABLE public.store_branches ADD CONSTRAINT store_branches_code_check
      CHECK (code IS NULL OR code ~ '^[A-Z0-9_-]{2,24}$');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.branch_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.store_branches(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  whatsapp text NOT NULL CHECK (whatsapp ~ '^62[0-9]{8,13}$'),
  role text NOT NULL CHECK (role IN ('utama','cadangan')),
  referral_code text CHECK (referral_code IS NULL OR referral_code ~ '^[A-Z0-9_-]{2,32}$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS branch_admins_one_active_utama ON public.branch_admins (branch_id) WHERE role = 'utama' AND is_active;
CREATE UNIQUE INDEX IF NOT EXISTS branch_admins_ref_key ON public.branch_admins (referral_code) WHERE referral_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS branch_admins_branch_wa_key ON public.branch_admins (branch_id, whatsapp);

ALTER TABLE public.branch_admins ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.branch_admins TO authenticated;
GRANT ALL ON public.branch_admins TO service_role;
DROP POLICY IF EXISTS "Staff read branch admins" ON public.branch_admins;
CREATE POLICY "Staff read branch admins" ON public.branch_admins FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'branches_manage'));
DROP POLICY IF EXISTS "Staff insert branch admins" ON public.branch_admins;
CREATE POLICY "Staff insert branch admins" ON public.branch_admins FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'branches_manage'));
DROP POLICY IF EXISTS "Staff update branch admins" ON public.branch_admins;
CREATE POLICY "Staff update branch admins" ON public.branch_admins FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'branches_manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'branches_manage'));
-- Tidak ada kebijakan DELETE: admin dinonaktifkan (is_active=false), tidak dihapus.

-- Kontak publik untuk checkout: hanya admin aktif dari cabang aktif; tanpa nama dan tanpa kode referral.
CREATE OR REPLACE FUNCTION public.public_branch_contacts()
RETURNS TABLE(branch_id uuid, role text, whatsapp text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.branch_id, a.role, a.whatsapp
  FROM public.branch_admins a JOIN public.store_branches b ON b.id = a.branch_id
  WHERE a.is_active AND b.is_active
  ORDER BY a.branch_id, (a.role = 'utama') DESC, a.created_at
$$;
REVOKE ALL ON FUNCTION public.public_branch_contacts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_branch_contacts() TO anon, authenticated, service_role;

-- ROLLBACK: DROP FUNCTION public_branch_contacts; DROP TABLE branch_admins; ALTER TABLE store_branches DROP COLUMN code, address, opening_hours;

-- ===== drizzle/migrations/0012_orders_stage.sql =====
-- 0012: tahap pesanan untuk papan "Pesanan Masuk" (Baru → Dikonfirmasi → Dikemas → Dikirim → Selesai/Batal).
-- Stok tetap hanya berubah lewat staff_confirm_order / staff_cancel_order (satu kali, teraudit).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'baru';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stage_updated_at timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_stage_check') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_stage_check
      CHECK (stage IN ('baru','dikonfirmasi','dikemas','dikirim','selesai','batal'));
  END IF;
END $$;
UPDATE public.orders SET stage = CASE WHEN status = 'paid' THEN 'dikonfirmasi' ELSE 'batal' END
 WHERE stage = 'baru' AND status IN ('paid','cancelled','expired');
CREATE INDEX IF NOT EXISTS orders_stage_created_idx ON public.orders (stage, created_at DESC);

CREATE OR REPLACE FUNCTION public.staff_set_order_stage(_order_id uuid, _stage text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE o public.orders%ROWTYPE; scope uuid;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'orders_manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _stage NOT IN ('dikonfirmasi','dikemas','dikirim','selesai','batal') THEN RAISE EXCEPTION 'Tahap tidak dikenal'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pesanan tidak ditemukan'; END IF;
  SELECT ur.branch_id INTO scope FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_active;
  IF scope IS NOT NULL AND o.branch_id IS DISTINCT FROM scope THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF o.stage = _stage THEN RETURN 'noop'; END IF;
  IF o.stage IN ('selesai','batal') THEN RAISE EXCEPTION 'Pesanan sudah %', o.stage; END IF;

  IF _stage = 'dikonfirmasi' THEN
    IF o.stage <> 'baru' THEN RAISE EXCEPTION 'Urutan tahap salah'; END IF;
    PERFORM public.staff_confirm_order(_order_id);
  ELSIF _stage = 'dikemas' THEN
    IF o.stage <> 'dikonfirmasi' THEN RAISE EXCEPTION 'Konfirmasi pesanan dulu'; END IF;
  ELSIF _stage = 'dikirim' THEN
    IF o.stage <> 'dikemas' THEN RAISE EXCEPTION 'Kemas pesanan dulu'; END IF;
  ELSIF _stage = 'selesai' THEN
    IF o.stage <> 'dikirim' THEN RAISE EXCEPTION 'Kirim pesanan dulu'; END IF;
  ELSIF _stage = 'batal' THEN
    PERFORM public.staff_cancel_order(_order_id);
  END IF;

  UPDATE public.orders SET stage = _stage, stage_updated_at = now(), updated_at = now() WHERE id = _order_id;
  INSERT INTO public.admin_audit_log(user_id, action, payload)
    VALUES (auth.uid(), 'order_stage', jsonb_build_object('order_number', o.order_number, 'from', o.stage, 'to', _stage));
  RETURN _stage;
END $$;
REVOKE ALL ON FUNCTION public.staff_set_order_stage(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_set_order_stage(uuid, text) TO authenticated;

-- ROLLBACK: DROP FUNCTION staff_set_order_stage; ALTER TABLE orders DROP COLUMN stage, stage_updated_at;

-- ===== drizzle/migrations/0013_import_undo.sql =====
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

-- ===== supabase/PENDING_functions_with_delete.sql =====
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
REVOKE ALL ON FUNCTION public.owner_remove_block(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_remove_block(text, text) TO authenticated;
