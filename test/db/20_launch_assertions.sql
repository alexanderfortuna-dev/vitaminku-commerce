-- Asersi DB "Launch-ready v3" (Postgres 16 LOKAL, bukan Supabase asli).
CREATE TEMP TABLE r(name text, ok boolean, detail text);
CREATE TEMP TABLE ids(k text PRIMARY KEY, v uuid);

CREATE FUNCTION pg_temp.as_user(_uid uuid, _role text, _sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE res text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE format('SET LOCAL ROLE %I', _role);
  BEGIN EXECUTE _sql; res := 'OK'; EXCEPTION WHEN OTHERS THEN res := 'ERR ' || SQLSTATE; END;
  RESET ROLE;
  RETURN res;
END $$;
CREATE FUNCTION pg_temp.val_as(_uid uuid, _role text, _sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE res text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE format('SET LOCAL ROLE %I', _role);
  BEGIN EXECUTE _sql INTO res; EXCEPTION WHEN OTHERS THEN res := 'ERR ' || SQLSTATE; END;
  RESET ROLE;
  RETURN coalesce(res, 'NULL');
END $$;

-- fixture
INSERT INTO auth.users(id,email) SELECT gen_random_uuid(), n||'@qa' FROM unnest(ARRAY['owner1','owner2','mgr','mgrhpp','seller','cust']) n;
INSERT INTO ids SELECT split_part(email,'@',1), id FROM auth.users;
INSERT INTO public.store_branches(id,name,area,whatsapp,code) VALUES
  ('00000000-0000-0000-0000-00000000b001','Garuda','Bali','6281111111111','GARUDA'),
  ('00000000-0000-0000-0000-00000000b002','Canggu','Bali','6282222222222','CANGGU');
INSERT INTO public.user_roles(user_id,role,is_active,can_view_hpp,branch_id) VALUES
  ((SELECT v FROM ids WHERE k='owner1'),'owner',true,false,NULL),
  ((SELECT v FROM ids WHERE k='mgr'),'admin',true,false,'00000000-0000-0000-0000-00000000b001'),
  ((SELECT v FROM ids WHERE k='mgrhpp'),'admin',true,true,NULL),
  ((SELECT v FROM ids WHERE k='seller'),'seller',true,false,NULL);
INSERT INTO public.products(sku,name,brand,category,subcategory,price,hpp,stock,slug,is_active)
  VALUES ('QA-1','Uji Whey','Fitlife','Sport Nutrition','Protein',100000,60000,5,'uji-whey',true);

DO $$
DECLARE o1 uuid := (SELECT v FROM ids WHERE k='owner1'); o2 uuid := (SELECT v FROM ids WHERE k='owner2');
  m uuid := (SELECT v FROM ids WHERE k='mgr'); mh uuid := (SELECT v FROM ids WHERE k='mgrhpp');
  s uuid := (SELECT v FROM ids WHERE k='seller'); c uuid := (SELECT v FROM ids WHERE k='cust');
  pid uuid := (SELECT id FROM public.products WHERE sku='QA-1'); x text; oid uuid; oid2 uuid; cid uuid; tok text;
BEGIN
  -- ===== HPP =====
  x := pg_temp.as_user(NULL,'anon','SELECT hpp FROM public.products');
  INSERT INTO r VALUES ('anon: SELECT hpp ditolak', x='ERR 42501', x);
  x := pg_temp.as_user(m,'authenticated','SELECT hpp FROM public.products');
  INSERT INTO r VALUES ('manajer: SELECT hpp langsung ditolak', x='ERR 42501', x);
  x := pg_temp.as_user(m,'authenticated',format('SELECT * FROM public.admin_get_product_hpp(ARRAY[%L]::uuid[])',pid));
  INSERT INTO r VALUES ('manajer tanpa izin: RPC hpp ditolak (42501)', x='ERR 42501', x);
  x := pg_temp.as_user(s,'authenticated',format('SELECT * FROM public.admin_get_product_hpp(ARRAY[%L]::uuid[])',pid));
  INSERT INTO r VALUES ('seller: RPC hpp ditolak', x='ERR 42501', x);
  x := pg_temp.as_user(mh,'authenticated',format('SELECT * FROM public.admin_get_product_hpp(ARRAY[%L]::uuid[])',pid));
  INSERT INTO r VALUES ('manajer + can_view_hpp: RPC hpp boleh', x='OK', x);
  x := pg_temp.as_user(mh,'authenticated',format('SELECT public.admin_set_product_hpp(%L,1)',pid));
  INSERT INTO r VALUES ('manajer + can_view_hpp: UBAH hpp tetap ditolak (owner saja)', x='ERR 42501', x);
  x := pg_temp.as_user(o1,'authenticated',format('SELECT * FROM public.admin_get_product_hpp(ARRAY[%L]::uuid[])',pid));
  INSERT INTO r VALUES ('owner: RPC hpp boleh', x='OK', x);
  x := pg_temp.as_user(c,'authenticated','SELECT hpp FROM public.products');
  INSERT INTO r VALUES ('pelanggan login: SELECT hpp ditolak', x='ERR 42501', x);

  -- ===== izin =====
  INSERT INTO r VALUES ('owner punya users_manage', public.has_permission(o1,'users_manage'), '');
  INSERT INTO r VALUES ('manajer TIDAK punya users_manage', NOT public.has_permission(m,'users_manage'), '');
  INSERT INTO r VALUES ('manajer TIDAK punya integrations_manage/money_move/hard_delete/customers_export/blocklist_edit',
    NOT (public.has_permission(m,'integrations_manage') OR public.has_permission(m,'money_move') OR public.has_permission(m,'hard_delete')
      OR public.has_permission(m,'customers_export') OR public.has_permission(m,'blocklist_edit')), '');
  INSERT INTO r VALUES ('manajer punya orders_manage, products_hero, promos_manage', public.has_permission(m,'orders_manage') AND public.has_permission(m,'products_hero') AND public.has_permission(m,'promos_manage'), '');
  INSERT INTO r VALUES ('seller hanya products_edit/photos', public.has_permission(s,'products_edit') AND NOT public.has_permission(s,'orders_manage') AND NOT public.has_permission(s,'products_price_stock'), '');
  INSERT INTO r VALUES ('pelanggan tanpa peran: tidak punya izin apa pun', NOT public.has_permission(c,'products_edit'), '');
  x := pg_temp.as_user(m,'authenticated',format($q$SELECT public.owner_add_block('keyword','zzzz','uji')$q$));
  INSERT INTO r VALUES ('manajer: ubah blocklist ditolak (42501)', x='ERR 42501', x);

  -- ===== owner terakhir & ubah peran sendiri =====
  x := pg_temp.as_user(NULL,'postgres',format('UPDATE public.user_roles SET role=%L WHERE user_id=%L','admin',o1));
  INSERT INTO r VALUES ('DB menolak menurunkan owner TERAKHIR', x='ERR P0001', x);
  x := pg_temp.as_user(NULL,'postgres',format('UPDATE public.user_roles SET is_active=false WHERE user_id=%L',o1));
  INSERT INTO r VALUES ('DB menolak menonaktifkan owner terakhir', x='ERR P0001', x);
  x := pg_temp.as_user(NULL,'postgres',format('DELETE FROM public.user_roles WHERE user_id=%L',o1));
  INSERT INTO r VALUES ('DB menolak menghapus owner terakhir', x='ERR P0001', x);
  INSERT INTO public.user_roles(user_id,role,is_active) VALUES (o2,'owner',true);
  x := pg_temp.as_user(o1,'postgres',format('UPDATE public.user_roles SET role=%L WHERE user_id=%L','admin',o1));
  INSERT INTO r VALUES ('owner tak bisa ubah peran SENDIRI (walau ada owner lain)', x='ERR P0001', x);
  x := pg_temp.as_user(o1,'postgres',format('UPDATE public.user_roles SET role=%L WHERE user_id=%L','admin',o2));
  INSERT INTO r VALUES ('owner boleh menurunkan owner LAIN bila masih ada owner aktif', x='OK', x);
  UPDATE public.user_roles SET role='owner' WHERE user_id=o2;

  -- ===== pelanggan =====
  INSERT INTO public.customers(whatsapp_normalized,name) VALUES ('6281200000001','Budi');
  x := pg_temp.val_as(NULL,'anon','SELECT count(*) FROM public.customers');
  INSERT INTO r VALUES ('anon tidak bisa baca customers (0 baris)', x='0' OR x LIKE 'ERR%', x);
  x := pg_temp.val_as(m,'authenticated','SELECT count(*) FROM public.customers');
  INSERT INTO r VALUES ('manajer tidak bisa membuang seluruh daftar pelanggan (0 baris)', x='0', x);
  x := pg_temp.val_as(o1,'authenticated','SELECT count(*) FROM public.customers');
  INSERT INTO r VALUES ('owner bisa baca semua pelanggan', x='1', x);
  x := pg_temp.as_user(m,'authenticated',$q$SELECT * FROM public.staff_find_customer('bu')$q$);
  INSERT INTO r VALUES ('manajer: cari pelanggan <4 huruf ditolak', x='ERR P0001', x);
  x := pg_temp.val_as(m,'authenticated',$q$SELECT count(*) FROM public.staff_find_customer('Budi')$q$);
  INSERT INTO r VALUES ('manajer: cari pelanggan 1-per-1 berhasil', x='1', x);
  x := pg_temp.as_user(s,'authenticated',$q$SELECT * FROM public.staff_find_customer('Budi')$q$);
  INSERT INTO r VALUES ('seller: cari pelanggan ditolak', x='ERR 42501', x);
  x := pg_temp.as_user(c,'authenticated',$q$SELECT public.upsert_customer_for_order('6281200000002','X','alamat',false,NULL,1000)$q$);
  INSERT INTO r VALUES ('pelanggan tidak bisa memanggil upsert (hanya server)', x LIKE 'ERR%', x);

  cid := public.upsert_customer_for_order('6281200000002','Sari','Jl. Uji No. 1 Denpasar',false,NULL,250000);
  PERFORM public.upsert_customer_for_order('6281200000002','Sari D','Jl. Uji No. 1 Denpasar',true,NULL,50000);
  INSERT INTO r VALUES ('tamu: pelanggan dibuat lalu dihitung ulang (2 pesanan, 300000, opt-in+consent_at)',
    (SELECT order_count=2 AND total_spent=300000 AND marketing_opt_in AND consent_at IS NOT NULL AND user_id IS NULL FROM public.customers WHERE id=cid), '');
  PERFORM public.upsert_customer_for_order('6281200000002','Sari D','x',false,NULL,0);
  INSERT INTO r VALUES ('opt-in tidak dicabut diam-diam oleh pesanan berikutnya', (SELECT marketing_opt_in FROM public.customers WHERE id=cid), '');
  -- pembeli login dengan nomor yang SUDAH ada: tidak boleh mengklaim lewat telepon
  PERFORM public.upsert_customer_for_order('6281200000002','Penyusup','x',false,c,1000);
  INSERT INTO r VALUES ('login + nomor milik orang lain: akun TIDAK mengklaim pelanggan itu', (SELECT user_id IS NULL FROM public.customers WHERE id=cid), '');
  -- pesanan + klaim lewat token
  INSERT INTO public.orders(order_number,access_token,payment_mode,status,customer_name,whatsapp,address,province,city,district,postal_code,courier_company,courier_service,courier_label,shipping_mode,subtotal,shipping_cost,total,branch_id,customer_id)
    VALUES ('VK-QA-1',repeat('a',48),'whatsapp','menunggu_konfirmasi','Sari','6281200000002','Jl Uji 1','','','','','manual','admin','x','manual',100000,0,100000,'00000000-0000-0000-0000-00000000b001',cid) RETURNING id INTO oid;
  INSERT INTO public.order_items(order_id,product_id,slug,sku,name,unit_price,quantity,line_total) VALUES (oid,pid,'uji-whey','QA-1','Uji Whey',100000,1,100000);
  INSERT INTO public.customers(whatsapp_normalized,name,user_id) VALUES ('6281200000003','Cust Login', (SELECT v FROM ids WHERE k='mgrhpp')); -- user lain sudah punya baris
  x := (SELECT public.claim_customer_for_user(c,'cust@qa','salah'||repeat('b',44))::text);
  INSERT INTO r VALUES ('klaim dengan token salah → gagal (NULL)', x IS NULL, coalesce(x,'NULL'));
  x := (SELECT public.claim_customer_for_user(c,'cust@qa',repeat('a',48))::text);
  INSERT INTO r VALUES ('klaim dengan token pesanan benar → berhasil', x = cid::text, coalesce(x,'NULL'));
  x := pg_temp.val_as(c,'authenticated','SELECT count(*) FROM public.orders');
  INSERT INTO r VALUES ('pelanggan yang diklaim bisa membaca pesanannya (RLS)', x='1', x);
  x := pg_temp.val_as(m,'authenticated',$q$WITH d AS (DELETE FROM public.orders RETURNING 1) SELECT count(*) FROM d$q$);
  INSERT INTO r VALUES ('manajer tidak bisa menghapus pesanan (0 baris terhapus)', x='0' OR x LIKE 'ERR%', x);
  INSERT INTO r VALUES ('pesanan tetap utuh setelah percobaan hapus', (SELECT count(*) FROM public.orders WHERE order_number='VK-QA-1')=1, '');
  x := pg_temp.val_as(s,'authenticated','SELECT count(*) FROM public.orders');
  INSERT INTO r VALUES ('seller tidak membaca pesanan', x='0', x);

  -- ===== admin cabang =====
  INSERT INTO public.branch_admins(branch_id,name,whatsapp,role,referral_code) VALUES
    ('00000000-0000-0000-0000-00000000b001','Putu','6281300000001','utama','PUTU1'),
    ('00000000-0000-0000-0000-00000000b001','Made','6281300000002','cadangan','MADE1');
  x := pg_temp.as_user(NULL,'postgres',$q$INSERT INTO public.branch_admins(branch_id,name,whatsapp,role) VALUES ('00000000-0000-0000-0000-00000000b001','Dobel','6281300000009','utama')$q$);
  INSERT INTO r VALUES ('hanya 1 admin Utama aktif per cabang', x='ERR 23505', x);
  x := pg_temp.val_as(NULL,'anon','SELECT count(*) FROM public.branch_admins');
  INSERT INTO r VALUES ('anon tidak bisa membaca tabel branch_admins langsung (0 baris)', x='0' OR x LIKE 'ERR%', x);
  x := pg_temp.val_as(NULL,'anon','SELECT count(*) FROM public.public_branch_contacts()');
  INSERT INTO r VALUES ('anon melihat kontak publik via fungsi (2 baris, tanpa nama)', x='2', x);
  x := pg_temp.val_as(NULL,'anon',$q$SELECT string_agg(role, ',' ORDER BY role) FROM public.public_branch_contacts()$q$);
  INSERT INTO r VALUES ('kontak publik hanya berisi peran', x='cadangan,utama', x);
  x := pg_temp.as_user(m,'authenticated',$q$INSERT INTO public.branch_admins(branch_id,name,whatsapp,role) VALUES ('00000000-0000-0000-0000-00000000b002','Wayan','6281300000003','utama')$q$);
  INSERT INTO r VALUES ('manajer boleh menambah admin cabang', x='OK', x);
  x := pg_temp.as_user(s,'authenticated',$q$INSERT INTO public.branch_admins(branch_id,name,whatsapp,role) VALUES ('00000000-0000-0000-0000-00000000b002','Nyoman','6281300000004','cadangan')$q$);
  INSERT INTO r VALUES ('seller tidak boleh menambah admin cabang', x LIKE 'ERR%', x);
  x := pg_temp.as_user(m,'authenticated',format('DELETE FROM public.branch_admins WHERE name=%L','Wayan'));
  INSERT INTO r VALUES ('admin cabang tidak bisa dihapus permanen (hanya nonaktif)', (SELECT count(*)=1 FROM public.branch_admins WHERE name='Wayan'), x);

  -- ===== tahap pesanan =====
  x := pg_temp.as_user(s,'authenticated',format('SELECT public.staff_set_order_stage(%L,%L)',oid,'dikonfirmasi'));
  INSERT INTO r VALUES ('seller tidak bisa mengubah tahap pesanan', x='ERR 42501', x);
  x := pg_temp.as_user(m,'authenticated',format('SELECT public.staff_set_order_stage(%L,%L)',oid,'dikemas'));
  INSERT INTO r VALUES ('tidak boleh loncat tahap (Baru→Dikemas)', x LIKE 'ERR%', x);
  UPDATE public.orders SET branch_id='00000000-0000-0000-0000-00000000b002' WHERE id=oid;
  x := pg_temp.as_user(m,'authenticated',format('SELECT public.staff_set_order_stage(%L,%L)',oid,'dikonfirmasi'));
  INSERT INTO r VALUES ('manajer cabang Garuda tidak bisa mengurus pesanan cabang Canggu', x='ERR 42501', x);
  UPDATE public.orders SET branch_id='00000000-0000-0000-0000-00000000b001' WHERE id=oid;
  x := pg_temp.as_user(m,'authenticated',format('SELECT public.staff_set_order_stage(%L,%L)',oid,'dikonfirmasi'));
  INSERT INTO r VALUES ('Baru→Dikonfirmasi oleh manajer cabang sendiri', x='OK', x);
  INSERT INTO r VALUES ('konfirmasi memotong stok sekali (5→4) dan status paid', (SELECT stock=4 FROM public.products WHERE sku='QA-1') AND (SELECT status='paid' AND stage='dikonfirmasi' FROM public.orders WHERE id=oid), '');
  PERFORM pg_temp.as_user(m,'authenticated',format('SELECT public.staff_set_order_stage(%L,%L)',oid,'dikemas'));
  PERFORM pg_temp.as_user(m,'authenticated',format('SELECT public.staff_set_order_stage(%L,%L)',oid,'dikirim'));
  x := pg_temp.as_user(m,'authenticated',format('SELECT public.staff_set_order_stage(%L,%L)',oid,'selesai'));
  INSERT INTO r VALUES ('Dikemas→Dikirim→Selesai berurutan', x='OK' AND (SELECT stage='selesai' FROM public.orders WHERE id=oid), x);
  x := pg_temp.as_user(m,'authenticated',format('SELECT public.staff_set_order_stage(%L,%L)',oid,'batal'));
  INSERT INTO r VALUES ('pesanan Selesai tidak bisa dibatalkan', x LIKE 'ERR%', x);

  -- ===== batalkan impor =====
  INSERT INTO public.product_imports(id,created_by,file_name,mode) VALUES ('00000000-0000-0000-0000-0000000000a1', m, 'uji.xlsx','overwrite');
  INSERT INTO public.product_import_rows VALUES ('00000000-0000-0000-0000-0000000000a1','QA-1',true,
    jsonb_build_object('name','Uji Whey','brand','Fitlife','category','Sport Nutrition','subcategory','Protein','price',100000,'stock',4,'is_active',true,'images','[]'::jsonb));
  UPDATE public.products SET price=999 WHERE sku='QA-1';
  x := pg_temp.as_user(s,'authenticated',$q$SELECT public.undo_product_import('00000000-0000-0000-0000-0000000000a1')$q$);
  INSERT INTO r VALUES ('seller tidak bisa membatalkan impor', x='ERR 42501', x);
  x := pg_temp.as_user(m,'authenticated',$q$SELECT public.undo_product_import('00000000-0000-0000-0000-0000000000a1')$q$);
  INSERT INTO r VALUES ('manajer membatalkan impor terakhir → harga pulih 100000', x='OK' AND (SELECT price=100000 FROM public.products WHERE sku='QA-1'), x);
  x := pg_temp.as_user(m,'authenticated',$q$SELECT public.undo_product_import('00000000-0000-0000-0000-0000000000a1')$q$);
  INSERT INTO r VALUES ('impor yang sama tidak bisa dibatalkan dua kali', x LIKE 'ERR%', x);
END $$;

-- RLS aktif di semua tabel public
INSERT INTO r SELECT 'RLS aktif di semua tabel public', NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity),
  coalesce((SELECT string_agg(relname,',') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity),'');
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS hasil, name, CASE WHEN ok THEN '' ELSE detail END AS detail FROM r ORDER BY ok, name;
SELECT count(*) FILTER (WHERE ok) AS lulus, count(*) FILTER (WHERE NOT ok) AS gagal FROM r;
