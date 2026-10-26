-- 0018 Ongkir nyata & link bayar (Rilis 5). Aditif & idempoten. BELUM dipasang ke produksi (dipasang owner lewat mode pasang-database).
-- 1) Ukuran produk (cm) untuk berat volume kurir. Boleh kosong; bila diisi harus > 0. Tidak ada tebakan.
-- 2) Data cabang untuk ongkir: kode pos asal, area Biteship, dan saklar kurir instan (default MATI, diisi owner).
-- 3) Pesanan WhatsApp: staf mengisi ongkir lewat fungsi ber-izin, lalu link bayar Midtrans dibuat dari total di database.
-- Sebelum 0018 dipasang, kode otomatis memakai berat saja (tanpa ukuran) dan tombol link bayar menolak dengan pesan jelas.

-- 1) Ukuran produk
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS length_cm numeric(7,1) CHECK (length_cm IS NULL OR length_cm > 0);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS width_cm  numeric(7,1) CHECK (width_cm  IS NULL OR width_cm  > 0);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS height_cm numeric(7,1) CHECK (height_cm IS NULL OR height_cm > 0);
GRANT SELECT (length_cm, width_cm, height_cm) ON public.products TO anon, authenticated;
GRANT INSERT (length_cm, width_cm, height_cm), UPDATE (length_cm, width_cm, height_cm) ON public.products TO authenticated;

-- 2) Cabang
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS postal_code text CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{5}$');
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS area_id text;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS instant_delivery boolean NOT NULL DEFAULT false;

-- 3) Pesanan: waktu link bayar dibuat (token & url sudah ada: payment_token, payment_url)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_link_at timestamptz;

-- Staf mengisi ongkir pesanan WhatsApp (mode manual) SEBELUM link bayar dibuat. Total dihitung ulang di database.
CREATE OR REPLACE FUNCTION public.staff_set_shipping(_order_id uuid, _cost integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o public.orders%ROWTYPE; _total integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _cost IS NULL OR _cost < 0 OR _cost > 2000000 THEN RAISE EXCEPTION 'Ongkir harus 0 sampai 2.000.000.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pesanan tidak ditemukan'; END IF;
  IF o.shipping_mode <> 'manual' THEN RAISE EXCEPTION 'Ongkir pesanan ini sudah dihitung kurir dan tidak bisa diubah.'; END IF;
  IF o.status NOT IN ('menunggu_konfirmasi','pending') THEN RAISE EXCEPTION 'Pesanan sudah %', o.status; END IF;
  IF o.payment_token IS NOT NULL THEN RAISE EXCEPTION 'Link bayar sudah dibuat; ongkir tidak bisa diubah lagi.'; END IF;
  _total := o.subtotal - o.discount_total + _cost;
  UPDATE public.orders SET shipping_cost = _cost, total = _total, updated_at = now() WHERE id = _order_id;
  INSERT INTO public.admin_audit_log(user_id, action, payload)
    VALUES (auth.uid(), 'order_set_shipping', jsonb_build_object('order_number', o.order_number, 'old', o.shipping_cost, 'new', _cost, 'total', _total));
  RETURN _total;
END $$;
REVOKE ALL ON FUNCTION public.staff_set_shipping(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_set_shipping(uuid, integer) TO authenticated;
