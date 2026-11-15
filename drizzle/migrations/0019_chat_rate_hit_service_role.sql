-- 0019: chat_rate_hit hanya boleh dipanggil service_role (server).
-- Anon/authenticated tidak boleh mengisi atau menguras ember batas laju dari browser.
-- Aditif & idempoten. Pasang migrasi ini SEBELUM deploy kode yang mengandalkan grant service_role.
REVOKE ALL ON FUNCTION public.chat_rate_hit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_rate_hit(text, int, int) TO service_role;
