-- Pengerasan: fungsi pemicu internal tidak perlu bisa dipanggil lewat API (/rest/v1/rpc/...).
-- Pemicu tetap berjalan (hak EXECUTE tidak diperiksa saat pemicu aktif).
REVOKE ALL ON FUNCTION public.products_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.products_activity_log() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.product_block_reason(text) FROM PUBLIC, anon, authenticated;

-- ROLLBACK:
-- GRANT EXECUTE ON FUNCTION public.products_guard(), public.products_activity_log(), public.product_block_reason(text) TO authenticated;
