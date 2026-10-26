// Order access tokens created in this browser, so Vita can look up "my order".
// Stores only order number + unguessable token (no names, phones or addresses).
const KEY = "vitaminku-recent-orders";

export function rememberOrder(orderNumber: string, token: string) {
  try {
    const list = recentOrders().filter((o) => o.token !== token);
    list.unshift({ orderNumber, token });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10)));
  } catch {
    /* storage unavailable */
  }
}

export function clearRecentOrders(storage?: Pick<Storage, "removeItem">) {
  try {
    (storage ?? localStorage).removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

export function recentOrders(): Array<{ orderNumber: string; token: string }> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((o) => /^[a-f0-9]{48}$/.test(o?.token)) : [];
  } catch {
    return [];
  }
}
