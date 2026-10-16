-- 0011: admin per cabang (Utama + Cadangan), kode cabang untuk tautan, kontak publik lewat fungsi.
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.store_branches ADD COLUMN IF NOT EXISTS opening_hours text;
CREATE UNIQUE INDEX IF NOT EXISTS store_branches_code_key ON public.store_branches (upper(code)) WHERE code IS NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_branches_code_check') THEN
    ALTER TABLE public.store_branches ADD CONSTRAINT store_branches_code_check
      CHECK (code IS NULL OR code ~ '^[A-Z0-9_-]{2,24}$');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.branch_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.store_branches(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  whatsapp text NOT NULL CHECK (whatsapp ~ '^62[0-9]{8,13}$'),
  role text NOT NULL CHECK (role IN ('utama','cadangan')),
  referral_code text CHECK (referral_code IS NULL OR referral_code ~ '^[A-Z0-9_-]{2,32}$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS branch_admins_one_active_utama ON public.branch_admins (branch_id) WHERE role = 'utama' AND is_active;
CREATE UNIQUE INDEX IF NOT EXISTS branch_admins_ref_key ON public.branch_admins (referral_code) WHERE referral_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS branch_admins_branch_wa_key ON public.branch_admins (branch_id, whatsapp);

ALTER TABLE public.branch_admins ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.branch_admins TO authenticated;
GRANT ALL ON public.branch_admins TO service_role;
DROP POLICY IF EXISTS "Staff read branch admins" ON public.branch_admins;
CREATE POLICY "Staff read branch admins" ON public.branch_admins FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'branches_manage'));
DROP POLICY IF EXISTS "Staff insert branch admins" ON public.branch_admins;
CREATE POLICY "Staff insert branch admins" ON public.branch_admins FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'branches_manage'));
DROP POLICY IF EXISTS "Staff update branch admins" ON public.branch_admins;
CREATE POLICY "Staff update branch admins" ON public.branch_admins FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'branches_manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'branches_manage'));
-- Tidak ada kebijakan DELETE: admin dinonaktifkan (is_active=false), tidak dihapus.

-- Kontak publik untuk checkout: hanya admin aktif dari cabang aktif; tanpa nama dan tanpa kode referral.
CREATE OR REPLACE FUNCTION public.public_branch_contacts()
RETURNS TABLE(branch_id uuid, role text, whatsapp text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.branch_id, a.role, a.whatsapp
  FROM public.branch_admins a JOIN public.store_branches b ON b.id = a.branch_id
  WHERE a.is_active AND b.is_active
  ORDER BY a.branch_id, (a.role = 'utama') DESC, a.created_at
$$;
REVOKE ALL ON FUNCTION public.public_branch_contacts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_branch_contacts() TO anon, authenticated, service_role;

-- ROLLBACK: DROP FUNCTION public_branch_contacts; DROP TABLE branch_admins; ALTER TABLE store_branches DROP COLUMN code, address, opening_hours;
