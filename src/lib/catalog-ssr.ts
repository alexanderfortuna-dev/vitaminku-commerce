// Prefetch katalog untuk HTML server. Galat tidak menggagalkan halaman: cache menyimpan error
// dan komponen yang sudah ada menampilkan "Coba lagi".
import type { QueryClient } from "@tanstack/react-query";
import {
  brandsQueryOptions,
  productsInfiniteQueryOptions,
  productsQueryOptions,
} from "./catalog-db";

async function settle(work: Promise<unknown>) {
  try {
    await work;
  } catch {
    // Query sudah berstatus error. Jangan lempar: halaman tetap dirender.
  }
}

export const HOME_NEWEST = { sort: "newest" as const, limit: 10, purchasableOnly: true };
export const HOME_BROWSE = { sort: "name" as const, limit: 10, purchasableOnly: true };
export const HOME_HERO = { heroOnly: true, purchasableOnly: true, limit: 10 };

export async function prefetchHomeCatalog(queryClient: QueryClient) {
  await Promise.all([
    settle(queryClient.ensureQueryData({ ...productsQueryOptions(HOME_NEWEST), retry: false })),
    settle(queryClient.ensureQueryData({ ...productsQueryOptions(HOME_BROWSE), retry: false })),
    settle(queryClient.ensureQueryData({ ...productsQueryOptions(HOME_HERO), retry: false })),
    settle(queryClient.ensureQueryData({ ...brandsQueryOptions(), retry: false })),
  ]);
}

export async function prefetchFirstPage(
  queryClient: QueryClient,
  input: Parameters<typeof productsInfiniteQueryOptions>[0],
) {
  await settle(queryClient.ensureInfiniteQueryData({ ...productsInfiniteQueryOptions(input), retry: false }));
}
