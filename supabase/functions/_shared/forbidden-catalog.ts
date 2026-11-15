// Satu daftar zat yang tidak boleh dijual, dicari, atau direkomendasikan.
// Pola memakai regex Postgres (~*). \m dan \M (batas kata) menjadi \b di JavaScript.
// Harus sama persis dengan INSERT product_blocklist di drizzle/migrations (diuji paritasnya).
// Dukungan testosteron alami (testo, tribulus, tongkat ali) TIDAK ada di sini: keputusan owner.
export interface BlocklistTerm {
  pattern: string;
  reason: string;
}

export const CATALOG_BLOCKLIST: readonly BlocklistTerm[] = [
  { pattern: String.raw`\mobat keras\M`, reason: "Obat keras / resep dokter" },
  { pattern: String.raw`\mresep dokter\M`, reason: "Obat keras / resep dokter" },
  { pattern: String.raw`\msarms?\M`, reason: "SARMs" },
  { pattern: "ostarine", reason: "SARMs" },
  { pattern: "enobosarm", reason: "SARMs" },
  { pattern: "ligandrol", reason: "SARMs" },
  { pattern: "lgd-?4033", reason: "SARMs" },
  { pattern: "rad-?140", reason: "SARMs" },
  { pattern: "testolone", reason: "SARMs" },
  { pattern: "cardarine", reason: "SARMs" },
  { pattern: "gw-?501516", reason: "SARMs" },
  { pattern: "andarine", reason: "SARMs" },
  { pattern: String.raw`\myk-?11\M`, reason: "SARMs" },
  { pattern: "ibutamoren", reason: "SARMs" },
  { pattern: String.raw`\mmk-?677\M`, reason: "SARMs" },
  { pattern: "modafinil", reason: "Modafinil" },
  { pattern: "armodafinil", reason: "Modafinil" },
  { pattern: "yohimb", reason: "Yohimbe / yohimbine" },
  { pattern: String.raw`\mdhea\M`, reason: "DHEA" },
  { pattern: "dehydroepiandrosterone", reason: "DHEA" },
  { pattern: "prasterone", reason: "DHEA" },
  // Zat yang sebelumnya hanya ada di salah satu daftar kode.
  { pattern: "clenbuterol", reason: "Clenbuterol" },
  { pattern: String.raw`steroid\s*anabolik`, reason: "Steroid anabolik" },
  { pattern: "mk-?2866", reason: "SARMs" },
  { pattern: "trenbolone", reason: "Steroid anabolik" },
  { pattern: "nandrolone", reason: "Steroid anabolik" },
  { pattern: String.raw`\mdeca\M`, reason: "Steroid anabolik" },
  { pattern: "dianabol", reason: "Steroid anabolik" },
  { pattern: "oxandrolone", reason: "Steroid anabolik" },
  { pattern: String.raw`\manavar\M`, reason: "Steroid anabolik" },
  { pattern: String.raw`\mwinstrol\M`, reason: "Steroid anabolik" },
  { pattern: "stanozolol", reason: "Steroid anabolik" },
  { pattern: String.raw`\mhgh\M`, reason: "Hormon pertumbuhan" },
  { pattern: String.raw`growth\s*hormone`, reason: "Hormon pertumbuhan" },
  { pattern: "bpc-?157", reason: "Peptida terlarang" },
  { pattern: String.raw`sibutramin\w*`, reason: "Sibutramine" },
  { pattern: String.raw`efedrin\w*`, reason: "Efedrin" },
  { pattern: String.raw`ephedr\w*`, reason: "Ephedrine" },
  { pattern: String.raw`\mdnp\M`, reason: "DNP" },
  { pattern: String.raw`\mdmaa\M`, reason: "DMAA" },
  { pattern: "phentermine", reason: "Phentermine" },
  { pattern: "sildenafil", reason: "Obat keras" },
  { pattern: "tadalafil", reason: "Obat keras" },
  { pattern: String.raw`\mviagra\M`, reason: "Obat keras" },
  { pattern: String.raw`\mcialis\M`, reason: "Obat keras" },
];

export function catalogPatternToRegExp(pattern: string): RegExp {
  return new RegExp(pattern.replace(/\\m/g, "\\b").replace(/\\M/g, "\\b"), "i");
}

const COMPILED = CATALOG_BLOCKLIST.map((row) => catalogPatternToRegExp(row.pattern));

export function isCatalogForbidden(text: string): boolean {
  return COMPILED.some((re) => re.test(text));
}
