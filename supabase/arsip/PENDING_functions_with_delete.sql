-- DUA FUNGSI yang memuat perintah hapus. Alat otomatis (Claude) tidak bisa memasangnya di proyek Supabase baru
-- karena butuh persetujuan manual. Tempel & Run SEKALI di Supabase SQL Editor proyek "vitaminku".
-- Isinya sama persis dengan drizzle 0004 (chat_rate_hit) dan 0005 (owner_remove_block).
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
