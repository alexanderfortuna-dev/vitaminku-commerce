CREATE TABLE public.chat_rate_hits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_rate_hits_visitor_idx ON public.chat_rate_hits (visitor_hash, created_at);
GRANT ALL ON public.chat_rate_hits TO service_role;
ALTER TABLE public.chat_rate_hits ENABLE ROW LEVEL SECURITY;
-- No policies: only the SECURITY DEFINER function below touches this table.

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