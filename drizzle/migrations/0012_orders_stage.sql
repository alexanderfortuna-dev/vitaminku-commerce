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
