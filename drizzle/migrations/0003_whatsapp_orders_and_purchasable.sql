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