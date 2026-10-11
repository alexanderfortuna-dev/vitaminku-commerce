// Pure geo helpers for branch distance (straight-line estimate only).

export function validLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Extracts coordinates from common Google Maps link forms; null when none found. */
export function parseMapsUrl(raw: string): { lat: number; lng: number } | null {
  const s = decodeURIComponent(raw.trim());
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // place data
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // /@lat,lng,zoom
    /[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/, // bare "lat,lng"
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (validLatLng(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Nearest branch that has coordinates; branches without coordinates are never picked. */
export function nearestBranch<T extends { id: string; lat: number | null; lng: number | null }>(
  branches: T[],
  here: { lat: number; lng: number },
): { branch: T; km: number } | null {
  let best: { branch: T; km: number } | null = null;
  for (const b of branches) {
    if (b.lat == null || b.lng == null || !validLatLng(b.lat, b.lng)) continue;
    const km = haversineKm(here, { lat: b.lat, lng: b.lng });
    if (!best || km < best.km) best = { branch: b, km };
  }
  return best;
}
