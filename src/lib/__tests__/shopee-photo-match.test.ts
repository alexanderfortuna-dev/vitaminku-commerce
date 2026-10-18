import { describe, expect, it } from "vitest";
import {
  detectShopeeColumns,
  extractUrls,
  gridToShopeeRows,
  namesConflict,
  normalizeName,
  planShopeePhotos,
  selectApplicable,
  type ProductLite,
  type ShopeeRow,
} from "../shopee-photo-match";

const prod = (id: string, sku: string, name: string, images: string[] = [], blocked = false): ProductLite => ({
  id, sku, name, images, blocked,
});
const img = (n: string) => `https://down-id.img.susercontent.com/file/${n}`;
const row = (n: number, sku: string, name: string, urls: string[]): ShopeeRow => ({ row: n, sku, name, urls });

describe("normalizeName", () => {
  it("menurunkan huruf, membuang aksen/tanda baca/spasi ganda", () => {
    expect(normalizeName("  [PROMO] Vitamín  C -- 1.000 mg!!  ")).toBe("promo vitamin c 1.000mg");
  });
  it("menyatukan angka-satuan mg/gr", () => {
    expect(normalizeName("Zinc 50 mg")).toBe(normalizeName("ZINC 50MG"));
    expect(normalizeName("Madu 500 Gram")).toBe("madu 500gr");
    expect(normalizeName("Madu 500 gr")).toBe(normalizeName("madu 500g"));
    expect(normalizeName("Kopi 2,5 kg")).toBe("kopi 2.5kg");
  });
  it("tidak menggabungkan angka dengan kata biasa", () => {
    expect(normalizeName("Permen 5 gummies")).toBe("permen 5 gummies");
  });
});

describe("namesConflict", () => {
  it("nama pemasaran panjang tidak dianggap berlawanan", () => {
    expect(namesConflict("[PROMO] Vitamin C 500mg 60 Tablet Original BPOM", "Vitamin C 500 mg 60 Tablet")).toBe(false);
  });
  it("kekuatan beda = berlawanan", () => {
    expect(namesConflict("Vitamin C 1000 mg", "Vitamin C 500 mg")).toBe(true);
  });
  it("produk lain sama sekali = berlawanan", () => {
    expect(namesConflict("Kopi Susu Latte Gula Aren", "Magnesium 250 mg")).toBe(true);
  });
  it("nama kosong tidak berlawanan", () => {
    expect(namesConflict("", "Zinc 50 mg")).toBe(false);
  });
});

describe("planShopeePhotos — aturan pencocokan", () => {
  const products = [
    prod("p1", "VK-001", "Vitamin C 500 mg"),
    prod("p2", "VK-002", "Zinc 50 mg"),
    prod("p3", "VK-003", "Madu Murni 500 gr"),
    prod("p4", "VK-004", "Multivitamin Anak"),
    prod("p5", "VK-005", "Multivitamin Anak"),
  ];

  it("SKU persis (tanpa beda huruf besar/kecil) → pasti", () => {
    const plan = planShopeePhotos([row(2, "vk-001", "Vitamin C 500mg Original", [img("a")])], products);
    expect(plan.pasti).toHaveLength(1);
    expect(plan.pasti[0]).toMatchObject({ key: "2", dasar: "sku", produk: { id: "p1" }, urls: [img("a")] });
    expect(plan.tinjau).toHaveLength(0);
  });

  it("SKU kosong + nama ternormalisasi persis cocok tepat satu produk → pasti", () => {
    const plan = planShopeePhotos([row(2, "", "MADU  Murni 500 Gram", [img("a")])], products);
    expect(plan.pasti).toHaveLength(1);
    expect(plan.pasti[0]).toMatchObject({ dasar: "nama", produk: { id: "p3" } });
  });

  it("SKU tak ada di toko tetapi nama persis satu produk → pasti lewat nama", () => {
    const plan = planShopeePhotos([row(2, "XX-999", "Zinc 50mg", [img("a")])], products);
    expect(plan.pasti[0]).toMatchObject({ dasar: "nama", produk: { id: "p2" } });
  });

  it("nama cocok >1 produk → tinjau dengan kandidat, tidak pernah pasti", () => {
    const plan = planShopeePhotos([row(2, "", "multivitamin anak", [img("a")])], products);
    expect(plan.pasti).toHaveLength(0);
    expect(plan.tinjau).toHaveLength(1);
    expect(plan.tinjau[0]!.kode).toBe("nama_ganda");
    expect(plan.tinjau[0]!.kandidat.map((k) => k.id).sort()).toEqual(["p4", "p5"]);
  });

  it("SKU cocok tetapi nama berlawanan jauh → tinjau", () => {
    const plan = planShopeePhotos([row(2, "VK-002", "Kopi Susu Latte Gula Aren", [img("a")])], products);
    expect(plan.pasti).toHaveLength(0);
    expect(plan.tinjau[0]).toMatchObject({ kode: "nama_berbeda" });
    expect(plan.tinjau[0]!.kandidat[0]!.id).toBe("p2");
  });

  it("SKU kembar di toko → tinjau", () => {
    const dupSku = [...products, prod("p9", "vk-001", "Vitamin C 500 mg Botol")];
    const plan = planShopeePhotos([row(2, "VK-001", "Vitamin C 500 mg", [img("a")])], dupSku);
    expect(plan.tinjau[0]).toMatchObject({ kode: "sku_ganda" });
    expect(plan.pasti).toHaveLength(0);
  });

  it("satu URL foto dipakai >1 produk berbeda → kedua baris masuk tinjau", () => {
    const plan = planShopeePhotos(
      [row(2, "VK-001", "Vitamin C 500 mg", [img("same")]), row(3, "VK-002", "Zinc 50 mg", [img("same"), img("z")])],
      products,
    );
    expect(plan.pasti).toHaveLength(0);
    expect(plan.tinjau.map((t) => [t.key, t.kode])).toEqual([["2", "url_dipakai_lain"], ["3", "url_dipakai_lain"]]);
  });

  it("URL yang sama dipakai satu baris ambigu dan satu baris pasti → yang pasti ikut ditinjau", () => {
    const plan = planShopeePhotos(
      [row(2, "VK-001", "Vitamin C 500 mg", [img("same")]), row(3, "", "Multivitamin Anak", [img("same")])],
      products,
    );
    expect(plan.pasti).toHaveLength(0);
    expect(plan.tinjau).toHaveLength(2);
  });

  it("produk yang sama di dua baris: foto sama → baris kedua dilewati; foto beda → keduanya tinjau", () => {
    const same = planShopeePhotos(
      [row(2, "VK-001", "Vitamin C 500 mg", [img("a")]), row(3, "VK-001", "Vitamin C 500 mg", [img("a")])],
      products,
    );
    expect(same.pasti.map((p) => p.key)).toEqual(["2"]);
    expect(same.dilewati.map((d) => d.key)).toEqual(["3"]);
    const diff = planShopeePhotos(
      [row(2, "VK-001", "Vitamin C 500 mg", [img("a")]), row(3, "VK-001", "Vitamin C 500 mg", [img("b")])],
      products,
    );
    expect(diff.pasti).toHaveLength(0);
    expect(diff.tinjau.map((t) => t.kode)).toEqual(["baris_ganda", "baris_ganda"]);
  });

  it("produk yang sudah punya foto dilewati; mode timpa memasangnya", () => {
    const withPhoto = [prod("p1", "VK-001", "Vitamin C 500 mg", ["https://x/y.webp"])];
    const r = [row(2, "VK-001", "Vitamin C 500 mg", [img("a")])];
    const skip = planShopeePhotos(r, withPhoto);
    expect(skip.pasti).toHaveLength(0);
    expect(skip.dilewati[0]!.alasan).toMatch(/Sudah punya 1 foto/);
    expect(planShopeePhotos(r, withPhoto, { mode: "timpa" }).pasti).toHaveLength(1);
  });

  it("produk diblokir tidak pernah dipasang", () => {
    const blocked = [prod("p1", "VK-001", "Vitamin C 500 mg", [], true)];
    const plan = planShopeePhotos([row(2, "VK-001", "Vitamin C 500 mg", [img("a")])], blocked, { mode: "timpa" });
    expect(plan.pasti).toHaveLength(0);
    expect(plan.dilewati[0]!.alasan).toMatch(/diblokir/);
  });

  it("tak ada kecocokan → galat tidak_cocok; URL rusak → galat url_rusak", () => {
    const plan = planShopeePhotos(
      [
        row(2, "ZZ-1", "Barang Tidak Dikenal", [img("a")]),
        row(3, "VK-001", "Vitamin C 500 mg", ["http://down.example.com/a.jpg"]),
        row(4, "VK-002", "Zinc 50 mg", ["data:image/png;base64,AAAA"]),
        row(5, "VK-003", "Madu Murni 500 gr", []),
      ],
      products,
    );
    expect(plan.galat.map((g) => [g.key, g.jenis])).toEqual([
      ["2", "tidak_cocok"], ["3", "url_rusak"], ["4", "url_rusak"], ["5", "tanpa_foto"],
    ]);
    expect(plan.pasti).toHaveLength(0);
  });

  it("URL ke host internal ditolak sejak perencanaan", () => {
    const plan = planShopeePhotos([row(2, "VK-001", "Vitamin C 500 mg", ["https://169.254.169.254/latest/meta-data"])], products);
    expect(plan.galat[0]).toMatchObject({ jenis: "url_rusak" });
  });

  it("maks 9 foto, duplikat URL dalam satu baris dibuang", () => {
    const urls = Array.from({ length: 12 }, (_, i) => img(String(i)));
    const plan = planShopeePhotos([row(2, "VK-001", "Vitamin C 500 mg", [...urls, urls[0]!])], products);
    expect(plan.pasti[0]!.urls).toHaveLength(9);
    expect(plan.pasti[0]!.catatan.join(" ")).toMatch(/9 foto pertama/);
  });

  it("nama sangat mirip tapi tidak persis → hanya saran (tinjau), bukan pasti", () => {
    const list = [prod("p1", "VK-001", "Vitamin C 500 mg Botol 60 Tablet Rasa Jeruk")];
    const plan = planShopeePhotos([row(2, "", "Vitamin C 500mg Botol 60 Tablet Rasa Jeruk Segar", [img("a")])], list);
    expect(plan.pasti).toHaveLength(0);
    expect(plan.tinjau[0]).toMatchObject({ kode: "mirip" });
  });

  it("baris benar-benar kosong diabaikan", () => {
    const plan = planShopeePhotos([row(2, "", "", [])], products);
    expect(plan.totalBaris).toBe(0);
    expect(plan.galat).toHaveLength(0);
  });
});

describe("sampel 20 baris campuran — 0 baris ambigu diterapkan otomatis", () => {
  const products = [
    prod("a1", "A-001", "Vitamin C 500 mg 60 Tablet"),
    prod("a2", "A-002", "Zinc 50 mg"),
    prod("a3", "A-003", "Omega 3 Fish Oil 1000 mg"),
    prod("a4", "A-004", "Magnesium 250 mg"),
    prod("a5", "A-005", "Kolagen Beauty 30 Sachet"),
    prod("a6", "A-006", "Whey Protein Vanilla 1 kg"),
    prod("a7", "A-007", "Whey Protein Coklat 1 kg"),
    prod("a8", "A-008", "Biotin 5000 mcg"),
    prod("a9", "A-009", "Retinol Serum 30 ml"),
    prod("n1", "N-001", "Madu Murni 500 gr"),
    prod("n2", "N-002", "Teh Hijau Detox"),
    prod("n3", "N-003", "Propolis Brazil 30 ml"),
    prod("n4", "N-004", "Minyak Ikan Anak"),
    prod("m1", "M-001", "Multivitamin Anak"),
    prod("m2", "M-002", "Multivitamin Anak"),
    prod("s1", "S-001", "Calcium D3 600 mg"),
    prod("s2", "S-002", "Iron Folic Acid"),
    prod("s3", "S-003", "Vitamin E 400 IU"),
    prod("s4", "S-004", "Lutein 20 mg"),
  ];
  const rows: ShopeeRow[] = [
    // 8 pasti lewat SKU (beberapa dengan huruf berbeda & nama pemasaran panjang)
    row(2, "A-001", "[PROMO] Vitamin C 500mg 60 Tablet Original BPOM", [img("1a"), img("1b")]),
    row(3, "a-002", "ZINC 50MG Suplemen", [img("2")]),
    row(4, "A-003", "Omega 3 Fish Oil 1000 mg Isi 100", [img("3")]),
    row(5, "A-005", "Kolagen Beauty 30 Sachet", [img("5")]),
    row(6, "A-006", "Whey Protein Vanilla 1kg", [img("6")]),
    row(7, "A-007", "Whey Protein Coklat 1kg", [img("7")]),
    row(8, "A-008", "Biotin 5000mcg", [img("8")]),
    row(9, "A-009", "Retinol Serum 30ml", [img("9")]),
    // 4 pasti lewat nama persis satu produk (SKU kosong)
    row(10, "", "Madu Murni 500 Gram", [img("n1")]),
    row(11, "", "teh hijau detox", [img("n2")]),
    row(12, "", "Propolis Brazil 30 ml", [img("n3")]),
    row(13, "", "Minyak  Ikan, Anak", [img("n4")]),
    // 4 tinjau: nama ganda, SKU+nama berlawanan, URL dipakai 2 produk (2 baris)
    row(14, "", "Multivitamin Anak", [img("m")]),
    row(15, "A-004", "Kopi Susu Latte Gula Aren", [img("k")]),
    row(16, "S-001", "Calcium D3 600 mg", [img("shared")]),
    row(17, "S-002", "Iron Folic Acid", [img("shared")]),
    // 2 tidak cocok
    row(18, "Z-999", "Produk Aneh Banget", [img("x1")]),
    row(19, "", "Barang Tidak Ada Sama Sekali", [img("x2")]),
    // 2 URL rusak
    row(20, "S-003", "Vitamin E 400 IU", ["data:image/jpeg;base64,/9j/4AAQ"]),
    row(21, "S-004", "Lutein 20 mg", ["http://insecure.example.com/a.jpg"]),
  ];

  it("12 pasti, 4 tinjau, 2 tidak cocok, 2 URL rusak", () => {
    const plan = planShopeePhotos(rows, products);
    expect(plan.totalBaris).toBe(20);
    expect(plan.pasti).toHaveLength(12);
    expect(plan.tinjau).toHaveLength(4);
    expect(plan.galat.filter((g) => g.jenis === "tidak_cocok")).toHaveLength(2);
    expect(plan.galat.filter((g) => g.jenis === "url_rusak")).toHaveLength(2);
    expect(plan.dilewati).toHaveLength(0);
  });

  it("tepat 0 baris ambigu masuk 'pasti' dan tidak ada produk dipasang dua kali", () => {
    const plan = planShopeePhotos(rows, products);
    const ambiguous = new Set(["14", "15", "16", "17", "18", "19", "20", "21"]);
    expect(plan.pasti.filter((p) => ambiguous.has(p.key))).toHaveLength(0);
    expect(new Set(plan.pasti.map((p) => p.produk.id)).size).toBe(plan.pasti.length);
    // semua baris habis terbagi: tidak ada yang hilang
    const all = [...plan.pasti, ...plan.tinjau, ...plan.dilewati, ...plan.galat].map((x) => x.key).sort();
    expect(all).toEqual(rows.map((r) => String(r.row)).sort());
  });

  it("server menolak menerapkan baris ambigu tanpa pilihan eksplisit, bahkan bila browser memintanya", () => {
    const plan = planShopeePhotos(rows, products);
    const sneaky = [
      { key: "14", productId: "m1" }, // nama ganda
      { key: "15", productId: "a4" }, // SKU cocok, nama berlawanan
      { key: "16", productId: "s1" }, // URL dipakai dua produk
      { key: "18", productId: "a1" }, // tidak cocok
      { key: "20", productId: "s3" }, // URL rusak
    ];
    const { jobs, ditolak } = selectApplicable(plan, sneaky);
    expect(jobs).toHaveLength(0);
    expect(ditolak).toHaveLength(5);
  });

  it("semua 'pasti' lolos; produk salah dari browser ditolak", () => {
    const plan = planShopeePhotos(rows, products);
    const ok = selectApplicable(plan, plan.pasti.map((p) => ({ key: p.key, productId: p.produk.id, urls: p.urls })));
    expect(ok.jobs).toHaveLength(12);
    expect(ok.ditolak).toHaveLength(0);
    const wrong = selectApplicable(plan, [{ key: "2", productId: "a2" }]);
    expect(wrong.jobs).toHaveLength(0);
    const changed = selectApplicable(plan, [{ key: "2", productId: "a1", urls: ["https://evil.example.com/x.jpg"] }]);
    expect(changed.jobs).toHaveLength(0);
  });

  it("pilihan eksplisit pemilik pada kandidat diterapkan; non-kandidat ditolak", () => {
    const plan = planShopeePhotos(rows, products);
    const good = selectApplicable(plan, [{ key: "14", productId: "m2", pilihan: true }]);
    expect(good.jobs).toEqual([expect.objectContaining({ key: "14", productId: "m2", dasar: "pilihan" })]);
    const notCandidate = selectApplicable(plan, [{ key: "14", productId: "a1", pilihan: true }]);
    expect(notCandidate.jobs).toHaveLength(0);
    const twice = selectApplicable(plan, [
      { key: "14", productId: "m2", pilihan: true },
      { key: "16", productId: "m2", pilihan: true },
    ]);
    expect(twice.jobs).toHaveLength(1);
  });

  it("pilihan pada produk yang sudah punya foto ditolak di mode lewati", () => {
    const withPhoto = products.map((p) => (p.id === "m2" ? { ...p, images: ["https://x/y.webp"] } : p));
    const plan = planShopeePhotos(rows, withPhoto);
    expect(selectApplicable(plan, [{ key: "14", productId: "m2", pilihan: true }], "lewati").jobs).toHaveLength(0);
    expect(selectApplicable(plan, [{ key: "14", productId: "m2", pilihan: true }], "timpa").jobs).toHaveLength(1);
  });
});

describe("deteksi kolom & parsing ekspor Shopee", () => {
  it("header fleksibel: SKU / Nomor Referensi SKU / SKU Induk, Nama Produk, Gambar Sampul, Foto Produk n", () => {
    const c = detectShopeeColumns([
      "Kode Produk", "Nama Produk", "SKU Induk", "Nomor Referensi SKU", "Harga",
      "Foto Produk 2", "Gambar Sampul", "Foto Produk 1", "Gambar Variasi",
    ]);
    expect(c.name).toBe(1);
    expect(c.sku).toEqual([3, 2]); // referensi SKU lebih dulu, lalu SKU induk
    expect(c.images).toEqual([6, 7, 5]); // sampul, 1, 2; foto variasi tidak ikut
  });

  it("header berbahasa Inggris dan 'Image 1..'", () => {
    const c = detectShopeeColumns(["SKU", "Product Name", "Cover Image", "Image 1", "Image 2", "Image 10"]);
    expect(c).toEqual({ sku: [0], name: 1, images: [2, 3, 4, 5] });
  });

  it("header di baris ke-4 (ada baris judul di atasnya) tetap ditemukan; nomor baris mengikuti file", () => {
    const grid = [
      ["Mass Update"], ["petunjuk"], [],
      ["Nama Produk", "SKU Induk", "Nomor Referensi SKU", "Gambar Sampul", "Foto Produk 1"],
      ["Vitamin C", "", "VK-001", img("a"), img("b")],
      ["Zinc", "VK-002", "", `${img("c")}\n${img("d")}`, "-"],
      ["Hanya nama", "", "", "", ""],
    ];
    const { rows, info } = gridToShopeeRows(grid);
    expect(info.headerRow).toBe(4);
    expect(info.barisDiabaikan).toBe(1);
    expect(rows).toEqual([
      { row: 5, sku: "VK-001", name: "Vitamin C", urls: [img("a"), img("b")] },
      { row: 6, sku: "VK-002", name: "Zinc", urls: [img("c"), img("d")] },
    ]);
  });

  it("file tanpa kolom foto → galat berbahasa Indonesia", () => {
    expect(() => gridToShopeeRows([["SKU", "Nama Produk"], ["A", "B"]])).toThrow(/Kolom foto/);
  });

  it("extractUrls memisah beberapa URL dan membuang pengisi kosong", () => {
    expect(extractUrls("https://a/1.jpg, https://a/2.jpg;https://a/3.jpg")).toHaveLength(3);
    expect(extractUrls("-")).toEqual([]);
    expect(extractUrls(null)).toEqual([]);
  });
});
