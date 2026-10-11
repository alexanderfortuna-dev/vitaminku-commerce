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