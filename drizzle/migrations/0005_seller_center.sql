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