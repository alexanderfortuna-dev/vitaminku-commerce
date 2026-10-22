import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatIDR } from "@/lib/format";
import { quoteCart } from "@/lib/checkout.functions";
import { PENDING_PROMO_EVENT, normalizePromoCode, readPendingPromo, writePendingPromo } from "@/lib/promo";

/**
 * Kode diskon di keranjang: harga tetap dihitung server (quoteCart); kode disimpan di perangkat agar
 * checkout memakainya otomatis. Pesan kesalahan menjelaskan alasannya.
 */
export function CartPromoBox({ lines }: { lines: Array<{ slug: string; quantity: number }> }) {
  const [input, setInput] = useState("");
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => {
      const pending = readPendingPromo();
      setInput(pending ?? "");
      setCode(pending);
    };
    sync();
    window.addEventListener(PENDING_PROMO_EVENT, sync); // tombol "Pakai" di spanduk promo
    return () => window.removeEventListener(PENDING_PROMO_EVENT, sync);
  }, []);
  const fetchQuote = useServerFn(quoteCart);
  const quote = useQuery({
    queryKey: ["cart-quote", lines, code],
    queryFn: () => fetchQuote({ data: { lines, promoCode: code } }),
    enabled: !!code && lines.length > 0,
  });
  const apply = () => {
    const c = normalizePromoCode(input);
    if (!c) return;
    setCode(c);
    writePendingPromo(c);
  };
  const clear = () => {
    setCode(null);
    setInput("");
    writePendingPromo(null);
  };
  const discount = quote.data?.discount ?? 0;
  const ok = !!code && !!quote.data && !quote.data.promoError && discount > 0;

  return (
    <div className="mt-4 px-4">
      <label className="text-sm font-semibold text-navy" htmlFor="kode-promo">
        Punya kode promo?
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="kode-promo"
          className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm uppercase outline-none focus:border-primary"
          value={input}
          maxLength={32}
          placeholder="Masukkan kode"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
        />
        {code ? (
          <button type="button" onClick={clear} className="min-h-11 shrink-0 rounded-full bg-secondary px-4 text-xs font-bold text-navy">
            Hapus
          </button>
        ) : (
          <button type="button" disabled={!input.trim()} onClick={apply} className="min-h-11 shrink-0 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50">
            Pakai
          </button>
        )}
      </div>
      {code && quote.isPending && <p className="mt-1 text-xs text-muted-foreground">Mengecek kode…</p>}
      {code && quote.data?.promoError && <p role="alert" className="mt-1 text-xs text-destructive">{quote.data.promoError}</p>}
      {code && quote.isError && <p role="alert" className="mt-1 text-xs text-destructive">Gagal mengecek kode. Coba lagi sebentar.</p>}
      {ok && (
        <p className="mt-1 text-xs font-semibold text-primary">
          {quote.data?.promoLabel} dipakai: hemat {formatIDR(discount)}. Kode ini otomatis dipakai saat checkout.
        </p>
      )}
    </div>
  );
}
