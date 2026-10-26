import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, MessageCircle, RotateCcw, X } from "lucide-react";
import { AddToCartButton } from "@/components/AddToCartButton";
import { ProductThumb } from "@/components/ProductThumb";
import type { DbProduct } from "@/lib/catalog-db";
import { formatIDR } from "@/lib/format";
import { recentOrders } from "@/lib/recent-orders";
import { VITA_MAX_CHARS, vitaWhatsappUrl } from "@/lib/vita-safety";
import {
  askFinder,
  getFinderSessionId,
  resolveFinderUrl,
  sendFinderChosen,
  type FinderCard,
} from "@/lib/vitamin-finder-client";
import { FinderCards } from "./FinderCards";
import { VitaMascot } from "./VitaMascot";

// Jalur baru: Edge Function vitamin-finder (aktif bila URL tersedia). Jalur lama /api/vita-chat tetap ada.
const FINDER_URL = resolveFinderUrl({
  finderUrl: import.meta.env["VITE_VITAMIN_FINDER_URL"] as string | undefined,
  supabaseUrl: import.meta.env["VITE_SUPABASE_URL"] as string | undefined,
});
const FINDER_KEY = (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) ?? "";

interface FinderMsg {
  id: number;
  role: "user" | "assistant";
  text: string;
  products?: FinderCard[];
  needsHuman?: boolean;
  quickReplies?: string[];
  queryHash?: string | null;
}

const CHIPS = ["Cari protein", "Vitamin daya tahan", "Rekomendasi untuk tidur", "Cek pesanan saya"];

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu pembayaran",
  menunggu_konfirmasi: "Menunggu konfirmasi admin",
  paid: "Dibayar",
  expired: "Kedaluwarsa",
  cancelled: "Dibatalkan",
};

/** Height of the visible area, so the input stays above the phone keyboard. */
function useVisualViewport() {
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null);
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    const update = () => setVv({ h: v.height, top: v.offsetTop });
    update();
    v.addEventListener("resize", update);
    v.addEventListener("scroll", update);
    return () => {
      v.removeEventListener("resize", update);
      v.removeEventListener("scroll", update);
    };
  }, []);
  return vv;
}

function useIsDesktop() {
  const [d, setD] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 768px)");
    const on = () => setD(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return d;
}

function RichText({ text }: { text: string }) {
  // Minimal **bold** support; everything else is plain text.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>,
      )}
    </p>
  );
}

function ProductCards({ products, onNavigate }: { products: DbProduct[]; onNavigate: () => void }) {
  if (!products.length) return null;
  return (
    <div className="mt-2 grid gap-2">
      {products.map((p) => (
        <div key={p.id} className="flex gap-3 rounded-2xl border border-border bg-card p-2">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl">
            <ProductThumb product={p} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">{p.brand}</p>
            <p className="line-clamp-2 text-sm font-semibold leading-tight text-navy">{p.name}</p>
            <p className="mt-0.5 text-sm font-extrabold text-navy">{formatIDR(p.price ?? 0)}</p>
            <div className="mt-auto flex gap-2 pt-1">
              <AddToCartButton product={p} className="flex-1" />
              <Link
                to="/produk/$handle"
                params={{ handle: p.slug ?? p.id }}
                onClick={onNavigate}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-primary px-3 py-2 text-xs font-bold text-primary"
              >
                Lihat
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function WaButton({ url, label = "Chat admin via WhatsApp" }: { url: string; label?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
    >
      <MessageCircle className="h-4 w-4" /> {label}
    </a>
  );
}

function MessageView({ m, onNavigate }: { m: UIMessage; onNavigate: () => void }) {
  if (m.role === "user") {
    const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-navy px-3.5 py-2 text-sm text-navy-foreground">
        <RichText text={text} />
      </div>
    );
  }
  return (
    <div className="max-w-[95%] text-sm text-foreground">
      {m.parts.map((part, i) => {
        if (part.type === "text") return <RichText key={i} text={part.text} />;
        if (part.type === "tool-search_products" && part.state === "output-available") {
          const out = part.output as { products?: DbProduct[] };
          return <ProductCards key={i} products={out.products ?? []} onNavigate={onNavigate} />;
        }
        if (part.type === "tool-handoff_whatsapp" && part.state === "output-available") {
          return <WaButton key={i} url={(part.output as { url: string }).url} />;
        }
        if (part.type === "tool-check_order" && part.state === "output-available") {
          const o = part.output as { found: boolean; order_number?: string; status?: string; total?: number; order_url?: string };
          if (!o.found) return null;
          return (
            <div key={i} className="mt-2 rounded-2xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Pesanan {o.order_number}</p>
              <p className="font-bold text-navy">{STATUS_LABEL[o.status ?? ""] ?? o.status}</p>
              {o.total != null && <p className="text-sm">Total {formatIDR(o.total)}</p>}
              {o.order_url && (
                <a href={o.order_url} onClick={onNavigate} className="mt-1 inline-block text-xs font-bold text-primary">
                  Lihat detail pesanan
                </a>
              )}
            </div>
          );
        }
        if (part.type.startsWith("tool-") && "state" in part && part.state !== "output-available" && part.state !== "output-error") {
          return (
            <p key={i} className="text-xs italic text-muted-foreground">
              Vita sedang mengecek katalog…
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}

export default function VitaChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [finderMsgs, setFinderMsgs] = useState<FinderMsg[]>([]);
  const [finderBusy, setFinderBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const vv = useVisualViewport();
  const desktop = useIsDesktop();

  const { messages, sendMessage, status, setMessages, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/vita-chat",
      body: () => ({ orderTokens: recentOrders().map((o) => o.token) }),
    }),
    onError: (e) => {
      let msg = "Koneksi terputus. Coba lagi.";
      try {
        const parsed = JSON.parse(e.message) as { error?: string };
        if (parsed.error) msg = parsed.error;
      } catch {
        /* not JSON */
      }
      setError(msg);
    },
  });
  const busy = status === "submitted" || status === "streaming" || finderBusy;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, status]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status, finderMsgs, finderBusy]);
  useEffect(() => {
    if (!open || desktop) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, desktop]);

  const send = (text: string) => {
    const t = text.trim().slice(0, VITA_MAX_CHARS);
    if (!t || busy) return;
    setError(null);
    setInput("");
    if (!FINDER_URL) {
      void sendMessage({ text: t });
      return;
    }
    const history = finderMsgs.slice(-10).map((m) => ({ role: m.role, content: m.text }));
    const id = Date.now();
    setFinderMsgs((prev) => [...prev, { id, role: "user", text: t }]);
    setFinderBusy(true);
    void askFinder({ url: FINDER_URL, apiKey: FINDER_KEY, sessionId: getFinderSessionId(), message: t, history }).then((r) => {
      setFinderMsgs((prev) => [
        ...prev,
        { id: id + 1, role: "assistant", text: r.reply, products: r.products, needsHuman: r.needsHuman, quickReplies: r.quickReplies, queryHash: r.queryHash },
      ]);
      setFinderBusy(false);
    });
  };

  const summary =
    [
      ...messages.filter((m) => m.role === "user").map((m) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")),
      ...finderMsgs.filter((m) => m.role === "user").map((m) => m.text),
    ]
      .slice(-3)
      .join(" / ") || "Butuh bantuan memilih produk";

  const mobileStyle = vv ? { height: vv.h, top: vv.top } : { height: "100dvh", top: 0 };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vita, asisten VitaminKu"
      hidden={!open}
      className={`fixed z-[60] ${open ? "flex" : "hidden"} flex-col bg-background md:bottom-4 md:right-4 md:top-auto md:h-[70vh] md:w-[420px] md:overflow-hidden md:rounded-3xl md:border md:border-border inset-x-0 md:left-auto`}
      style={desktop ? { boxShadow: "var(--shadow-card)" } : mobileStyle}
    >
      <header className="flex items-center gap-3 border-b border-border bg-vita px-4 py-3 text-vita-foreground" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-vita-foreground/15">
          <VitaMascot className="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold leading-tight">Vita · Asisten VitaminKu</p>
          <p className="text-[11px] opacity-80">Bantu cari suplemen yang pas</p>
        </div>
        {(messages.length > 0 || finderMsgs.length > 0) && (
          <button
            type="button"
            aria-label="Mulai obrolan baru"
            onClick={() => {
              stop();
              setMessages([]);
              setFinderMsgs([]);
              setError(null);
            }}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-vita-foreground/15"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          aria-label="Tutup"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-vita-foreground/15"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="max-w-[95%] text-sm">
          <p>
            Halo, saya <strong>Vita</strong>. Ceritakan tujuan Anda (misalnya tambah otot, susah tidur, atau budget
            tertentu), nanti Vita pilihkan 3 produk dari merek berbeda di katalog.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Vita bukan pengganti dokter. Obrolan tidak disimpan setelah halaman ditutup; statistik anonim tanpa nama/nomor.
          </p>
        </div>
        {messages.length === 0 && finderMsgs.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {(FINDER_URL ? CHIPS.slice(0, 3) : CHIPS).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => send(c)}
                className="min-h-11 rounded-full border border-primary bg-primary-soft px-3 py-1.5 text-xs font-bold text-accent-foreground"
              >
                {c}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <MessageView key={m.id} m={m} onNavigate={onClose} />
        ))}
        {finderMsgs.map((m, idx) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-navy px-3.5 py-2 text-sm text-navy-foreground">
              <RichText text={m.text} />
            </div>
          ) : (
            <div key={m.id} className="max-w-[95%] text-sm text-foreground">
              <RichText text={m.text} />
              <FinderCards
                products={m.products ?? []}
                onNavigate={onClose}
                onChosen={(pid) => FINDER_URL && sendFinderChosen({ url: FINDER_URL, apiKey: FINDER_KEY, productId: pid, queryHash: m.queryHash ?? null })}
              />
              {idx === finderMsgs.length - 1 && !busy && (m.quickReplies?.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-wrap gap-2" aria-label="Pilihan cepat">
                  {m.quickReplies!.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => send(c)}
                      className="min-h-11 rounded-full border border-primary bg-primary-soft px-3 py-1.5 text-xs font-bold text-accent-foreground"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
              <WaButton url={vitaWhatsappUrl(summary)} label={m.needsHuman ? "Tanya admin via WhatsApp" : "Masih ragu? Tanya admin"} />
            </div>
          ),
        )}
        {(status === "submitted" || finderBusy) && (
          <div className="flex gap-1 py-1" aria-label="Vita sedang mengetik">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground motion-reduce:animate-none"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
            <div>
              <WaButton url={vitaWhatsappUrl(summary)} />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 border-t border-border bg-card px-3 pt-2"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          maxLength={VITA_MAX_CHARS}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Tanya Vita…"
          aria-label="Pesan untuk Vita"
          className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-input bg-background px-3.5 py-2.5 text-base outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Kirim"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-vita text-vita-foreground disabled:opacity-40"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
