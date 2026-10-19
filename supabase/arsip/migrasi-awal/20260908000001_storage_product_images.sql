-- Bucket foto produk (privat, 5 MB) seperti di Lovable; unggahan lewat service role di server.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('product-images', 'product-images', false, 5242880)
ON CONFLICT (id) DO NOTHING;

-- ROLLBACK: DELETE FROM storage.buckets WHERE id = 'product-images';  (kosongkan isinya dulu)
