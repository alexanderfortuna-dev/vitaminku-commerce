import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getVitaInsight } from "@/lib/vita-insight.functions";
import { canEditCommerce } from "@/lib/admin-roles";
import { useAdminRole } from "./route";

export const Route = createFileRoute("/admin/vita-insight")({
  head: () => ({
    meta: [
      { title: "Wawasan Vita — Seller Center | VitaminKu" },
      { name: "description", content: "Pertanyaan pelanggan yang belum menemukan produk, untuk melengkapi katalog dan kamus Vita." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VitaInsightPage,
});

const GOAL_LABEL: Record<string, string> = {
  protein: "Protein",
  massa: "Tambah massa",
  otot: "Bentuk otot",
  diet: "Diet",
  energi: "Energi",
  pre_workout: "Pre-workout",
  kreatin: "Creatine",
  amino: "Asam amino",
  tidur: "Tidur",
  stres: "Rileks",
  imun: "Daya tahan",
  sendi: "Sendi",
  kulit: "Kulit",
  pencernaan: "Pencernaan",
  fokus: "Fokus",
  lansia: "Usia lanjut",
};

function VitaInsightPage() {
  const role = useAdminRole();
  const allowed = canEditCommerce(role.data?.role ?? null);
  const [days, setDays] = useState(30);
  const fetchInsight = useServerFn(getVitaInsight);
  const q = useQuery({ queryKey: ["vita-insight", days], queryFn: () => fetchInsight({ data: { days } }), enabled: allowed });

  if (!allowed) return <p className="p-4 text-sm text-muted-foreground">Halaman ini khusus Owner dan Manajer.</p>;
  const d = q.data;
  return (
    <div className="px-4 py-4">
      <h1 className="text-base font-extrabold text-navy">Wawasan Vita</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Pertanyaan pelanggan ke Vita yang belum menemukan produk. Tanpa nama atau nomor telepon. Gunakan untuk melengkapi katalog atau kamus Vita.
      </p>
      <div className="mt-3 flex gap-2">
        {[7, 30, 90].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setDays(n)}
            className={`min-h-11 rounded-full px-4 text-xs font-bold ${days === n ? "bg-primary text-primary-foreground" : "bg-secondary text-navy"}`}
          >
            {n} hari
          </button>
        ))}
      </div>
      {q.isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Memuat…</p>
      ) : q.isError ? (
        <p className="mt-4 text-sm text-muted-foreground">{q.error instanceof Error ? q.error.message : "Gagal memuat"}</p>
      ) : !d?.installed ? (
        <p className="mt-4 rounded-2xl bg-secondary p-3 text-sm text-navy">
          Statistik Vita belum aktif. Aktif setelah pembaruan database Rilis 3 dipasang lewat tombol pasang-database.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Pertanyaan dijawab" value={d.answers} />
            <Stat label="Tanpa hasil" value={d.zero_results} />
            <Stat label="Produk dipilih dari Vita" value={d.chosen} />
            <Stat label="Dijawab AI" value={d.ai_answers} />
          </div>
          <h2 className="mt-5 text-sm font-extrabold text-navy">Pertanyaan tanpa hasil teratas</h2>
          {d.top_zero.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Belum ada. Bagus — semua pertanyaan menemukan produk.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-2xl border border-border">
              {d.top_zero.map((z) => (
                <li key={z.query_text} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 break-words text-navy">{z.query_text}</span>
                  <span className="shrink-0 text-xs font-bold text-muted-foreground">{z.hits}×</span>
                </li>
              ))}
            </ul>
          )}
          <h2 className="mt-5 text-sm font-extrabold text-navy">Tujuan yang paling sering ditanyakan</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {d.by_goal.map((g) => (
              <li key={g.goal} className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-navy">
                {GOAL_LABEL[g.goal] ?? g.goal} · {g.hits}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-[11px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="text-lg font-extrabold text-navy">{value.toLocaleString("id-ID")}</p>
    </div>
  );
}
