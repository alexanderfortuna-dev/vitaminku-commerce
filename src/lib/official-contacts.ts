// Satu-satunya tempat nomor WhatsApp resmi toko (diberikan pemilik). Format wa.me: tanpa "+" dan spasi.
export const OFFICIAL_WHATSAPP_MAIN = "6281339950000"; // +62 813-3995-0000 (utama)
export const OFFICIAL_WHATSAPP_SECOND = "6282147739996"; // +62 821-4773-9996 (kedua)

export const OFFICIAL_WHATSAPPS = [
  { number: OFFICIAL_WHATSAPP_MAIN, label: "WhatsApp utama", display: "+62 813-3995-0000" },
  { number: OFFICIAL_WHATSAPP_SECOND, label: "WhatsApp kedua", display: "+62 821-4773-9996" },
] as const;

/** Tautan WhatsApp untuk menanyakan harga produk yang harganya belum ditetapkan (ke nomor utama). */
export function priceInquiryUrl(productName: string): string {
  const text = `Halo VitaminKu, berapa harga "${productName}"? Terima kasih.`;
  return `https://wa.me/${OFFICIAL_WHATSAPP_MAIN}?text=${encodeURIComponent(text)}`;
}
