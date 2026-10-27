-- 0017 Vita cerdas (Rilis 3). Aditif & idempoten. BELUM dipasang ke produksi (dipasang owner lewat mode pasang-database).
-- 1) Pencarian katalog full-text + trigram untuk Vita (SECURITY INVOKER: RLS & hak kolom anon tetap berlaku; tanpa HPP).
-- 2) Statistik Vita anonim (tanpa nama/telepon): hanya ditulis server lewat service_role, dibaca staf ber-izin reports_view.
-- Sebelum 0017 dipasang, server Vita otomatis memakai pencarian ilike biasa dan tidak mencatat statistik.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role; -- sama dengan bawaan Supabase

-- pg_trgm bisa sudah ada di skema lain (mis. public): pakai skema tempat ekstensi itu benar-benar berada.
DO $$
DECLARE s text := (SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm');
BEGIN
  EXECUTE format('CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON public.products USING gin (lower(name) %I.gin_trgm_ops)', s);
END $$;

-- 1. Pencarian ------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vita_search(p_terms text[], p_subcategories text[], p_max_price numeric, p_limit int)
RETURNS TABLE (
  id uuid, name text, brand text, category text, subcategory text, size text, servings text, dose text, flavor text,
  price numeric, in_stock boolean, image_url text, slug text, pack_count text, variant_group text, score real
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions AS $$
  WITH t AS (
    SELECT lower(btrim(x)) AS term FROM unnest(coalesce(p_terms, ARRAY[]::text[])) x
    WHERE length(btrim(x)) BETWEEN 2 AND 40
    LIMIT 24
  )
  SELECT p.id, p.name, p.brand, p.category, p.subcategory, p.size, p.servings, p.dose, p.flavor,
         p.price, (p.stock > 0) AS in_stock, p.image_url, p.slug, p.pack_count, p.variant_group,
         greatest(
           coalesce((SELECT max(word_similarity(t.term, lower(p.name))) FROM t), 0),
           CASE WHEN p.subcategory = ANY (coalesce(p_subcategories, ARRAY[]::text[])) THEN 0.5 ELSE 0 END
         )::real AS score
  FROM public.products p
  WHERE p.is_active AND NOT p.is_blocked AND p.is_purchasable AND p.price > 0
    AND (p_max_price IS NULL OR p.price <= p_max_price)
    AND (
      p.subcategory = ANY (coalesce(p_subcategories, ARRAY[]::text[]))
      OR EXISTS (
        SELECT 1 FROM t
        WHERE lower(p.name) LIKE '%' || t.term || '%'
           OR lower(coalesce(p.brand, '')) LIKE '%' || t.term || '%'
           OR to_tsvector('simple', p.name || ' ' || coalesce(p.brand, '')) @@ plainto_tsquery('simple', t.term)
           OR word_similarity(t.term, lower(p.name)) >= 0.6
      )
    )
  ORDER BY score DESC, p.id
  LIMIT least(greatest(coalesce(p_limit, 30), 1), 300)
$$;
REVOKE ALL ON FUNCTION public.vita_search(text[], text[], numeric, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vita_search(text[], text[], numeric, int) TO anon, authenticated, service_role;

-- 2. Statistik anonim -------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vita_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL DEFAULT 'answer' CHECK (event IN ('answer', 'chosen')),
  query_hash text NOT NULL CHECK (query_hash ~ '^[0-9a-f]{8,64}$'),
  query_text text CHECK (query_text IS NULL OR length(query_text) <= 80),
  detected_goal text CHECK (detected_goal IS NULL OR detected_goal ~ '^[a-z_]{2,30}$'),
  zero_result boolean NOT NULL DEFAULT false,
  chosen_product_id uuid,
  mode text CHECK (mode IS NULL OR mode IN ('keyword', 'ai'))
);
CREATE INDEX IF NOT EXISTS vita_events_created_idx ON public.vita_events (created_at DESC);
ALTER TABLE public.vita_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vita_events FROM PUBLIC, anon, authenticated;
-- Tanpa policy = tidak ada akses langsung untuk anon/authenticated. Baca hanya lewat vita_insight().

CREATE OR REPLACE FUNCTION public.vita_log_event(
  p_event text, p_query_hash text, p_query_text text, p_detected_goal text, p_zero_result boolean, p_chosen_product_id uuid, p_mode text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.vita_events (event, query_hash, query_text, detected_goal, zero_result, chosen_product_id, mode)
  VALUES (
    coalesce(p_event, 'answer'), lower(p_query_hash),
    CASE WHEN coalesce(p_zero_result, false) THEN left(nullif(btrim(p_query_text), ''), 80) END,
    nullif(p_detected_goal, ''), coalesce(p_zero_result, false), p_chosen_product_id, nullif(p_mode, '')
  );
END $$;
REVOKE ALL ON FUNCTION public.vita_log_event(text, text, text, text, boolean, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vita_log_event(text, text, text, text, boolean, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.vita_insight(p_days int DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
BEGIN
  IF NOT public.has_permission(auth.uid(), 'reports_view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'days', least(greatest(coalesce(p_days, 30), 1), 365),
    'answers', (SELECT count(*) FROM vita_events WHERE event = 'answer' AND created_at >= since),
    'zero_results', (SELECT count(*) FROM vita_events WHERE event = 'answer' AND zero_result AND created_at >= since),
    'chosen', (SELECT count(*) FROM vita_events WHERE event = 'chosen' AND created_at >= since),
    'ai_answers', (SELECT count(*) FROM vita_events WHERE event = 'answer' AND mode = 'ai' AND created_at >= since),
    'top_zero', coalesce((
      SELECT jsonb_agg(z ORDER BY z.hits DESC, z.last_seen DESC) FROM (
        SELECT query_text, count(*) AS hits, max(created_at) AS last_seen
        FROM vita_events
        WHERE event = 'answer' AND zero_result AND query_text IS NOT NULL AND created_at >= since
        GROUP BY query_text ORDER BY count(*) DESC, max(created_at) DESC LIMIT 30
      ) z), '[]'::jsonb),
    'by_goal', coalesce((
      SELECT jsonb_agg(g ORDER BY g.hits DESC) FROM (
        SELECT coalesce(detected_goal, '(tidak terdeteksi)') AS goal, count(*) AS hits
        FROM vita_events WHERE event = 'answer' AND created_at >= since
        GROUP BY 1 ORDER BY 2 DESC LIMIT 30
      ) g), '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.vita_insight(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vita_insight(int) TO authenticated;
