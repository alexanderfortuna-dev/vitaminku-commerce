REVOKE SELECT ON public.products FROM anon, authenticated, PUBLIC;
REVOKE INSERT, UPDATE ON public.products FROM anon;
GRANT SELECT (id, sku, name, brand, category, subcategory, size, pack_count, servings, dose, flavor, price, compare_at_price, stock, image_url, description, bpom_number, is_active, slug, created_at, updated_at, is_blocked, blocked_reason) ON public.products TO anon, authenticated;
REVOKE INSERT (hpp), UPDATE (hpp) ON public.products FROM authenticated;
REVOKE UPDATE ON public.products FROM authenticated;
GRANT UPDATE (sku, name, brand, category, subcategory, size, pack_count, servings, dose, flavor, price, compare_at_price, stock, image_url, description, bpom_number, is_active, slug, updated_at) ON public.products TO authenticated;
REVOKE INSERT ON public.products FROM authenticated;
GRANT INSERT (id, sku, name, brand, category, subcategory, size, pack_count, servings, dose, flavor, price, compare_at_price, stock, image_url, description, bpom_number, is_active, slug) ON public.products TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_product_hpp(_ids uuid[])
RETURNS TABLE(id uuid, hpp numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT p.id, p.hpp FROM public.products p WHERE p.id = ANY(_ids);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_product_hpp(_id uuid, _hpp numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _hpp IS NOT NULL AND _hpp < 0 THEN RAISE EXCEPTION 'invalid hpp'; END IF;
  UPDATE public.products SET hpp = _hpp WHERE id = _id;
END $$;

REVOKE ALL ON FUNCTION public.admin_get_product_hpp(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_product_hpp(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_product_hpp(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_product_hpp(uuid, numeric) TO authenticated;