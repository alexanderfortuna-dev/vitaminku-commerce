import {
  Activity,
  Baby,
  Brain,
  Dumbbell,
  Heart,
  Leaf,
  Moon,
  Package,
  Pill,
  Shield,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";

/**
 * The product database is the single source of truth for classification.
 * Everything below is only a mapping layer between the real `category` /
 * `subcategory` values and the navigation the customer sees.
 */
export interface Category {
  slug: string;
  /** Exact `category` value stored in the database. */
  category: string;
  name: string;
  icon: LucideIcon;
  blurb: string;
  subcategories: string[];
}

export const CATEGORIES: Category[] = [
  {
    slug: "vitamin-suplemen",
    category: "Vitamin & Suplemen",
    name: "Vitamin & Suplemen",
    icon: Pill,
    blurb: "Vitamin, mineral, dan suplemen harian",
    subcategories: [
      "Multivitamin",
      "Vitamin Tunggal",
      "Mineral",
      "Imunitas",
      "Omega & Minyak Ikan",
      "Antioksidan & Anti-Aging",
      "Beauty & Skincare",
      "Herbal & Botanical",
      "Pencernaan",
      "Sendi & Tulang",
      "Tidur & Kognitif",
      "Organ Support",
      "Ibu & Anak",
      "Suplemen Umum",
    ],
  },
  {
    slug: "sport-nutrition",
    category: "Sport Nutrition",
    name: "Sport Nutrition",
    icon: Dumbbell,
    blurb: "Protein, creatine, dan performa latihan",
    subcategories: [
      "Protein",
      "Gainer",
      "Creatine",
      "Asam Amino",
      "Pre-Workout",
      "Energy & Bar",
      "Hidrasi & Elektrolit",
      "Fat Burner & Diet",
      "Performance & Testosterone",
    ],
  },
  {
    slug: "meal-replacement-superfood",
    category: "Meal Replacement & Superfood",
    name: "Meal Replacement & Superfood",
    icon: Leaf,
    blurb: "Pengganti makan, serat, dan superfood",
    subcategories: ["Meal Replacement", "Serat & Detoks"],
  },
  {
    slug: "minuman-sachet-kesehatan",
    category: "Minuman & Sachet Kesehatan",
    name: "Minuman & Sachet Kesehatan",
    icon: Sun,
    blurb: "Minuman siap konsumsi & serbuk sachet",
    subcategories: ["Serbuk & Sachet", "Minuman Siap Konsumsi"],
  },
  {
    slug: "aksesoris-olahraga",
    category: "Aksesoris Olahraga",
    name: "Aksesoris Olahraga",
    icon: Activity,
    blurb: "Shaker, belt, alat latihan, tas",
    subcategories: [
      "Shaker & Botol",
      "Belt & Support",
      "Alat Latihan",
      "Tas",
      "Apparel & Footwear",
    ],
  },
  {
    slug: "lain-lain",
    category: "Lain-lain (Non-Suplemen)",
    name: "Lain-lain",
    icon: Package,
    blurb: "Produk non-suplemen lainnya",
    subcategories: ["Otomotif & Gadget"],
  },
];

export interface Goal {
  slug: string;
  name: string;
  icon: LucideIcon;
  /** Exact `subcategory` values this goal maps to. */
  subcategories: string[];
  description: string;
}

export const GOALS: Goal[] = [
  {
    slug: "tingkatkan-imun",
    name: "Tingkatkan Imun",
    icon: Shield,
    subcategories: ["Imunitas", "Vitamin Tunggal"],
    description: "Vitamin untuk membantu menjaga daya tahan tubuh.",
  },
  {
    slug: "otot-fitness",
    name: "Otot & Fitness",
    icon: Dumbbell,
    subcategories: ["Protein", "Creatine", "Asam Amino"],
    description: "Protein, creatine, dan asam amino untuk latihan.",
  },
  {
    slug: "tidur-lebih-baik",
    name: "Tidur Lebih Baik",
    icon: Moon,
    subcategories: ["Tidur & Kognitif"],
    description: "Produk untuk kebutuhan tidur dan relaksasi.",
  },
  {
    slug: "kulit-glowing",
    name: "Kulit Glowing",
    icon: Sparkles,
    subcategories: ["Beauty & Skincare"],
    description: "Perawatan kulit dari dalam.",
  },
  {
    slug: "energi-harian",
    name: "Energi Harian",
    icon: Sun,
    subcategories: ["Multivitamin", "Pre-Workout", "Energy & Bar"],
    description: "Multivitamin dan produk penunjang energi harian.",
  },
  {
    slug: "jantung-omega",
    name: "Omega & Jantung",
    icon: Heart,
    subcategories: ["Omega & Minyak Ikan"],
    description: "Minyak ikan dan omega untuk kebutuhan harian.",
  },
  {
    slug: "fokus-otak",
    name: "Fokus & Otak",
    icon: Brain,
    subcategories: ["Tidur & Kognitif", "Omega & Minyak Ikan"],
    description: "Produk untuk kebutuhan fokus dan kognitif.",
  },
  {
    slug: "ibu-anak",
    name: "Ibu & Anak",
    icon: Baby,
    subcategories: ["Ibu & Anak"],
    description: "Produk untuk kebutuhan ibu dan anak.",
  },
];

export const TRUST_POINTS = [
  { title: "100% Original", desc: "Produk asli & tersegel" },
  { title: "Pembayaran Aman", desc: "Diproses di halaman bayar" },
  { title: "Pengiriman", desc: "Opsi tampil saat bayar" },
  { title: "Bantuan", desc: "Email pada jam kerja" },
];

/** Popular searches point at real categories/subcategories in the database. */
export const POPULAR_SEARCHES = [
  "Protein",
  "Creatine",
  "Multivitamin",
  "Vitamin C",
  "Omega",
  "Shaker",
];

export function getCategory(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function getGoal(slug: string) {
  return GOALS.find((g) => g.slug === slug);
}

export function brandSlug(brand: string) {
  return encodeURIComponent(brand);
}
