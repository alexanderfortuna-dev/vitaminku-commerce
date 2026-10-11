// Server-only Shopify Admin API access. The admin token never reaches the browser.
export const SHOPIFY_ADMIN_API_VERSION = "2026-07";

export class ShopifyAdminError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "ShopifyAdminError";
    this.status = status;
  }
}

function storeDomain(): string {
  return process.env["SHOPIFY_STORE_DOMAIN"] ?? "vitaminku-commerce-u8xhy-ja6xbxet.myshopify.com";
}

function adminToken(): string {
  const token =
    process.env["SHOPIFY_ADMIN_ACCESS_TOKEN"] ?? process.env["SHOPIFY_ACCESS_TOKEN"] ?? "";
  if (!token) {
    throw new ShopifyAdminError(
      "Koneksi Shopify Admin belum tersedia. Pemilik toko perlu menyambungkan Shopify di Integrations.",
      503,
    );
  }
  return token;
}

export async function adminGraphql<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(
    `https://${storeDomain()}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": adminToken(),
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  const text = await response.text();

  if (response.status === 401 || response.status === 403) {
    throw new ShopifyAdminError(
      "Akses Shopify Admin ditolak (token tidak valid atau kedaluwarsa). Pemilik toko perlu menyambungkan ulang Shopify di Integrations.",
      503,
    );
  }
  if (!response.ok) {
    throw new ShopifyAdminError(
      `Shopify Admin API error ${response.status}: ${text.slice(0, 300)}`,
    );
  }

  let payload: { data?: T; errors?: Array<{ message: string }> };
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    throw new ShopifyAdminError("Respons Shopify tidak dapat dibaca.");
  }
  if (payload.errors?.length) {
    throw new ShopifyAdminError(payload.errors.map((e) => e.message).join(", "), 400);
  }
  if (!payload.data) throw new ShopifyAdminError("Shopify tidak mengembalikan data.");
  return payload.data;
}

export type UserError = { field?: string[] | null; message: string };

export function assertNoUserErrors(errors: UserError[] | undefined | null) {
  if (errors && errors.length > 0) {
    throw new ShopifyAdminError(
      errors.map((e) => `${e.field?.join(".") ?? "Shopify"}: ${e.message}`).join(" | "),
      400,
    );
  }
}

export async function uploadStagedFile(
  url: string,
  parameters: Array<{ name: string; value: string }>,
  file: { name: string; type: string; base64: string },
) {
  const form = new FormData();
  for (const param of parameters) form.append(param.name, param.value);
  const binary = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  form.append("file", new Blob([binary], { type: file.type }), file.name);

  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    throw new ShopifyAdminError(`Upload gambar ke Shopify gagal (${res.status}).`);
  }
}
