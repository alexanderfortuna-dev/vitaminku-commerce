/**
 * Delivery provider adapter boundary.
 *
 * INACTIVE SCAFFOLD — every third-party provider below is disabled because no
 * merchant credentials or verified API availability exist for this store. The
 * storefront must never offer a selectable paid courier, quote a fee, or show a
 * tracking link that is not backed by real data.
 *
 * Shipping rates the customer actually sees today come from Shopify's own
 * checkout (standard shipping configured in the Shopify admin). Nothing here
 * overrides that.
 */

export type DeliveryProviderId = "shopify_standard" | "gosend" | "grab_express" | "maxim";

export interface DeliveryProviderAdapter {
  id: DeliveryProviderId;
  /** Customer-facing name; only shown when enabled is true. */
  label: string;
  /** True only when credentials AND official merchant API access are verified. */
  enabled: boolean;
  /** Exact secret name(s) the owner must configure to activate this adapter. */
  requiredSecrets: string[];
  /** Short, honest note for internal docs — not customer copy. */
  activationNote: string;
}

export const DELIVERY_PROVIDERS: DeliveryProviderAdapter[] = [
  {
    id: "shopify_standard",
    label: "Pengiriman standar",
    enabled: true,
    requiredSecrets: [],
    activationNote:
      "Handled entirely by Shopify checkout using the shipping rates configured in the Shopify admin.",
  },
  {
    id: "gosend",
    label: "GoSend",
    enabled: false,
    requiredSecrets: ["GOSEND_CLIENT_ID", "GOSEND_PASS_KEY"],
    activationNote:
      "Requires an approved Gojek/GoSend merchant API account. Not verified for this store.",
  },
  {
    id: "grab_express",
    label: "GrabExpress",
    enabled: false,
    requiredSecrets: ["GRAB_CLIENT_ID", "GRAB_CLIENT_SECRET"],
    activationNote:
      "Requires an approved GrabExpress partner account. Not verified for this store.",
  },
  {
    id: "maxim",
    label: "Maxim",
    enabled: false,
    requiredSecrets: ["MAXIM_API_KEY"],
    activationNote:
      "No official public merchant delivery API confirmed for this store. Not verified.",
  },
];

export function enabledDeliveryProviders(): DeliveryProviderAdapter[] {
  return DELIVERY_PROVIDERS.filter((p) => p.enabled);
}
