-- 0020: pola zat terlarang yang sebelumnya hanya ada di salah satu daftar kode
-- (Vita / vitamin-finder), sekarang ikut product_blocklist. Aditif & idempoten.
-- Setelah pola masuk, produk yang cocok dan belum diblokir dijalankan ulang lewat products_guard.
-- Pemilik yang memasang. Urutan: migrasi dulu, baru deploy.
INSERT INTO public.product_blocklist (pattern, reason) VALUES
  ('clenbuterol', 'Clenbuterol'),
  ('steroid\s*anabolik', 'Steroid anabolik'),
  ('mk-?2866', 'SARMs'),
  ('trenbolone', 'Steroid anabolik'),
  ('nandrolone', 'Steroid anabolik'),
  ('\mdeca\M', 'Steroid anabolik'),
  ('dianabol', 'Steroid anabolik'),
  ('oxandrolone', 'Steroid anabolik'),
  ('\manavar\M', 'Steroid anabolik'),
  ('\mwinstrol\M', 'Steroid anabolik'),
  ('stanozolol', 'Steroid anabolik'),
  ('\mhgh\M', 'Hormon pertumbuhan'),
  ('growth\s*hormone', 'Hormon pertumbuhan'),
  ('bpc-?157', 'Peptida terlarang'),
  ('sibutramin\w*', 'Sibutramine'),
  ('efedrin\w*', 'Efedrin'),
  ('ephedr\w*', 'Ephedrine'),
  ('\mdnp\M', 'DNP'),
  ('\mdmaa\M', 'DMAA'),
  ('phentermine', 'Phentermine'),
  ('sildenafil', 'Obat keras'),
  ('tadalafil', 'Obat keras'),
  ('\mviagra\M', 'Obat keras'),
  ('\mcialis\M', 'Obat keras')
ON CONFLICT (pattern) DO NOTHING;

UPDATE public.products
SET updated_at = now()
WHERE NOT is_blocked
  AND concat_ws(' ', name, brand, category, subcategory, description) ~* (
    SELECT string_agg(pattern, '|') FROM public.product_blocklist
    WHERE pattern IN (
      'clenbuterol', 'steroid\s*anabolik', 'mk-?2866', 'trenbolone', 'nandrolone', '\mdeca\M',
      'dianabol', 'oxandrolone', '\manavar\M', '\mwinstrol\M', 'stanozolol', '\mhgh\M',
      'growth\s*hormone', 'bpc-?157', 'sibutramin\w*', 'efedrin\w*', 'ephedr\w*', '\mdnp\M',
      '\mdmaa\M', 'phentermine', 'sildenafil', 'tadalafil', '\mviagra\M', '\mcialis\M'
    )
  );
