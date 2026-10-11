GRANT SELECT (weight_grams, images, variant_group) ON public.products TO anon;
GRANT SELECT (weight_grams, images, variant_group, publish_issue) ON public.products TO authenticated;
GRANT INSERT (weight_grams, images, variant_group), UPDATE (weight_grams, images, variant_group) ON public.products TO authenticated;