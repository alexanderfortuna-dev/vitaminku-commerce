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