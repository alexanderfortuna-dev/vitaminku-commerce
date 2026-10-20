// Bagian aman-untuk-browser dari fitur kode aktivasi staf (tanpa node:crypto).
export const STAFF_CODE_DEFAULT_DAYS = 14;
export const STAFF_CODE_MAX_DAYS = 30;

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "20261104" -> "4 November 2026". Masukan tak valid dikembalikan apa adanya. */
export function formatExpiryId(expiresOn: string): string {
  if (!/^\d{8}$/.test(expiresOn)) return expiresOn;
  const month = MONTHS[Number(expiresOn.slice(4, 6)) - 1];
  if (!month) return expiresOn;
  return `${Number(expiresOn.slice(6, 8))} ${month} ${expiresOn.slice(0, 4)}`;
}
