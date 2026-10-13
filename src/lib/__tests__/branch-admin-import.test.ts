import { describe, expect, it } from "vitest";
import {
  TEMPLATE_HEADERS,
  SAMPLE_ROW,
  gridToImportRows,
  parseActive,
  parseRole,
  parseWhatsapp,
  planBranchAdminImport,
  type ExistingAdmin,
  type ExistingBranch,
  type ImportRawRow,
} from "../branch-admin-import";

const mk = (row: number, v: Partial<Record<(typeof TEMPLATE_HEADERS)[number], string | number | null>>): ImportRawRow => ({
  row,
  Kode_Cabang: null, Nama_Cabang: null, Alamat_Lengkap: null, Link_Google_Maps: null, Jam_Buka: null,
  Peran_Admin: null, Nama_Admin: null, Nomor_WA: null, Aktif: null,
  ...v,
});
const sanur = (row: number, extra: Parameters<typeof mk>[1] = {}) =>
  mk(row, { Kode_Cabang: "sanur", Nama_Cabang: "Bali Nutrition Sanur", Peran_Admin: "Utama", Nama_Admin: "Made Putra", Nomor_WA: "0813 3995 0000", Aktif: "Ya", ...extra });

const noBranches: ExistingBranch[] = [];
const noAdmins: ExistingAdmin[] = [];
const MAPS = "https://www.google.com/maps/place/X/@-8.6705,115.2126,17z";

describe("parser sel", () => {
  it("nomor WA dinormalisasi ke 62…", () => {
    expect(parseWhatsapp("0813 3995 0000")).toBe("6281339950000");
    expect(parseWhatsapp("+62 813-3995-0000")).toBe("6281339950000");
    expect(parseWhatsapp("81339950000")).toBe("6281339950000");
    expect(parseWhatsapp(81339950000)).toBe("6281339950000");
    expect(parseWhatsapp("12345")).toBeNull();
    expect(parseWhatsapp("")).toBeNull();
  });
  it("peran hanya Utama/Cadangan", () => {
    expect(parseRole("Utama")).toBe("utama");
    expect(parseRole(" cadangan ")).toBe("cadangan");
    expect(parseRole("Bos")).toBeNull();
    expect(parseRole(null)).toBeNull();
  });
  it("aktif Ya/Tidak, kosong = Ya, lain = tidak dikenali", () => {
    expect(parseActive("Ya")).toBe(true);
    expect(parseActive("tidak")).toBe(false);
    expect(parseActive("")).toBe(true);
    expect(parseActive("mungkin")).toBeNull();
  });
});

describe("gridToImportRows", () => {
  it("menolak file tanpa kolom wajib dengan pesan jelas", () => {
    const r = gridToImportRows([["Kode_Cabang", "Nama_Cabang"]]);
    expect("error" in r && r.error).toContain("Kolom tidak ditemukan");
  });
  it("membaca header tanpa peduli huruf/garis bawah dan memberi nomor baris spreadsheet", () => {
    const r = gridToImportRows([TEMPLATE_HEADERS.map((h) => h.toLowerCase().replace("_", " ")), [...SAMPLE_ROW]]);
    expect("rows" in r && r.rows[0]!.row).toBe(2);
    expect("rows" in r && r.rows[0]!.Nomor_WA).toBe("0813 3995 0000");
  });
});

describe("planBranchAdminImport", () => {
  it("membuat cabang + admin baru dan memberi referral otomatis", () => {
    const plan = planBranchAdminImport([sanur(2, { Link_Google_Maps: MAPS, Alamat_Lengkap: "Jl. Danau Tamblingan 1" })], noBranches, noAdmins);
    expect(plan.summary).toMatchObject({ rowsCreate: 1, rowsError: 0, branchesCreate: 1, adminsCreate: 1 });
    expect(plan.branches[0]!.values).toMatchObject({ code: "SANUR", name: "Bali Nutrition Sanur", lat: -8.6705, lng: 115.2126, whatsapp: "6281339950000" });
    expect(plan.admins[0]!.values).toMatchObject({ whatsapp: "6281339950000", role: "utama", is_active: true, referral_code: "SANUR-MADE" });
  });

  it("galat nomor WA memakai pesan Indonesia dengan nomor baris", () => {
    const plan = planBranchAdminImport([sanur(7, { Nomor_WA: "123" })], noBranches, noAdmins);
    expect(plan.rows[0]).toMatchObject({ row: 7, status: "error", message: "Baris 7: Nomor WhatsApp tidak valid. Contoh: 0813 3995 0000" });
    expect(plan.branches).toHaveLength(0);
    expect(plan.admins).toHaveLength(0);
  });

  it("baris kosong diabaikan, baris CONTOH dilewati (tidak pernah dibuat)", () => {
    const plan = planBranchAdminImport([mk(2, {}), mk(3, { Kode_Cabang: "  " }), mk(4, Object.fromEntries(TEMPLATE_HEADERS.map((h, i) => [h, SAMPLE_ROW[i]!])))], noBranches, noAdmins);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({ row: 4, status: "skip" });
    expect(plan.branches).toHaveLength(0);
  });

  it("peran / aktif / kode tidak valid dilaporkan sekaligus", () => {
    const plan = planBranchAdminImport([sanur(2, { Kode_Cabang: "x", Peran_Admin: "Bos", Aktif: "mungkin" })], noBranches, noAdmins);
    const m = plan.rows[0]!.message;
    expect(m).toContain("Kode_Cabang tidak valid");
    expect(m).toContain("Peran_Admin harus Utama atau Cadangan");
    expect(m).toContain("Aktif harus Ya atau Tidak");
  });

  it("dua Utama aktif di satu cabang: baris kedua galat, baris pertama tetap jalan", () => {
    const plan = planBranchAdminImport(
      [sanur(2), sanur(3, { Nama_Admin: "Ketut", Nomor_WA: "0812 1111 2222" })],
      noBranches, noAdmins,
    );
    expect(plan.rows[0]!.status).toBe("create");
    expect(plan.rows[1]).toMatchObject({ status: "error" });
    expect(plan.rows[1]!.message).toContain("hanya boleh punya satu admin Utama aktif (sudah ada di baris 2)");
    expect(plan.admins).toHaveLength(1);
  });

  it("Utama + Cadangan di cabang yang sama lolos; Utama nonaktif tidak dihitung", () => {
    const plan = planBranchAdminImport(
      [sanur(2), sanur(3, { Peran_Admin: "Cadangan", Nama_Admin: "Ketut", Nomor_WA: "0812 1111 2222" }),
       sanur(4, { Nama_Admin: "Wayan", Nomor_WA: "0812 3333 4444", Aktif: "Tidak" })],
      noBranches, noAdmins,
    );
    expect(plan.summary.rowsError).toBe(0);
    expect(plan.admins.map((a) => a.values.referral_code)).toEqual(["SANUR-MADE", "SANUR-KETUT", "SANUR-WAYAN"]);
  });

  it("cabang baru tanpa Utama aktif ditolak", () => {
    const plan = planBranchAdminImport([sanur(2, { Peran_Admin: "Cadangan" })], noBranches, noAdmins);
    expect(plan.rows[0]!.status).toBe("error");
    expect(plan.rows[0]!.message).toContain("butuh satu admin Utama aktif");
  });

  it("nomor sama dua kali untuk cabang yang sama = duplikat", () => {
    const plan = planBranchAdminImport([sanur(2), sanur(3, { Peran_Admin: "Cadangan", Nomor_WA: "+6281339950000" })], noBranches, noAdmins);
    expect(plan.rows[1]!.message).toContain("sudah ada di baris 2");
  });

  it("link pendek tidak ditebak: koordinat kosong + peringatan", () => {
    const plan = planBranchAdminImport([sanur(2, { Link_Google_Maps: "https://maps.app.goo.gl/abc123" })], noBranches, noAdmins);
    expect(plan.branches[0]!.values.lat).toBeNull();
    expect(plan.branches[0]!.values.lng).toBeNull();
    expect(plan.rows[0]!.status).toBe("create");
    expect(plan.rows[0]!.warnings[0]).toContain("tidak dipilih otomatis");
  });

  it("link bukan https ditolak", () => {
    const plan = planBranchAdminImport([sanur(2, { Link_Google_Maps: "sanur dekat pantai" })], noBranches, noAdmins);
    expect(plan.rows[0]!.message).toContain("Link_Google_Maps harus berupa link");
  });

  it("data cabang berbeda antarbaris untuk kode yang sama -> galat", () => {
    const plan = planBranchAdminImport(
      [sanur(2), sanur(3, { Nama_Cabang: "Nama Lain", Peran_Admin: "Cadangan", Nomor_WA: "0812 1111 2222", Nama_Admin: "Ketut" })],
      noBranches, noAdmins,
    );
    expect(plan.rows[1]!.message).toContain("Nama_Cabang berbeda dengan baris 2");
  });

  it("cabang baru wajib Nama_Cabang", () => {
    const plan = planBranchAdminImport([sanur(2, { Nama_Cabang: null })], noBranches, noAdmins);
    expect(plan.rows[0]!.message).toContain("Nama_Cabang wajib diisi");
  });

  describe("idempoten & cabang yang sudah ada", () => {
    const branch: ExistingBranch = { id: "b1", name: "Bali Nutrition Sanur", code: "SANUR", address: null, opening_hours: null, maps_url: null, lat: null, lng: null, display_order: 0 };
    const admin: ExistingAdmin = { id: "a1", branch_id: "b1", name: "Made Putra", whatsapp: "6281339950000", role: "utama", referral_code: "SANUR-MADE", is_active: true };

    it("mengunggah file yang sama dua kali -> tidak ada perubahan kedua kalinya", () => {
      const file = [sanur(2, { Link_Google_Maps: MAPS, Alamat_Lengkap: "Jl. A", Jam_Buka: "09-21" })];
      const first = planBranchAdminImport(file, noBranches, noAdmins);
      // simulasikan hasil penerapan pertama
      const b = first.branches[0]!.values;
      const a = first.admins[0]!.values;
      const after = planBranchAdminImport(
        file,
        [{ id: "b1", name: b.name!, code: b.code!, address: b.address!, opening_hours: b.opening_hours!, maps_url: b.maps_url!, lat: b.lat!, lng: b.lng!, display_order: 1 }],
        [{ id: "a1", branch_id: "b1", name: a.name, whatsapp: a.whatsapp, role: a.role, referral_code: a.referral_code, is_active: a.is_active }],
      );
      expect(after.rows[0]).toMatchObject({ status: "skip" });
      expect(after.branches).toHaveLength(0);
      expect(after.admins).toHaveLength(0);
    });

    it("mengubah nama admin = update; referral lama dipertahankan", () => {
      const plan = planBranchAdminImport([sanur(2, { Nama_Admin: "Made P." })], [branch], [admin]);
      expect(plan.admins[0]).toMatchObject({ action: "update", id: "a1", branchId: "b1" });
      expect(plan.admins[0]!.values.referral_code).toBe("SANUR-MADE");
    });

    it("sel opsional kosong = tidak mengubah data cabang yang ada", () => {
      const withAddr = { ...branch, address: "Jl. Lama", lat: -8.6, lng: 115.2, maps_url: "https://maps.google.com/x" };
      const plan = planBranchAdminImport([sanur(2)], [withAddr], [admin]);
      expect(plan.branches).toHaveLength(0);
      expect(plan.rows[0]!.status).toBe("skip");
    });

    it("Utama baru saat sudah ada Utama aktif di DB -> galat jelas", () => {
      const plan = planBranchAdminImport([sanur(2, { Nama_Admin: "Ketut", Nomor_WA: "0812 1111 2222" })], [branch], [admin]);
      expect(plan.rows[0]!.status).toBe("error");
      expect(plan.rows[0]!.message).toContain("sudah punya admin Utama aktif (Made Putra");
    });

    it("pergantian Utama dalam satu file lolos, dan penurunan diterapkan lebih dulu", () => {
      const plan = planBranchAdminImport(
        [sanur(2, { Nama_Admin: "Ketut", Nomor_WA: "0812 1111 2222" }), sanur(3, { Peran_Admin: "Cadangan" })],
        [branch], [admin],
      );
      expect(plan.summary.rowsError).toBe(0);
      expect(plan.admins.map((o) => o.row)).toEqual([3, 2]);
      expect(plan.admins[0]!.freesUtama).toBe(true);
    });

    it("menonaktifkan satu-satunya Utama tanpa pengganti, padahal masih ada Cadangan aktif -> galat", () => {
      const cad: ExistingAdmin = { ...admin, id: "a2", name: "Ketut", whatsapp: "6281211112222", role: "cadangan", referral_code: "SANUR-KETUT" };
      const plan = planBranchAdminImport([sanur(2, { Aktif: "Tidak" })], [branch], [admin, cad]);
      expect(plan.rows[0]!.status).toBe("error");
      expect(plan.rows[0]!.message).toContain("belum punya admin Utama aktif");
    });

    it("cabang lama tanpa kode dicocokkan lewat nama persis dan diberi kode (dengan peringatan)", () => {
      const old: ExistingBranch = { ...branch, code: null };
      const plan = planBranchAdminImport([sanur(2)], [old], []);
      expect(plan.branches[0]).toMatchObject({ action: "update", id: "b1" });
      expect(plan.branches[0]!.values.code).toBe("SANUR");
      expect(plan.rows[0]!.warnings[0]).toContain("akan diberi kode SANUR");
    });

    it("nama cabang sudah dipakai kode lain -> galat, tidak membuat cabang kembar", () => {
      const plan = planBranchAdminImport([sanur(2, { Kode_Cabang: "SANUR2" })], [branch], [admin]);
      expect(plan.rows[0]!.message).toContain("sudah dipakai kode SANUR");
      expect(plan.branches).toHaveLength(0);
    });

    it("link Maps baru yang tak terbaca mengosongkan koordinat lama (bukan menebak)", () => {
      const withCoords = { ...branch, maps_url: "https://maps.google.com/lama", lat: -8.6, lng: 115.2 };
      const plan = planBranchAdminImport([sanur(2, { Link_Google_Maps: "https://maps.app.goo.gl/baru" })], [withCoords], [admin]);
      expect(plan.branches[0]!.values).toMatchObject({ maps_url: "https://maps.app.goo.gl/baru", lat: null, lng: null });
    });

    it("referral otomatis tidak bentrok dengan kode yang sudah dipakai", () => {
      const other: ExistingAdmin = { ...admin, id: "z", branch_id: "b9", whatsapp: "6285555555555", referral_code: "SANUR-KETUT" };
      const plan = planBranchAdminImport([sanur(2, { Nama_Admin: "Ketut", Nomor_WA: "0812 1111 2222", Peran_Admin: "Cadangan" })], [branch], [admin, other]);
      expect(plan.admins[0]!.values.referral_code).toBe("SANUR-KETUT-2");
    });
  });
});
