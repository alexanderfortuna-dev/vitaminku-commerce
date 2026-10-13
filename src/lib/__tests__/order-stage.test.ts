import { describe, expect, it } from "vitest";
import {
  ORDER_STAGES,
  ageMinutes,
  buildStageMessage,
  buildWhatsappLink,
  canTransition,
  effectiveStage,
  formatAge,
  friendlyStageError,
  isLateNewOrder,
  isLegacyBackfilled,
  nextStage,
  stageFromStatus,
  type OrderStage,
} from "../order-stage";

const T0 = new Date("2026-10-13T10:00:00Z").getTime();
const at = (minAgo: number) => new Date(T0 - minAgo * 60000).toISOString();

describe("urutan tahap yang sah", () => {
  it("hanya maju satu langkah", () => {
    expect(nextStage("baru")).toBe("dikonfirmasi");
    expect(nextStage("dikonfirmasi")).toBe("dikemas");
    expect(nextStage("dikemas")).toBe("dikirim");
    expect(nextStage("dikirim")).toBe("selesai");
    expect(nextStage("selesai")).toBeNull();
    expect(nextStage("batal")).toBeNull();
  });

  it("menolak loncat tahap dan mundur", () => {
    expect(canTransition("baru", "dikemas")).toBe(false);
    expect(canTransition("baru", "selesai")).toBe(false);
    expect(canTransition("dikonfirmasi", "dikirim")).toBe(false);
    expect(canTransition("dikirim", "dikemas")).toBe(false);
    expect(canTransition("dikemas", "baru")).toBe(false);
    expect(canTransition("dikemas", "dikemas")).toBe(false);
  });

  it("menerima langkah maju dan Batal dari tahap yang belum selesai", () => {
    expect(canTransition("baru", "dikonfirmasi")).toBe(true);
    expect(canTransition("dikirim", "selesai")).toBe(true);
    for (const s of ["baru", "dikonfirmasi", "dikemas", "dikirim"] as OrderStage[]) {
      expect(canTransition(s, "batal")).toBe(true);
    }
  });

  it("selesai dan batal terkunci", () => {
    for (const to of ORDER_STAGES) {
      expect(canTransition("selesai", to)).toBe(false);
      expect(canTransition("batal", to)).toBe(false);
    }
  });
});

describe("pemetaan status -> tahap (sama dengan backfill migrasi 0012)", () => {
  it("paid -> dikonfirmasi; cancelled/expired -> batal; sisanya baru", () => {
    expect(stageFromStatus("paid")).toBe("dikonfirmasi");
    expect(stageFromStatus("cancelled")).toBe("batal");
    expect(stageFromStatus("expired")).toBe("batal");
    expect(stageFromStatus("menunggu_konfirmasi")).toBe("baru");
    expect(stageFromStatus("pending")).toBe("baru");
  });

  it("pesanan baru yang kedaluwarsa/dibatalkan sistem tampil sebagai batal, bukan pesanan masuk", () => {
    expect(effectiveStage({ status: "expired", stage: "baru" })).toBe("batal");
    expect(effectiveStage({ status: "cancelled", stage: "baru" })).toBe("batal");
  });

  it("pesanan dibayar otomatis (webhook) yang tahapnya masih baru tetap perlu keputusan staf", () => {
    expect(effectiveStage({ status: "paid", stage: "baru" })).toBe("baru");
  });

  it("memakai tahap database bila valid, dan jatuh ke pemetaan status bila nilainya asing", () => {
    expect(effectiveStage({ status: "paid", stage: "dikemas" })).toBe("dikemas");
    expect(effectiveStage({ status: "paid", stage: "entah" })).toBe("dikonfirmasi");
  });
});

describe("terlambat > 10 menit", () => {
  const base = { status: "menunggu_konfirmasi", stage: "baru" };
  it("tepat 10 menit belum terlambat, 11 menit terlambat", () => {
    expect(isLateNewOrder({ ...base, created_at: at(10) }, T0)).toBe(false);
    expect(isLateNewOrder({ ...base, created_at: at(11) }, T0)).toBe(true);
  });
  it("hanya untuk tahap baru", () => {
    expect(isLateNewOrder({ status: "paid", stage: "dikonfirmasi", created_at: at(500) }, T0)).toBe(false);
    expect(isLateNewOrder({ status: "expired", stage: "baru", created_at: at(500) }, T0)).toBe(false);
  });
  it("pesanan menunggu pembayaran pelanggan tidak ditandai terlambat", () => {
    expect(isLateNewOrder({ status: "pending", stage: "baru", created_at: at(500) }, T0)).toBe(false);
  });
  it("pesanan paid yang masih baru ikut dihitung", () => {
    expect(isLateNewOrder({ status: "paid", stage: "baru", created_at: at(30) }, T0)).toBe(true);
  });
  it("umur tidak pernah negatif dan tahan tanggal rusak", () => {
    expect(ageMinutes(at(-5), T0)).toBe(0);
    expect(ageMinutes("bukan tanggal", T0)).toBe(0);
  });
  it("format umur", () => {
    expect(formatAge(0)).toBe("baru saja");
    expect(formatAge(7)).toBe("7 mnt");
    expect(formatAge(60)).toBe("1 jam");
    expect(formatAge(125)).toBe("2 jam 5 mnt");
    expect(formatAge(60 * 24 * 3 + 5)).toBe("3 hari");
  });
  it("menandai pesanan lama hasil backfill", () => {
    expect(isLegacyBackfilled({ stage_updated_at: null, created_at: at(60 * 24 * 10) }, T0)).toBe(true);
    expect(isLegacyBackfilled({ stage_updated_at: null, created_at: at(60) }, T0)).toBe(false);
    expect(isLegacyBackfilled({ stage_updated_at: at(1), created_at: at(60 * 24 * 10) }, T0)).toBe(false);
  });
});

describe("template pesan WhatsApp", () => {
  const input = { customerName: "Sari", orderNumber: "VK-1001", branchName: "Sanur", courierLabel: "JNE REG" };

  it("tiap tahap menyebut nomor pesanan, nama pelanggan, dan cabang", () => {
    for (const s of ["dikonfirmasi", "dikemas", "dikirim", "selesai", "batal"] as const) {
      const m = buildStageMessage(s, input);
      expect(m).toContain("Halo Kak Sari");
      expect(m).toContain("VK-1001");
      expect(m).toContain("VitaminKu Sanur");
    }
  });

  it("pesan berbeda untuk tiap tahap", () => {
    const set = new Set(["dikonfirmasi", "dikemas", "dikirim", "selesai", "batal"].map((s) => buildStageMessage(s as never, input)));
    expect(set.size).toBe(5);
  });

  it("dikirim: resi opsional", () => {
    expect(buildStageMessage("dikirim", { ...input, resi: "JNE12345" })).toContain("No. resi: JNE12345");
    const tanpa = buildStageMessage("dikirim", { ...input, resi: "  " });
    expect(tanpa).not.toContain("resi");
    expect(tanpa).toContain("melalui JNE REG");
  });

  it("batal tidak menjanjikan pengembalian dana otomatis", () => {
    const m = buildStageMessage("batal", input);
    expect(m).toContain("mohon maaf");
    expect(m.toLowerCase()).not.toContain("otomatis");
  });

  it("nama kosong dan tanpa cabang tetap sopan", () => {
    const m = buildStageMessage("dikemas", { customerName: " ", orderNumber: "VK-2" });
    expect(m).toContain("Halo Kak, pesanan VK-2");
    expect(m.endsWith("VitaminKu")).toBe(true);
  });
});

describe("tautan wa.me", () => {
  it("menormalkan nomor lokal ke 62 dan meng-encode teks", () => {
    const link = buildWhatsappLink("0813-3995-0000", "Halo Kak\nTerima kasih & salam")!;
    expect(link.startsWith("https://wa.me/6281339950000?text=")).toBe(true);
    expect(link).toContain(encodeURIComponent("Halo Kak\nTerima kasih & salam"));
  });
  it("menolak nomor yang tidak bisa dipakai", () => {
    expect(buildWhatsappLink("abc", "x")).toBeNull();
    expect(buildWhatsappLink("123", "x")).toBeNull();
  });
});

describe("pesan galat Indonesia sederhana", () => {
  it("memetakan galat RPC yang diketahui", () => {
    expect(friendlyStageError(new Error("Konfirmasi pesanan dulu"))).toBe("Konfirmasi pesanan dulu sebelum dikemas.");
    expect(friendlyStageError(new Error("Urutan tahap salah"))).toContain("Urutan tahap salah");
    expect(friendlyStageError(new Error("Pesanan sudah selesai"))).toContain("sudah selesai");
    expect(friendlyStageError(new Error("Pesanan sudah batal"))).toContain("dibatalkan");
    expect(friendlyStageError(new Error("Stok tidak cukup: Whey 1kg"))).toContain("Whey 1kg");
    expect(friendlyStageError(new Error("forbidden"))).toContain("izin");
    expect(friendlyStageError(new Error("403 — akses ditolak. Fitur ini khusus Owner."))).toContain("izin");
  });
  it("galat tak dikenal tidak membocorkan kosong", () => {
    expect(friendlyStageError(new Error("boom"))).toBe("Gagal memproses: boom");
    expect(friendlyStageError(undefined)).toContain("Coba lagi");
  });
});
