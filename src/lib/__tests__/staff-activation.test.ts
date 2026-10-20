import { describe, expect, it } from "vitest";
import {
  STAFF_GRANTS,
  expiryFromDays,
  makeStaffCode,
  verifyStaffCode,
  type StaffGrant,
} from "../staff-activation.server";
import { formatExpiryId } from "../staff-activation-format";

const SECRET = "uji-rahasia-aktivasi-staf-0123456789abcdef";
const EMAIL = "staf.satu@example.com";
const ADMIN: StaffGrant = { role: "admin", title: "admin" };
const NOW = new Date("2026-10-21T02:00:00+07:00");

describe("kode aktivasi staf", () => {
  const expiresOn = expiryFromDays(14, NOW);
  const code = makeStaffCode({ secret: SECRET, email: EMAIL, grant: ADMIN, expiresOn });

  it("bentuk kode terbaca manusia dan tanggal berlaku 14 hari (WIB)", () => {
    expect(expiresOn).toBe("20261104");
    expect(code).toMatch(/^VK-20261104(-[A-HJ-NP-Z2-9]{5}){4}$/);
  });

  it("kode benar -> peran admin; huruf kecil dan spasi tetap diterima", () => {
    const res = verifyStaffCode({ secret: SECRET, email: EMAIL, code, now: NOW });
    expect(res).toEqual({ ok: true, grant: ADMIN, expiresOn: "20261104" });
    const sloppy = verifyStaffCode({ secret: SECRET, email: `  ${EMAIL.toUpperCase()} `, code: code.toLowerCase().replace(/-/g, " "), now: NOW });
    expect(sloppy.ok).toBe(true);
  });

  it("terikat ke email: email lain ditolak", () => {
    const res = verifyStaffCode({ secret: SECRET, email: "orang.lain@example.com", code, now: NOW });
    expect(res).toEqual({ ok: false, reason: "invalid" });
  });

  it("terikat ke peran: setiap kombinasi peran menghasilkan kode berbeda dan peran tidak bisa dinaikkan", () => {
    const codes = STAFF_GRANTS.map((grant) => makeStaffCode({ secret: SECRET, email: EMAIL, grant, expiresOn }));
    expect(new Set(codes).size).toBe(STAFF_GRANTS.length);
    codes.forEach((c, i) => {
      const res = verifyStaffCode({ secret: SECRET, email: EMAIL, code: c, now: NOW });
      expect(res.ok && res.grant).toEqual(STAFF_GRANTS[i]);
    });
  });

  it("tidak ada kode untuk peran owner", () => {
    expect(STAFF_GRANTS.some((g) => (g.role as string) === "owner")).toBe(false);
  });

  it("rahasia lain, tanggal diubah, atau huruf diubah -> ditolak", () => {
    expect(verifyStaffCode({ secret: SECRET + "x", email: EMAIL, code, now: NOW }).ok).toBe(false);
    expect(verifyStaffCode({ secret: SECRET, email: EMAIL, code: code.replace("20261104", "20261204"), now: NOW }).ok).toBe(false);
    const flipped = code.slice(0, -1) + (code.endsWith("A") ? "B" : "A");
    expect(verifyStaffCode({ secret: SECRET, email: EMAIL, code: flipped, now: NOW }).ok).toBe(false);
  });

  it("kedaluwarsa setelah 23:59 WIB pada tanggalnya", () => {
    const lastMoment = new Date("2026-11-04T23:59:00+07:00");
    const after = new Date("2026-11-05T00:01:00+07:00");
    expect(verifyStaffCode({ secret: SECRET, email: EMAIL, code, now: lastMoment }).ok).toBe(true);
    expect(verifyStaffCode({ secret: SECRET, email: EMAIL, code, now: after })).toEqual({ ok: false, reason: "expired" });
  });

  it("tanpa rahasia server atau rahasia pendek -> fitur tidak tersedia (tertutup)", () => {
    expect(verifyStaffCode({ secret: undefined, email: EMAIL, code, now: NOW })).toEqual({ ok: false, reason: "unavailable" });
    expect(verifyStaffCode({ secret: "pendek", email: EMAIL, code, now: NOW })).toEqual({ ok: false, reason: "unavailable" });
    expect(() => makeStaffCode({ secret: "pendek", email: EMAIL, grant: ADMIN, expiresOn })).toThrow();
  });

  it("sampah dan kode kosong ditolak tanpa melempar", () => {
    for (const bad of ["", "VK", "bukan kode", "VK-20261104-AAAAA", "x".repeat(500)]) {
      expect(verifyStaffCode({ secret: SECRET, email: EMAIL, code: bad, now: NOW }).ok).toBe(false);
    }
  });

  it("format tanggal Indonesia", () => {
    expect(formatExpiryId("20261104")).toBe("4 November 2026");
    expect(formatExpiryId("20270101")).toBe("1 Januari 2027");
    expect(formatExpiryId("bukan")).toBe("bukan");
  });
});

/* ------------------------- alur aktivasi (klien disuntik) ------------------------- */
import { StaffActivationError, cleanDisplayName, grantFor, runStaffActivation, type StaffDeps } from "../staff-activation.server";
import { isAdminOpenPath } from "../admin-open-paths";

function fakeDeps(over: Partial<StaffDeps> = {}) {
  const calls: string[] = [];
  const logs: string[] = [];
  const deps: StaffDeps = {
    createUser: async () => { calls.push("create"); return { id: "u-baru" }; },
    upsertRole: async () => { calls.push("role"); return null; },
    deleteUser: async (id) => { calls.push(`delete:${id}`); return null; },
    audit: async () => { calls.push("audit"); return null; },
    log: (m) => logs.push(m),
    ...over,
  };
  return { deps, calls, logs };
}
const exp2 = expiryFromDays(14, NOW);
const goodCode = makeStaffCode({ secret: SECRET, email: EMAIL, grant: ADMIN, expiresOn: exp2 });
const base = { secret: SECRET, email: EMAIL, password: "kata-sandi-panjang", code: goodCode, now: NOW };

describe("alur aktivasi akun staf", () => {
  it("jalur normal: buat akun, simpan peran, catat audit", async () => {
    const { deps, calls } = fakeDeps();
    expect(await runStaffActivation(deps, base)).toEqual({ ok: true });
    expect(calls).toEqual(["create", "role", "audit"]);
  });

  it("kode salah -> tidak ada akun dibuat, kind=code", async () => {
    const { deps, calls } = fakeDeps();
    const err = await runStaffActivation(deps, { ...base, code: "VK-20261104-AAAAA-AAAAA-AAAAA-AAAAA" }).catch((e) => e);
    expect(err).toBeInstanceOf(StaffActivationError);
    expect(err.kind).toBe("code");
    expect(calls).toEqual([]);
  });

  it("rahasia server belum dipasang -> pesan sama dengan 'tidak cocok' dan tercatat di log", async () => {
    const { deps, logs } = fakeDeps();
    const err = await runStaffActivation(deps, { ...base, secret: undefined }).catch((e) => e);
    expect(err.message).toBe("Email atau kode aktivasi tidak cocok.");
    expect(logs.join()).toContain("STAFF_ACTIVATION_SECRET");
  });

  it("nama tampilan bukan teks tidak membuat akun yatim", async () => {
    expect(cleanDisplayName({})).toBeNull();
    expect(cleanDisplayName(42)).toBeNull();
    expect(cleanDisplayName("  Admin 1  ")).toBe("Admin 1");
    expect(cleanDisplayName("x".repeat(200))).toHaveLength(80);
    const { deps, calls } = fakeDeps();
    await runStaffActivation(deps, { ...base, displayName: { aneh: true } });
    expect(calls).toEqual(["create", "role", "audit"]);
  });

  it("peran gagal disimpan -> akun yang baru dibuat dibatalkan", async () => {
    const { deps, calls } = fakeDeps({ upsertRole: async () => "boom" });
    await expect(runStaffActivation(deps, base)).rejects.toThrow("Gagal menyimpan peran");
    expect(calls).toContain("delete:u-baru");
  });

  it("peran gagal DAN pembatalan gagal -> pesan jujur ke staf dan jejak di log", async () => {
    const { deps, logs } = fakeDeps({ upsertRole: async () => "boom", deleteUser: async () => "gagal hapus" });
    await expect(runStaffActivation(deps, base)).rejects.toThrow("Hubungi owner");
    expect(logs.join("\n")).toContain("u-baru");
  });

  it("email sudah punya akun (pelanggan/staf) -> ditolak, akun lama tidak disentuh sama sekali", async () => {
    const { deps, calls } = fakeDeps({ createUser: async () => ({ exists: true as const }) });
    const err = await runStaffActivation(deps, base).catch((e) => e);
    expect(err).toBeInstanceOf(StaffActivationError);
    expect(err.message).toContain("sudah terdaftar");
    expect(calls).toEqual([]); // tidak ada role/audit/delete
  });

  it("langkah simpan peran MELEMPAR (bukan mengembalikan galat) -> akun baru tetap dibatalkan", async () => {
    const { deps, calls } = fakeDeps({ upsertRole: async () => { throw new Error("jaringan putus"); } });
    await expect(runStaffActivation(deps, base)).rejects.toThrow("Gagal menyimpan peran");
    expect(calls).toContain("delete:u-baru");
  });

  it("pembatalan akun juga melempar -> pesan jujur, tidak crash", async () => {
    const { deps } = fakeDeps({ upsertRole: async () => "boom", deleteUser: async () => { throw new Error("x"); } });
    await expect(runStaffActivation(deps, base)).rejects.toThrow("Hubungi owner");
  });

  it("audit melempar tidak menggagalkan aktivasi", async () => {
    const { deps } = fakeDeps({ audit: async () => { throw new Error("audit mati"); } });
    expect(await runStaffActivation(deps, base)).toEqual({ ok: true });
  });

  it("galat createUser lain dicatat ke log dan pesan ke staf generik", async () => {
    const { deps, logs } = fakeDeps({ createUser: async () => ({ error: "422 weak_password" }) });
    await expect(runStaffActivation(deps, base)).rejects.toThrow("Gagal membuat akun");
    expect(logs.join()).toContain("weak_password");
  });

  it("kegagalan audit tidak menggagalkan aktivasi tetapi tercatat", async () => {
    const { deps, logs } = fakeDeps({ audit: async () => "audit down" });
    expect(await runStaffActivation(deps, base)).toEqual({ ok: true });
    expect(logs.join()).toContain("audit");
  });
});

describe("hak yang boleh diberikan lewat kode", () => {
  it("owner dan peran asing ditolak", () => {
    for (const bad of ["owner", "superadmin", "", "ADMIN"]) expect(() => grantFor(bad)).toThrow();
    expect(grantFor("admin")).toEqual({ role: "admin", title: "admin" });
    expect(grantFor("admin", "general_manager")).toEqual({ role: "admin", title: "general_manager" });
    expect(grantFor("seller", "general_manager")).toEqual({ role: "seller", title: null });
  });
});

describe("penjaga halaman terbuka /admin", () => {
  it("hanya login dan aktivasi (eksak atau anak rute)", () => {
    expect(isAdminOpenPath("/admin/login")).toBe(true);
    expect(isAdminOpenPath("/admin/aktivasi")).toBe(true);
    expect(isAdminOpenPath("/admin/aktivasi/")).toBe(true);
    for (const closed of ["/admin", "/admin/aktivitas", "/admin/aktivasi-lain", "/admin/loginx", "/admin/pengguna"]) {
      expect(isAdminOpenPath(closed)).toBe(false);
    }
  });
});
