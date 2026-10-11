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