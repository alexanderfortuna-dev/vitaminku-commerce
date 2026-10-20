import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { timingSafeEqual } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  adminGraphql,
  assertNoUserErrors,
  ShopifyAdminError,
  uploadStagedFile,
  type UserError,
} from "./shopify-admin.server";
import { ROLE_LEVEL, type AdminRole } from "./admin-roles";
import { hasPermission, type Permission } from "./permissions";
import type { TablesUpdate } from "@/integrations/supabase/types";

type SupabaseAuthedClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: unknown }> };
    };
  };
};

export type Ctx = {
  supabase: SupabaseAuthedClient;
  userId: string;
  claims: Record<string, unknown>;
};

export type RoleSubject = { role: AdminRole | null; canViewHpp: boolean };

export async function resolveSubject(context: Ctx): Promise<RoleSubject> {
  const { data } = (await context.supabase
    .from("user_roles")
    .select("role, is_active, can_view_hpp")
    .eq("user_id", context.userId)
    .maybeSingle()) as {
    data: { role: AdminRole; is_active: boolean; can_view_hpp: boolean | null } | null;
  };

  if (data?.is_active) return { role: data.role, canViewHpp: !!data.can_view_hpp };
  if (data) return { role: null, canViewHpp: false };

  // Bootstrap: email owner yang dikonfigurasi mendapat peran owner saat login pertama,
  // HANYA bila emailnya sudah terverifikasi di Supabase Auth (bukan sekadar klaim).
  const bootstrap = process.env["ADMIN_BOOTSTRAP_EMAIL"]?.toLowerCase();
  const email = String((context.claims as { email?: string }).email ?? "").toLowerCase();
  if (bootstrap && email && bootstrap === email) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: au } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const verified = !!au?.user?.email_confirmed_at && au.user.email?.toLowerCase() === bootstrap;
    if (verified) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: context.userId, role: "owner", is_active: true });
      return { role: "owner", canViewHpp: false };
    }
  }
  return { role: null, canViewHpp: false };
}

export async function resolveRole(context: Ctx): Promise<AdminRole | null> {
  return (await resolveSubject(context)).role;
}

/** Penegakan di server: 403 bila peran tidak punya izin. Database tetap menolak sendiri (RLS / has_permission). */
export async function requirePermission(context: Ctx, perm: Permission): Promise<AdminRole> {
  const subject = await resolveSubject(context);
  if (!subject.role) {
    throw new ShopifyAdminError("403 — akun ini tidak punya akses panel admin.", 403);
  }
  if (!hasPermission(subject, perm)) {
    throw new ShopifyAdminError("403 — akses ditolak. Fitur ini khusus Owner.", 403);
  }
  return subject.role;
}

export async function requireRole(context: Ctx, minimum: AdminRole): Promise<AdminRole> {
  const role = await resolveRole(context);
  if (!role) {
    throw new ShopifyAdminError("403 — akun ini tidak punya akses panel admin.", 403);
  }
  if (ROLE_LEVEL[role] < ROLE_LEVEL[minimum]) {
    throw new ShopifyAdminError(`403 — akses ditolak. Butuh peran ${minimum}.`, 403);
  }
  return role;
}

export async function audit(
  context: Ctx,
  action: string,
  productId: string | null,
  payload: Record<string, unknown>,
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_audit_log").insert({
      user_id: context.userId,
      action,
      product_id: productId,
      payload: payload as never,
    });
  } catch (error) {
    console.error("audit log failed", error);
  }
}

export const getMyAdminRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await resolveRole(context as unknown as Ctx);
    return { role, email: (context.claims as { email?: string }).email ?? null };
  });

/* ------------------------------- products ------------------------------- */

const PRODUCT_LIST_FIELDS = `
  id
  title
  status
  vendor
  handle
  totalInventory
  featuredMedia { preview { image { url } } }
  priceRangeV2 { minVariantPrice { amount currencyCode } }
  media(first: 1) { edges { node { id } } }
`;

export const listAdminProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { search?: string; status?: "ACTIVE" | "DRAFT" | "ALL"; cursor?: string | null }) =>
      input ?? {},
  )
  .handler(async ({ data, context }) => {
    await requireRole(context as unknown as Ctx, "seller");
    const parts: string[] = [];
    if (data.search?.trim()) {
      const term = data.search.trim().replace(/["\\]/g, "");
      parts.push(`(title:*${term}* OR sku:*${term}* OR vendor:*${term}*)`);
    }
    if (data.status && data.status !== "ALL") parts.push(`status:${data.status}`);

    const result = await adminGraphql<{
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: Array<{ node: AdminProductListNode }>;
      };
    }>(
      `query ($first: Int!, $query: String, $after: String) {
        products(first: $first, query: $query, after: $after, sortKey: UPDATED_AT, reverse: true) {
          pageInfo { hasNextPage endCursor }
          edges { node { ${PRODUCT_LIST_FIELDS} } }
        }
      }`,
      { first: 30, query: parts.join(" AND ") || null, after: data.cursor ?? null },
    );

    return {
      products: result.products.edges.map((e) => e.node),
      pageInfo: result.products.pageInfo,
    };
  });

export type AdminProductListNode = {
  id: string;
  title: string;
  status: string;
  vendor: string | null;
  handle: string;
  totalInventory: number | null;
  featuredMedia: { preview: { image: { url: string } | null } | null } | null;
  priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } };
  media: { edges: Array<{ node: { id: string } }> };
};

// Scans products sequentially (250 per GraphQL call, up to 1500 per request)
// and returns only those with no media, so the "Tanpa gambar" filter works
// across the whole catalog instead of just the current page.
export const listAdminProductsWithoutMedia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string; cursor?: string | null }) => input ?? {})
  .handler(async ({ data, context }) => {
    await requireRole(context as unknown as Ctx, "seller");
    const term = data.search?.trim().replace(/["\\]/g, "");
    const query = term ? `(title:*${term}* OR sku:*${term}* OR vendor:*${term}*)` : null;

    const found: AdminProductListNode[] = [];
    let scanned = 0;
    let cursor = data.cursor ?? null;
    let hasNextPage = false;

    for (let page = 0; page < 6; page += 1) {
      const result = await adminGraphql<{
        products: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          edges: Array<{ node: AdminProductListNode }>;
        };
      }>(
        `query ($first: Int!, $query: String, $after: String) {
          products(first: $first, query: $query, after: $after, sortKey: UPDATED_AT, reverse: true) {
            pageInfo { hasNextPage endCursor }
            edges { node { ${PRODUCT_LIST_FIELDS} } }
          }
        }`,
        { first: 250, query, after: cursor },
      );
      const nodes = result.products.edges.map((e) => e.node);
      scanned += nodes.length;
      for (const node of nodes) if (node.media.edges.length === 0) found.push(node);
      cursor = result.products.pageInfo.endCursor;
      hasNextPage = result.products.pageInfo.hasNextPage;
      if (!hasNextPage) break;
    }

    return { products: found, scanned, pageInfo: { hasNextPage, endCursor: cursor } };
  });

export type AdminProductDetail = {
  id: string;
  title: string;
  descriptionHtml: string;
  status: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  handle: string;
  media: {
    edges: Array<{
      node: { id: string; alt: string | null; preview: { image: { url: string } | null } | null };
    }>;
  };
  variants: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        sku: string | null;
        price: string;
        compareAtPrice: string | null;
        inventoryQuantity: number | null;
      };
    }>;
  };
};

const PRODUCT_DETAIL_FIELDS = `
  id
  title
  descriptionHtml
  status
  vendor
  productType
  tags
  handle
  media(first: 20) { edges { node { id alt preview { image { url } } } } }
  variants(first: 50) {
    edges { node { id title sku price compareAtPrice inventoryQuantity } }
  }
`;

export const getAdminProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const role = await requireRole(context as unknown as Ctx, "seller");
    const result = await adminGraphql<{ product: AdminProductDetail | null }>(
      `query ($id: ID!) { product(id: $id) { ${PRODUCT_DETAIL_FIELDS} } }`,
      { id: data.id },
    );
    return { product: result.product, role };
  });

export const updateAdminProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      title?: string;
      descriptionHtml?: string;
      vendor?: string;
      productType?: string;
      tags?: string[];
      status?: "ACTIVE" | "DRAFT";
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const role = await requireRole(ctx, "seller");
    const input: Record<string, unknown> = { id: data.id };
    if (data.title !== undefined) input["title"] = data.title;
    if (data.descriptionHtml !== undefined) input["descriptionHtml"] = data.descriptionHtml;
    if (data.vendor !== undefined) input["vendor"] = data.vendor;
    if (data.productType !== undefined) input["productType"] = data.productType;
    if (data.tags !== undefined) input["tags"] = data.tags;

    // Status is an admin+ field, enforced on the server.
    if (data.status !== undefined) {
      if (ROLE_LEVEL[role] < ROLE_LEVEL.admin) {
        throw new ShopifyAdminError("403 — hanya admin/owner yang boleh mengubah status.", 403);
      }
      input["status"] = data.status;
    }

    const result = await adminGraphql<{
      productUpdate: { product: { id: string } | null; userErrors: UserError[] };
    }>(
      `mutation ($input: ProductInput!) {
        productUpdate(input: $input) { product { id } userErrors { field message } }
      }`,
      { input },
    );
    assertNoUserErrors(result.productUpdate.userErrors);
    await audit(ctx, "product_update", data.id, { fields: Object.keys(input) });
    return { ok: true };
  });

export const updateAdminVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      productId: string;
      variantId: string;
      price?: string;
      compareAtPrice?: string | null;
      sku?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "admin");
    const variant: Record<string, unknown> = { id: data.variantId };
    if (data.price !== undefined) variant["price"] = data.price;
    if (data.compareAtPrice !== undefined)
      variant["compareAtPrice"] = data.compareAtPrice === "" ? null : data.compareAtPrice;
    if (data.sku !== undefined) variant["inventoryItem"] = { sku: data.sku };

    const result = await adminGraphql<{
      productVariantsBulkUpdate: { userErrors: UserError[] };
    }>(
      `mutation ($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          userErrors { field message }
        }
      }`,
      { productId: data.productId, variants: [variant] },
    );
    assertNoUserErrors(result.productVariantsBulkUpdate.userErrors);
    await audit(ctx, "variant_update", data.productId, {
      variantId: data.variantId,
      fields: Object.keys(variant),
    });
    return { ok: true };
  });

export const createAdminProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { title: string; vendor?: string; price?: string }) => {
    if (!input.title?.trim()) throw new Error("Judul produk wajib diisi.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "admin");
    const created = await adminGraphql<{
      productCreate: {
        product: { id: string; variants: { edges: Array<{ node: { id: string } }> } } | null;
        userErrors: UserError[];
      };
    }>(
      `mutation ($input: ProductInput!) {
        productCreate(input: $input) {
          product { id variants(first: 1) { edges { node { id } } } }
          userErrors { field message }
        }
      }`,
      {
        input: {
          title: data.title.trim(),
          vendor: data.vendor?.trim() || undefined,
          status: "DRAFT",
        },
      },
    );
    assertNoUserErrors(created.productCreate.userErrors);
    const product = created.productCreate.product;
    if (!product) throw new ShopifyAdminError("Shopify tidak mengembalikan produk baru.");

    const variantId = product.variants.edges[0]?.node.id;
    if (data.price && variantId) {
      const priced = await adminGraphql<{ productVariantsBulkUpdate: { userErrors: UserError[] } }>(
        `mutation ($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            userErrors { field message }
          }
        }`,
        { productId: product.id, variants: [{ id: variantId, price: data.price }] },
      );
      assertNoUserErrors(priced.productVariantsBulkUpdate.userErrors);
    }
    await audit(ctx, "product_create", product.id, { title: data.title });
    return { id: product.id };
  });

export const bulkUpdateAdminStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; status: "ACTIVE" | "DRAFT" }) => {
    if (!input.ids?.length) throw new Error("Pilih minimal satu produk.");
    if (input.ids.length > 50) throw new Error("Maksimal 50 produk per aksi.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "admin");
    const failures: string[] = [];
    for (const id of data.ids) {
      try {
        const result = await adminGraphql<{ productUpdate: { userErrors: UserError[] } }>(
          `mutation ($input: ProductInput!) {
            productUpdate(input: $input) { userErrors { field message } }
          }`,
          { input: { id, status: data.status } },
        );
        assertNoUserErrors(result.productUpdate.userErrors);
      } catch (error) {
        failures.push(`${id}: ${error instanceof Error ? error.message : "gagal"}`);
      }
    }
    await audit(ctx, "bulk_status", null, {
      count: data.ids.length,
      status: data.status,
      failures: failures.length,
    });
    return { updated: data.ids.length - failures.length, failures };
  });

/* --------------------------------- media -------------------------------- */

export const uploadAdminProductImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      productId: string;
      files: Array<{ name: string; type: string; base64: string }>;
    }) => {
      if (!input.files?.length) throw new Error("Tidak ada gambar dipilih.");
      if (input.files.length > 8) throw new Error("Maksimal 8 gambar per unggahan.");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "seller");

    const staged = await adminGraphql<{
      stagedUploadsCreate: {
        stagedTargets: Array<{
          url: string;
          resourceUrl: string;
          parameters: Array<{ name: string; value: string }>;
        }>;
        userErrors: UserError[];
      };
    }>(
      `mutation ($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }`,
      {
        input: data.files.map((file) => ({
          filename: file.name,
          mimeType: file.type || "image/jpeg",
          resource: "IMAGE",
          httpMethod: "POST",
          fileSize: String(Math.ceil((file.base64.length * 3) / 4)),
        })),
      },
    );
    assertNoUserErrors(staged.stagedUploadsCreate.userErrors);

    const targets = staged.stagedUploadsCreate.stagedTargets;
    const mediaInput: Array<{ mediaContentType: string; originalSource: string }> = [];
    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i]!;
      const file = data.files[i]!;
      await uploadStagedFile(target.url, target.parameters, file);
      mediaInput.push({ mediaContentType: "IMAGE", originalSource: target.resourceUrl });
    }

    const result = await adminGraphql<{
      productCreateMedia: { mediaUserErrors: UserError[] };
    }>(
      `mutation ($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          mediaUserErrors { field message }
        }
      }`,
      { productId: data.productId, media: mediaInput },
    );
    assertNoUserErrors(result.productCreateMedia.mediaUserErrors);
    await audit(ctx, "media_upload", data.productId, { count: mediaInput.length });
    return { uploaded: mediaInput.length };
  });

export const deleteAdminProductMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productId: string; mediaId: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "seller");
    const result = await adminGraphql<{
      productDeleteMedia: { mediaUserErrors: UserError[] };
    }>(
      `mutation ($productId: ID!, $mediaIds: [ID!]!) {
        productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
          mediaUserErrors { field message }
        }
      }`,
      { productId: data.productId, mediaIds: [data.mediaId] },
    );
    assertNoUserErrors(result.productDeleteMedia.mediaUserErrors);
    await audit(ctx, "media_delete", data.productId, { mediaId: data.mediaId });
    return { ok: true };
  });

export const setAdminPrimaryMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productId: string; mediaId: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireRole(ctx, "seller");
    const result = await adminGraphql<{
      productReorderMedia: { userErrors: UserError[] };
    }>(
      `mutation ($id: ID!, $moves: [MoveInput!]!) {
        productReorderMedia(id: $id, moves: $moves) { userErrors { field message } }
      }`,
      { id: data.productId, moves: [{ id: data.mediaId, newPosition: "0" }] },
    );
    assertNoUserErrors(result.productReorderMedia.userErrors);
    await audit(ctx, "media_primary", data.productId, { mediaId: data.mediaId });
    return { ok: true };
  });

/* --------------------------------- users --------------------------------- */

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "users_manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: roles }, { data: authUsers }] = await Promise.all([
      supabaseAdmin
        .from("user_roles")
        .select("user_id, role, is_active, created_at, title, display_name, can_view_hpp, branch_id"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    ]);
    const emails = new Map(authUsers.users.map((u) => [u.id, u.email ?? ""]));
    return (roles ?? []).map((r) => ({
      userId: r.user_id,
      email: emails.get(r.user_id) ?? "(tidak diketahui)",
      role: r.role as AdminRole,
      isActive: r.is_active,
      createdAt: r.created_at,
      title: (r.title as string | null) ?? null,
      displayName: (r.display_name as string | null) ?? null,
      canViewHpp: !!r.can_view_hpp,
      branchId: (r.branch_id as string | null) ?? null,
    }));
  });

export const inviteAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; role: AdminRole; title?: string | null }) => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email ?? ""))
      throw new Error("Email tidak valid.");
    if (!["owner", "admin", "seller"].includes(input.role)) throw new Error("Peran tidak valid.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "users_manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email);
    if (error || !invited?.user) {
      throw new Error(`Gagal mengundang: ${error?.message ?? "tidak diketahui"}`);
    }
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({
        user_id: invited.user.id,
        role: data.role,
        is_active: true,
        title: data.role === "admin" ? (data.title ?? "admin") : null,
      });
    if (roleError) throw new Error(`Gagal menyimpan peran: ${roleError.message}`);
    await audit(ctx, "user_invite", null, { email: data.email, role: data.role });
    return { ok: true };
  });

export const setAdminUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      userId: string;
      role?: AdminRole;
      isActive?: boolean;
      title?: "general_manager" | "admin" | null;
      canViewHpp?: boolean;
      branchId?: string | null;
      displayName?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "users_manage");
    const touchesRole = data.role !== undefined || data.isActive !== undefined;
    if (data.userId === ctx.userId && touchesRole) {
      throw new Error("Tidak bisa mengubah peran atau status akun sendiri.");
    }
    const patch: TablesUpdate<"user_roles"> = { updated_at: new Date().toISOString() };
    if (data.role) patch.role = data.role;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (data.title !== undefined) patch.title = data.title;
    if (data.canViewHpp !== undefined) patch.can_view_hpp = data.canViewHpp;
    if (data.branchId !== undefined) patch.branch_id = data.branchId;
    if (data.displayName !== undefined) patch.display_name = data.displayName?.trim().slice(0, 80) || null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Penjaga owner terakhir ada di database (trigger user_roles_protect); pesan galatnya diteruskan apa adanya.
    const { error } = await supabaseAdmin.from("user_roles").update(patch).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    await audit(ctx, "user_role_update", null, { targetUser: data.userId, ...patch });
    return { ok: true };
  });

/* --------------------------- kode aktivasi staf --------------------------- */

// Owner membuat kode untuk SATU email + SATU peran (Manajer / Tim Produk). Kode tidak disimpan di mana pun;
// ia dihitung dari rahasia server STAFF_ACTIVATION_SECRET. Peran owner sengaja tidak bisa dibuat lewat kode.
export const generateStaffActivationCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { email: string; role: "admin" | "seller"; title?: "admin" | "general_manager" | null; validDays?: number }) => {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email ?? "")) throw new Error("Email tidak valid.");
      if (!["admin", "seller"].includes(input.role)) throw new Error("Peran tidak valid.");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "users_manage");
    const { expiryFromDays, grantFor, makeStaffCode, normalizeEmail } = await import("./staff-activation.server");
    const { STAFF_CODE_DEFAULT_DAYS, STAFF_CODE_MAX_DAYS } = await import("./staff-activation-format");
    const secret = process.env["STAFF_ACTIVATION_SECRET"];
    if (!secret || secret.length < 24) {
      throw new Error("Kode aktivasi staf belum aktif di server (rahasia STAFF_ACTIVATION_SECRET belum dipasang).");
    }
    const days = Math.min(Math.max(Math.round(data.validDays ?? STAFF_CODE_DEFAULT_DAYS), 1), STAFF_CODE_MAX_DAYS);
    const grant = grantFor(data.role, data.title);
    const email = normalizeEmail(data.email);
    const expiresOn = expiryFromDays(days);
    const code = makeStaffCode({ secret, email, grant, expiresOn });
    await audit(ctx, "staff_code_issue", null, { email, role: grant.role, title: grant.title, expiresOn });
    return { code, email, expiresOn, role: grant.role, title: grant.title };
  });

// Publik, dijaga ketat: butuh kode yang cocok dengan email + peran, belum kedaluwarsa, dan belum ada baris peran untuk email itu.
// Kata sandi dipilih sendiri oleh staf; owner/agen tidak pernah mengetahuinya. Alur lengkap + uji ada di staff-activation.server.ts.
export const activateStaffAccount = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; password: string; code: string; displayName?: string }) => {
    if (typeof input?.email !== "string" || typeof input?.password !== "string" || typeof input?.code !== "string" ||
        !input.email || !input.password || !input.code) {
      throw new Error("Email, kata sandi, dan kode aktivasi wajib diisi.");
    }
    if (input.displayName !== undefined && typeof input.displayName !== "string") throw new Error("Nama tampilan tidak valid.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) throw new Error("Email tidak valid.");
    if (input.password.length < 10) throw new Error("Kata sandi minimal 10 karakter.");
    if (input.code.length > 80 || input.email.length > 200 || input.password.length > 200) {
      throw new Error("Data terlalu panjang.");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const ip = bootstrapClientIp();
    const limitKey = `${ip}|${data.email.trim().toLowerCase()}`; // IP+email: ember "unknown" tidak memblokir semua orang
    if (bootstrapRateLimited(limitKey, staffAttempts)) {
      throw new Error("Terlalu banyak percobaan. Coba lagi dalam 15 menit.");
    }
    const { StaffActivationError, runStaffActivation } = await import("./staff-activation.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin.auth.admin;
    try {
      const result = await runStaffActivation(
        {
          async createUser(email, password) {
            const { data: created, error } = await admin.createUser({ email, password, email_confirm: true });
            if (created?.user) return { id: created.user.id };
            if (error?.code === "email_exists" || /already|registered|exists/i.test(error?.message ?? "")) return { exists: true as const };
            return { error: `${error?.status ?? ""} ${error?.code ?? error?.message ?? "tidak diketahui"}`.trim() };
          },
          async upsertRole(id, grant, displayName) {
            const { error } = await supabaseAdmin
              .from("user_roles")
              .upsert({ user_id: id, role: grant.role, title: grant.title, is_active: true, display_name: displayName });
            return error ? error.message : null;
          },
          async deleteUser(id) {
            const { error } = await admin.deleteUser(id);
            return error ? error.message : null;
          },
          async audit(id, grant) {
            const { error } = await supabaseAdmin.from("admin_audit_log").insert({
              user_id: id,
              action: "staff_activate",
              product_id: null,
              payload: { role: grant.role, title: grant.title } as never,
            });
            return error ? error.message : null;
          },
          log: (message) => console.error(`[staff-activation] ${message}`),
        },
        { secret: process.env["STAFF_ACTIVATION_SECRET"], email: data.email, password: data.password, code: data.code, displayName: data.displayName },
      );
      staffAttempts.delete(limitKey);
      return result;
    } catch (error) {
      if (error instanceof StaffActivationError) {
        if (error.kind === "code") recordBootstrapFailure(limitKey, staffAttempts);
        throw new Error(error.message);
      }
      console.error("[staff-activation] galat tak terduga", error instanceof Error ? error.message : "tidak diketahui");
      throw new Error("Aktivasi gagal. Coba lagi atau hubungi owner.");
    }
  });

/* ------------------------------ bootstrap ------------------------------- */

// In-process rate limiter: max 5 failed attempts per 15 minutes per IP.
const BOOTSTRAP_WINDOW_MS = 15 * 60 * 1000;
const BOOTSTRAP_MAX_FAILURES = 5;
const bootstrapAttempts = new Map<string, { count: number; firstAt: number }>();
const staffAttempts = new Map<string, { count: number; firstAt: number }>(); // terpisah dari bootstrap owner

function bootstrapClientIp(): string {
  try {
    const forwarded = getRequestHeader("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
    return getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-real-ip") ?? "unknown";
  } catch {
    return "unknown";
  }
}

function bootstrapRateLimited(ip: string, attempts = bootstrapAttempts): boolean {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > BOOTSTRAP_WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= BOOTSTRAP_MAX_FAILURES;
}

function recordBootstrapFailure(ip: string, attempts = bootstrapAttempts) {
  if (attempts.size > 2000) {
    for (const [key, value] of attempts) if (Date.now() - value.firstAt > BOOTSTRAP_WINDOW_MS) attempts.delete(key);
    if (attempts.size > 2000) attempts.clear();
  }
  const entry = attempts.get(ip);
  if (!entry || Date.now() - entry.firstAt > BOOTSTRAP_WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count += 1;
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal length to keep timing flat.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// Public endpoint, tightly guarded: requires the ADMIN_BOOTSTRAP_SECRET
// activation code, the configured owner email, and that no owner exists yet.
export const activateBootstrapOwner = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; password: string; code: string }) => {
    if (!input?.email || !input?.password || !input?.code) {
      throw new Error("Email, kata sandi, dan kode aktivasi wajib diisi.");
    }
    if (input.password.length < 10) throw new Error("Kata sandi minimal 10 karakter.");
    return input;
  })
  .handler(async ({ data }) => {
    const ip = bootstrapClientIp();
    if (bootstrapRateLimited(ip)) {
      throw new Error("Terlalu banyak percobaan. Coba lagi dalam 15 menit.");
    }

    const secret = process.env["ADMIN_BOOTSTRAP_SECRET"];
    if (!secret) {
      recordBootstrapFailure(ip);
      throw new Error("Aktivasi owner tidak tersedia.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "owner")
      .limit(1);
    if (existing && existing.length > 0) {
      throw new Error("Akun owner sudah aktif");
    }

    const bootstrap = process.env["ADMIN_BOOTSTRAP_EMAIL"]?.toLowerCase();
    const emailOk = !!bootstrap && bootstrap === data.email.trim().toLowerCase();
    const codeOk = constantTimeEqual(data.code.trim(), secret);
    if (!emailOk || !codeOk) {
      recordBootstrapFailure(ip);
      throw new Error("Email atau kode aktivasi tidak cocok.");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: bootstrap!,
      password: data.password,
      email_confirm: true,
    });
    if (error || !created?.user) {
      throw new Error(`Gagal membuat akun owner: ${error?.message ?? "tidak diketahui"}`);
    }
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: created.user.id, role: "owner", is_active: true });
    if (roleError) throw new Error(`Gagal menyimpan peran owner: ${roleError.message}`);
    bootstrapAttempts.delete(ip);
    return { ok: true };
  });
