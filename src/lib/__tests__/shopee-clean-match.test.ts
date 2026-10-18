import { describe, expect, it } from "vitest";
import { parseName, parseShopeeCleanCsv, planShopeeClean, score, type ShopeeItem, type VkProduct } from "../shopee-clean-match";

const item = (id: string, name: string, shared = 0, n = 3): ShopeeItem => ({
  itemId: id, name, sharedWithOthers: shared, images: Array.from({ length: n }, (_, i) => `https://cf.example/${id}-${i}`),
});
const vk = (id: string, name: string, extra: Partial<VkProduct> = {}): VkProduct => ({ id, sku: id, name, images: [], image_url: null, ...extra });

describe("parseName", () => {
  it("memisahkan dosis, ukuran, isi kemasan, rasa; satuan disamakan", () => {
    const p = parseName("NOW Foods Vitamin D3 5.000 IU 120 Softgel Rasa Vanila 1,5 kg 2 lbs");
    expect([...p.dose]).toEqual(["5000iu"]);
    expect([...p.count]).toEqual(["120softgel"]);
    expect([...p.size].sort()).toEqual(["1500g", "2lbs"]);
    expect([...p.flavor]).toEqual(["vanilla"]);
  });
  it("Vitamin C berbeda dengan Vitamin D; Kapsul = Capsules", () => {
    expect(parseName("Vitamin C 500mg").tokens.has("vitaminc")).toBe(true);
    expect(parseName("Vitamin C 500mg").tokens.has("vitamind")).toBe(false);
    expect([...parseName("60 Kapsul").count]).toEqual([...parseName("60 Capsules").count]);
  });
});

describe("score: dosis, ukuran, rasa harus sama persis", () => {
  const base = parseName("NOW Vitamin D3 1000IU 120 Softgels");
  it("dosis berbeda → gerbang menutup", () => expect(score(base, parseName("NOW Vitamin D3 5000IU 120 Softgel")).gate).toBe("dose"));
  it("isi kemasan berbeda → gerbang menutup", () => expect(score(base, parseName("NOW Vitamin D3 1000IU 240 Softgel")).gate).toBe("count"));
  it("ukuran berbeda → gerbang menutup", () => {
    expect(score(parseName("Whey Gold 2 lbs Chocolate"), parseName("Whey Gold 5 lbs Chocolate")).gate).toBe("size");
  });
  it("rasa berbeda → gerbang menutup", () => {
    expect(score(parseName("Whey Gold 2 lbs Chocolate"), parseName("Whey Gold 2 lbs Vanilla")).gate).toBe("flavor");
  });
  it("sama persis → lolos dengan keyakinan tinggi", () => {
    const s = score(base, parseName("NOW Foods Vitamin D3 1000 IU - 120 Softgel BPOM Original Suplemen"));
    expect(s.gate).toBe("ok");
    expect(s.confidence).toBeGreaterThanOrEqual(0.9);
  });
});

describe("planShopeeClean", () => {
  it("cocok jelas → auto, foto utama dulu, nama VitaminKu tidak berubah", () => {
    const products = [vk("A", "NOW Vitamin D3 1000IU 120 Softgels"), vk("B", "Blackmores Fish Oil 30 Capsules")];
    const items = [item("1", "NOW Foods Vitamin D3 1000 IU 120 Softgel BPOM"), item("2", "Blackmores FISH OIL 30 Kapsul Omega 3")];
    const plan = planShopeeClean(items, products);
    expect(plan.auto.map((a) => a.productId).sort()).toEqual(["A", "B"]);
    expect(plan.auto[0]!.productName).toBe(products.find((p) => p.id === plan.auto[0]!.productId)!.name);
    expect(plan.review).toHaveLength(0);
  });
  it("foto dipakai item lain → perlu ditinjau, bukan auto", () => {
    const plan = planShopeeClean([item("1", "NOW Vitamin D3 1000IU 120 Softgel", 2)], [vk("A", "NOW Vitamin D3 1000IU 120 Softgels")]);
    expect(plan.auto).toHaveLength(0);
    expect(plan.review[0]!.reason).toContain("foto dipakai item Shopee lain");
  });
  it("dua item Shopee sama persis untuk satu produk → perlu ditinjau", () => {
    const plan = planShopeeClean([item("1", "NOW Vitamin D3 1000IU 120 Softgel"), item("2", "NOW Vitamin D3 1000IU 120 Softgel")], [vk("A", "NOW Vitamin D3 1000IU 120 Softgels")]);
    expect(plan.auto).toHaveLength(0);
    expect(plan.review).toHaveLength(1);
  });
  it("judul Shopee tanpa rasa untuk dua varian rasa → keduanya ditinjau, tidak ditebak", () => {
    const plan = planShopeeClean(
      [item("1", "Gold Whey Protein 2 lbs")],
      [vk("C", "Gold Whey Protein 2 lbs Chocolate"), vk("V", "Gold Whey Protein 2 lbs Vanilla")],
    );
    expect(plan.auto).toHaveLength(0);
    expect(plan.review.map((r) => r.productId).sort()).toEqual(["C", "V"]);
  });
  it("dosis berbeda tidak pernah menjadi saran", () => {
    const plan = planShopeeClean([item("1", "NOW Vitamin D3 5000IU 120 Softgel")], [vk("A", "NOW Vitamin D3 1000IU 120 Softgels")]);
    expect(plan.auto).toHaveLength(0);
    expect(plan.review).toHaveLength(0);
    expect(plan.unmatched).toHaveLength(1);
  });
  it("produk yang sudah punya foto dilewati", () => {
    const plan = planShopeeClean([item("1", "NOW Vitamin D3 1000IU 120 Softgel")], [vk("A", "NOW Vitamin D3 1000IU 120 Softgels", { images: ["x"] })]);
    expect(plan.stats.skippedHasPhoto).toBe(1);
    expect(plan.auto).toHaveLength(0);
  });
});

describe("parseShopeeCleanCsv", () => {
  it("cover_image jadi foto utama, urutan images dijaga, tanpa duplikat, maks 9, bagian bersama terbaca", () => {
    const imgs = Array.from({ length: 12 }, (_, i) => `https://cf.example/i${i}`);
    const csv = [
      "shopee_item_id,parent_sku,match_name_only,category,excluded,n_images,cover_image,images,image_shared_with_other_items",
      `1,,"Whey, Gold 2 lbs",Cat,False,12,${imgs[3]},${imgs.join("|")},2`,
    ].join("\n");
    const { items } = parseShopeeCleanCsv(csv);
    expect(items[0]!.name).toBe("Whey, Gold 2 lbs");
    expect(items[0]!.images).toHaveLength(9);
    expect(items[0]!.images[0]).toBe(imgs[3]);
    expect(items[0]!.images.slice(1, 4)).toEqual([imgs[0], imgs[1], imgs[2]]);
    expect(new Set(items[0]!.images).size).toBe(9);
    expect(items[0]!.sharedWithOthers).toBe(2);
  });
});
