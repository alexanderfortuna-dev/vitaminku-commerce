import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Crosshair, Loader2, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { formatIDR } from "@/lib/format";
import {
  createOrder,
  getCheckoutModes,
  getShippingRates,
  quoteCart,
  searchShippingAreas,
} from "@/lib/checkout.functions";
import { useCartStore } from "@/stores/cartStore";
import { rememberOrder } from "@/lib/recent-orders";
import { getPublicStore } from "@/lib/store.functions";
import { nearestBranch, haversineKm } from "@/lib/geo";
import { readReferral, readBranchCode, clearBranchCode, matchBranchByCode } from "@/lib/referral";
import { getMyCustomer } from "@/lib/customer.functions";
import { MANUAL_SHIPPING_LABEL, buildFallbackWhatsappUrl } from "@/lib/whatsapp-order";
import { OFFICIAL_WHATSAPP_MAIN } from "@/lib/official-contacts";
import { reportClientError } from "@/lib/client-error-report";

import { clearSavedDetails, loadSavedDetails, saveDetails } from "@/lib/checkout-details";
import { readPendingPromo, writePendingPromo } from "@/lib/promo";

export const Route = createFileRoute("/checkout")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Checkout — VitaminKu" },
      { name: "description", content: "Pesan lewat WhatsApp: isi nama, nomor, dan alamat. Tanpa akun." },
      { property: "og:title", content: "Checkout — VitaminKu" },
      { property: "og:description", content: "Checkout cepat tanpa akun di VitaminKu." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutPage,
});

interface Area {
  id: string;
  label: string;
  province: string;
  city: string;
  district: string;
  postal_code: string;
}
interface Rate {
  company: string;
  service: string;
  label: string;
  price: number;
  etd: string;
}

const STEPS = ["Alamat", "Pengiriman", "Pembayaran"] as const;
const input =
  "mt-1 w-full rounded-xl border border-border bg-card px-3 py-3 text-sm outline-none focus:border-primary";

function CheckoutPage() {
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);
  const navigate = useNavigate();
  const lines = useMemo(() => items.map((i) => ({ slug: i.slug, quantity: i.quantity })), [items]);

  const fetchModes = useServerFn(getCheckoutModes);
  const fetchQuote = useServerFn(quoteCart);
  const fetchAreas = useServerFn(searchShippingAreas);
  const fetchRates = useServerFn(getShippingRates);
  const submitOrder = useServerFn(createOrder);
  // Satu kunci per isi pesanan: ketuk dua kali / kirim ulang setelah jaringan putus = tetap satu pesanan.
  const idemRef = useRef<{ fp: string; key: string } | null>(null);

  const modes = useQuery({ queryKey: ["checkout-modes"], queryFn: () => fetchModes() });
  const fetchStore = useServerFn(getPublicStore);
  const store = useQuery({ queryKey: ["public-store"], queryFn: () => fetchStore(), staleTime: 60_000 });
  const branches = store.data?.branches ?? [];
  const [branchId, setBranchId] = useState<string | null>(null);
  const activeBranchId = (branchId && branches.some((b) => b.id === branchId) ? branchId : null) ?? branches[0]?.id ?? null;
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const quote = useQuery({
    queryKey: ["checkout-quote", lines, promoCode],
    queryFn: () => fetchQuote({ data: { lines, promoCode } }),
    enabled: lines.length > 0,
  });
  const fetchMine = useServerFn(getMyCustomer);
  const mine = useQuery({ queryKey: ["my-customer"], queryFn: () => fetchMine(), staleTime: 60_000, retry: false });
  function pickBranch(id: string) {
    clearBranchCode(); // pilihan eksplisit pelanggan menang atas tautan ?cabang
    setBranchId(id);
  }
  function useMyLocation() {
    if (!("geolocation" in navigator)) { toast.error("Browser tidak mendukung lokasi. Pilih cabang manual."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setHere(p);
        const n = nearestBranch(branches, p);
        if (n) pickBranch(n.branch.id);
        else toast("Belum ada cabang dengan titik lokasi. Pilih cabang manual.");
      },
      () => {
        setLocating(false);
        toast.error("Lokasi tidak diizinkan. Pilih cabang manual.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [address, setAddress] = useState("");
  const [areaQuery, setAreaQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [pickedArea, setArea] = useState<Area | null>(null);
  const [rate, setRate] = useState<Rate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitRef = useRef(false);

  const [fromSaved, setFromSaved] = useState(false);
  useEffect(() => {
    // Data pesanan terakhir terisi otomatis (nol ketukan); pelanggan bisa menghapusnya kapan saja.
    const d = loadSavedDetails();
    if (d.name) setName(d.name);
    if (d.whatsapp) setWhatsapp(d.whatsapp);
    if (d.address) setAddress(d.address);
    if (d.branchId) setBranchId(d.branchId);
    setFromSaved(!!(d.name || d.whatsapp || d.address));
    // Kode promo yang dipilih di keranjang/spanduk dipakai otomatis.
    const pending = readPendingPromo();
    if (pending) {
      setPromoInput(pending);
      setPromoCode(pending);
    }
  }, []);
  function forgetMe() {
    clearSavedDetails();
    setName("");
    setWhatsapp("");
    setAddress("");
    setFromSaved(false);
    toast.success("Data Anda di perangkat ini sudah dihapus.");
  }

  // Tautan ?cabang=KODE: pilih-awal cabang (sekali, setelah daftar cabang termuat). Tidak memakai lokasi.
  const linkApplied = useRef(false);
  useEffect(() => {
    if (linkApplied.current || branches.length === 0) return;
    linkApplied.current = true;
    const b = matchBranchByCode(branches, readBranchCode());
    if (b) setBranchId(b.id);
  }, [branches]);

  // Pembeli login yang sudah punya data: isi otomatis hanya kolom yang masih kosong.
  const prefilled = useRef(false);
  useEffect(() => {
    const m = mine.data;
    if (!m || prefilled.current) return;
    prefilled.current = true;
    setName((v) => v || m.name);
    setWhatsapp((v) => v || m.whatsapp);
    setAddress((v) => v || (m.address ?? ""));
  }, [mine.data]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(areaQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [areaQuery]);

  const isManual = modes.data?.ok === true && modes.data.shipping === "manual";
  const hasMidtrans = modes.data?.ok === true && modes.data.payment === "midtrans";
  // Manual shipping: the branch confirms the address/ongkir via WhatsApp, so no area is needed.
  const area: Area | null = isManual ? null : pickedArea;

  const areas = useQuery({
    queryKey: ["areas", debounced],
    queryFn: () => fetchAreas({ data: { q: debounced } }),
    enabled: debounced.length >= 3 && !area && modes.data?.ok === true && !isManual,
  });
  const rates = useQuery({
    queryKey: ["rates", area?.id, area?.postal_code, lines],
    queryFn: () => fetchRates({ data: { lines, area: area! } }),
    enabled: step >= 1 && !!area,
    retry: false,
  });
  useEffect(() => {
    if (isManual && !rate) setRate({ company: "manual", service: "admin", label: MANUAL_SHIPPING_LABEL, price: 0, etd: "" });
  }, [isManual, rate]);
  useEffect(() => {
    const only = rates.data?.mode === "manual" ? rates.data.rates[0] : undefined;
    if (only && !rate) setRate(only);
  }, [rates.data, rate]);

  if (items.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-base font-bold">Keranjangmu kosong</p>
        <Link to="/" className="mt-4 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">
          Mulai Belanja
        </Link>
      </div>
    );
  }

  const subtotal = quote.data?.subtotal ?? 0;
  const discount = quote.data?.discount ?? 0;
  const rejected = quote.data?.rejected ?? [];
  const errors = {
    name: name.trim().length >= 2 ? null : "Isi nama penerima (min. 2 huruf).",
    whatsapp: /^(\+?62|0)?8\d{7,12}$/.test(whatsapp.replace(/[\s-]/g, "")) ? null : "Nomor WhatsApp belum benar. Contoh: 0812 3456 7890.",
    address: address.trim().length >= 10 ? null : "Tulis alamat lengkap (min. 10 huruf): jalan, nomor, patokan.",
  };
  const contactValid = !errors.name && !errors.whatsapp && !errors.address;
  const addressValid = contactValid && (isManual || !!area);
  const showErr = (k: keyof typeof errors) => (touched && errors[k] ? <span className="mt-1 block text-xs font-normal text-destructive">{errors[k]}</span> : null);
  async function pay(method: "midtrans" | "whatsapp") {
    if (isManual && !contactValid) return setTouched(true);
    if ((!isManual && !area) || !rate || submitRef.current) return;
    submitRef.current = true;
    setSubmitting(true);
    // Open the WhatsApp tab during the tap so pop-up blockers allow it.
    const waTab = method === "whatsapp" ? window.open("", "_blank") : null;
    const fp = JSON.stringify([lines, name, whatsapp, address, activeBranchId, method, quote.data?.promoCode ?? null]);
    if (idemRef.current?.fp !== fp) idemRef.current = { fp, key: `${crypto.randomUUID()}-${Date.now().toString(36)}` };
    try {
      const res = await submitOrder({
        data: {
          idempotencyKey: idemRef.current.key,
          lines,
          customer: { name, whatsapp, address, note: note.trim() || null },
          area: area ? { id: area.id, province: area.province, city: area.city, district: area.district, postal_code: area.postal_code } : null,
          promoCode: quote.data?.promoCode ?? null,
          referralCode: readReferral(),
          courier: { company: rate.company, service: rate.service },
          method,
          branchId: activeBranchId,
          marketingOptIn: optIn,
        },
      });
      saveDetails({ name, whatsapp, address, branchId: activeBranchId });
      writePendingPromo(null);
      clearCart();
      rememberOrder(res.orderNumber, res.accessToken);
      if (method === "midtrans" && res.paymentUrl) window.location.assign(res.paymentUrl);
      else {
        if (waTab) waTab.location.href = res.waUrl;
        void navigate({ to: "/pesanan/$token", params: { token: res.accessToken } });
      }
    } catch (e) {
      reportClientError(e, "error");
      if (method === "whatsapp" && quote.data && quote.data.lines.length > 0) {
        // Pencatatan gagal: jangan kehilangan pelanggan. Tetap buka WhatsApp cabang dengan pesan yang bisa dicatat staf.
        const b = branches.find((x) => x.id === activeBranchId);
        const url = buildFallbackWhatsappUrl(b?.whatsapp ?? OFFICIAL_WHATSAPP_MAIN, {
          items: quote.data.lines.map((l) => ({ name: l.name, quantity: l.quantity, unit_price: l.unitPrice })),
          subtotal: quote.data.subtotal - quote.data.discount,
          customer_name: name,
          whatsapp,
          address,
          branch_name: b?.name ?? null,
          note: note.trim() || null,
        });
        if (waTab) waTab.location.href = url;
        else window.open(url, "_blank");
        toast.error("Pesanan belum tercatat otomatis. Kami buka WhatsApp agar admin mencatatnya.");
      } else {
        waTab?.close();
        toast.error(e instanceof Error ? e.message : "Pesanan gagal dibuat");
      }
      submitRef.current = false;
      setSubmitting(false);
    }
  }

  function renderConsent() {
    return (
      <div className="space-y-2 text-xs text-muted-foreground">
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="h-5 w-5 shrink-0 accent-primary" />
          <span>Kirimi saya info promo lewat WhatsApp (opsional)</span>
        </label>
        <p>
          Dengan memesan, Anda menyetujui{" "}
          <a href="/syarat" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">Syarat &amp; Ketentuan</a>{" "}
          dan{" "}
          <a href="/privasi" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">Kebijakan Privasi</a>.
        </p>
      </div>
    );
  }

  function renderSummary() {
    return (
      <div className="space-y-2">
        <ul className="space-y-1 rounded-xl border border-border bg-card p-3 text-sm">
          {quote.data?.lines.map((l) => (
            <li key={l.slug} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{l.quantity}× {l.name}</span>
              <span className="shrink-0 font-semibold">{formatIDR(l.lineTotal)}</span>
            </li>
          ))}
          <li className="flex justify-between border-t border-border pt-1 text-muted-foreground">
            <span>Subtotal</span><span>{formatIDR(subtotal)}</span>
          </li>
          {discount > 0 && (
            <li className="flex justify-between text-primary">
              <span>Diskon ({quote.data?.promoCode})</span><span>-{formatIDR(discount)}</span>
            </li>
          )}
          <li className="flex justify-between text-muted-foreground">
            <span>Ongkir{!isManual && rate ? ` (${rate.label})` : ""}</span>
            <span>{isManual ? "dikonfirmasi cabang" : formatIDR(rate?.price ?? 0)}</span>
          </li>
          <li className="flex justify-between border-t border-border pt-1 font-extrabold text-navy">
            <span>Total{isManual ? " (+ ongkir)" : ""}</span>
            <span>{formatIDR(subtotal - discount + (isManual ? 0 : (rate?.price ?? 0)))}</span>
          </li>
        </ul>
        <div className="text-sm font-semibold text-navy">
          Kode diskon
          <div className="mt-1 flex gap-2">
            <input className={`${input} mt-0 font-normal uppercase`} value={promoInput} maxLength={32}
              onChange={(e) => setPromoInput(e.target.value)} placeholder="Opsional" />
            {promoCode ? (
              <button type="button" onClick={() => { setPromoCode(null); setPromoInput(""); writePendingPromo(null); }} className="min-h-11 shrink-0 rounded-full bg-secondary px-4 text-xs font-bold text-navy">Hapus</button>
            ) : (
              <button type="button" disabled={!promoInput.trim()} onClick={() => { setPromoCode(promoInput.trim()); writePendingPromo(promoInput.trim()); }} className="min-h-11 shrink-0 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50">Pakai</button>
            )}
          </div>
          {promoCode && quote.data?.promoError && <span className="mt-1 block text-xs font-normal text-destructive">{quote.data.promoError}</span>}
          {quote.data?.promoLabel && <span className="mt-1 block text-xs font-normal text-primary">{quote.data.promoLabel} dipakai.</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-44">
      <div className="flex items-center gap-2 px-4 py-4">
        <button
          type="button"
          aria-label="Kembali"
          onClick={() => (step === 0 ? navigate({ to: "/keranjang" }) : setStep(step - 1))}
          className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-navy"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h1 className="text-lg font-extrabold">Checkout</h1>
      </div>

      {!isManual && <ol className="mx-4 grid grid-cols-3 gap-2 text-center text-[11px] font-bold">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`rounded-full px-2 py-1.5 ${i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary-soft text-accent-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>}

      {modes.data && !modes.data.ok && (
        <p role="alert" className="mx-4 mt-3 text-sm text-destructive">{modes.data.error}</p>
      )}
      {rejected.length > 0 && (
        <p role="alert" className="mx-4 mt-3 rounded-xl bg-secondary px-3 py-2 text-xs text-navy">
          Ada produk yang tidak bisa dibeli (stok/harga berubah). Periksa keranjang dulu.
        </p>
      )}

      {step === 0 && (
        <section className="space-y-3 px-4 pt-4">
          {fromSaved && (
            <p className="flex items-center justify-between gap-2 rounded-xl bg-primary-soft px-3 py-2 text-xs text-accent-foreground">
              <span>Data pesanan terakhir terisi otomatis. Cukup periksa, lalu kirim.</span>
              <button type="button" onClick={forgetMe} className="min-h-11 shrink-0 font-bold underline">
                Hapus data saya
              </button>
            </p>
          )}
          <label className="block text-sm font-semibold text-navy">
            Nama penerima
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)} autoComplete="name" />
            {showErr("name")}
          </label>
          <label className="block text-sm font-semibold text-navy">
            Nomor WhatsApp
            <input
              className={input}
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="08xxxxxxxxxx"
              onBlur={() => setTouched(true)}
            />
            {showErr("whatsapp")}
          </label>
          <label className="block text-sm font-semibold text-navy">
            Alamat lengkap
            <textarea
              className={`${input} min-h-20`}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoComplete="street-address"
              placeholder="Nama jalan, nomor rumah, RT/RW, kecamatan, kota, patokan"
              onBlur={() => setTouched(true)}
            />
            {showErr("address")}
          </label>
          {branches.length > 0 && (
            <label className="block text-sm font-semibold text-navy">
              Dekat dengan Anda? Pilih cabang
              <select
                className={`${input} font-normal`}
                value={activeBranchId ?? ""}
                onChange={(e) => pickBranch(e.target.value)}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}{b.area ? ` — ${b.area}` : ""}
                    {here && b.lat != null && b.lng != null ? ` · ±${haversineKm(here, { lat: b.lat, lng: b.lng }).toFixed(1)} km` : ""}
                  </option>
                ))}
              </select>
              {here && <span className="mt-1 block text-xs font-normal text-muted-foreground">Jarak = perkiraan jarak garis lurus, bukan rute.</span>}
              <span className="mt-1 block text-xs font-normal text-muted-foreground">Pesananmu dikirim ke WhatsApp cabang ini.</span>
            </label>
          )}
          {branches.length > 1 && (
            <button type="button" onClick={useMyLocation} disabled={locating}
              className="flex min-h-11 items-center gap-2 rounded-full bg-secondary px-4 text-xs font-bold text-navy disabled:opacity-50">
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} Gunakan lokasi saya
            </button>
          )}
          <label className="block text-sm font-semibold text-navy">
            Catatan (opsional)
            <input className={`${input} font-normal`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="mis. kirim sore, titip satpam" />
          </label>
          {isManual && renderSummary()}
          {isManual && renderConsent()}
          {!isManual && <div className="text-sm font-semibold text-navy">
            Kecamatan / Kota / Kode pos
            {area ? (
              <div className="mt-1 flex items-start gap-2 rounded-xl border border-primary bg-card px-3 py-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 text-sm font-normal">
                  {area.district}, {area.city}, {area.province} {area.postal_code}
                </span>
                <button type="button" onClick={() => { setArea(null); setRate(null); }} className="text-xs font-bold text-primary">
                  Ubah
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 mt-0.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    className={`${input} pl-9 font-normal`}
                    value={areaQuery}
                    onChange={(e) => setAreaQuery(e.target.value)}
                    placeholder="Ketik kecamatan, kota, atau kode pos"
                  />
                </div>
                {areas.isFetching && <p className="mt-2 text-xs font-normal text-muted-foreground">Mencari…</p>}
                {areas.isError && <p className="mt-2 text-xs font-normal text-destructive">{(areas.error as Error).message}</p>}
                {areas.data && (
                  <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {areas.data.areas.length === 0 && (
                      <li className="px-3 py-3 text-xs font-normal text-muted-foreground">Tidak ditemukan.</li>
                    )}
                    {areas.data.areas.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => { setArea(a); setRate(null); }}
                          className="w-full px-3 py-3 text-left text-sm font-normal"
                        >
                          {a.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>}
        </section>
      )}

      {step === 1 && (
        <section className="space-y-2 px-4 pt-4">
          <p className="text-sm font-bold text-navy">Pilih pengiriman</p>
          {rates.isPending && <p className="text-sm text-muted-foreground">Menghitung ongkir…</p>}
          {rates.isError && <p className="text-sm text-destructive">{(rates.error as Error).message}</p>}
          {rates.data?.rates.length === 0 && <p className="text-sm text-muted-foreground">Belum ada kurir ke alamat ini.</p>}
          {rates.data?.rates.map((r) => {
            const active = rate?.company === r.company && rate?.service === r.service;
            return (
              <button
                key={`${r.company}-${r.service}`}
                type="button"
                onClick={() => setRate(r)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left ${active ? "border-primary bg-primary-soft" : "border-border bg-card"}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-navy">{r.label}</span>
                  {r.etd && <span className="block text-xs text-muted-foreground">Estimasi {r.etd}</span>}
                </span>
                <span className="shrink-0 text-sm font-bold text-navy">{isManual ? "via WhatsApp" : formatIDR(r.price)}</span>
              </button>
            );
          })}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3 px-4 pt-4">
          {renderSummary()}
          {renderConsent()}
          <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
            <p className="text-sm font-bold text-navy">Metode pembayaran</p>
            {hasMidtrans ? (
              <>
                <p className="mt-1">QRIS (semua e-wallet & m-banking) · GoPay · ShopeePay · Virtual Account BCA/BNI/BRI/Mandiri/Permata</p>
                <p className="mt-1">Dipilih di halaman pembayaran Midtrans yang aman. Atau pesan lewat WhatsApp.</p>
              </>
            ) : (
              <p className="mt-1">
                Pesananmu dikirim ke admin VitaminKu lewat WhatsApp. Admin akan mengonfirmasi stok{isManual ? ", ongkir" : ""} dan cara pembayaran.
              </p>
            )}
          </div>
        </section>
      )}

      <div className="above-bottom-nav fixed inset-x-0 z-40 border-t border-border bg-card px-4 pb-3 pt-3">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{isManual ? "Total (+ ongkir dikonfirmasi cabang)" : step === 2 ? "Total" : "Subtotal"}</span>
            <span className="text-base font-extrabold text-navy">
              {quote.isPending ? "…" : formatIDR(subtotal - discount + (step === 2 && !isManual ? (rate?.price ?? 0) : 0))}
            </span>
          </div>
          {step === 0 && !isManual && (
            <button
              type="button"
              disabled={!addressValid || rejected.length > 0}
              onClick={() => setStep(1)}
              className="mt-2 w-full rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              Lanjut ke Pengiriman
            </button>
          )}
          {step === 1 && (
            <button
              type="button"
              disabled={!rate}
              onClick={() => setStep(2)}
              className="mt-2 w-full rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              Lanjut ke Pembayaran
            </button>
          )}
          {(step === 2 || isManual) && (
            <>
              {hasMidtrans && (
                <button
                  type="button"
                  disabled={submitting || !rate || rejected.length > 0}
                  onClick={() => void pay("midtrans")}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Membuat pesanan…" : "Bayar Sekarang"}
                </button>
              )}
              <button
                type="button"
                disabled={submitting || !rate || rejected.length > 0 || !modes.data?.ok}
                onClick={() => void pay("whatsapp")}
                className={`mt-2 flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold disabled:opacity-50 ${hasMidtrans ? "border border-primary text-primary" : "bg-primary text-primary-foreground"}`}
              >
                {submitting && !hasMidtrans && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting && !hasMidtrans ? "Membuat pesanan…" : "Pesan via WhatsApp"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
