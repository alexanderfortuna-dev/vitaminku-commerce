// Pengurai Markdown sangat kecil untuk PANDUAN_OWNER.md (judul, daftar, paragraf, **tebal**, `kode`, [tautan](url)).
// Murni, tanpa HTML mentah: menghasilkan blok + potongan teks yang dirender sebagai elemen React biasa.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "h1"; parts: Inline[] }
  | { kind: "h2"; parts: Inline[] }
  | { kind: "p"; parts: Inline[] }
  | { kind: "ul"; items: Inline[][] }
  | { kind: "ol"; items: Inline[][] };

const SAFE_HREF = /^(https:\/\/|\/)/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push({ kind: "text", text: src.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "bold", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "code", text: m[2] });
    else if (m[3] !== undefined && m[4] !== undefined) {
      out.push(SAFE_HREF.test(m[4]) ? { kind: "link", text: m[3], href: m[4] } : { kind: "text", text: m[3] });
    }
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ kind: "text", text: src.slice(last) });
  return out;
}

export function parseMarkdown(md: string): Block[] {
  type ListBlock = Extract<Block, { kind: "ul" | "ol" }>;
  const blocks: Block[] = [];
  let list: ListBlock | undefined;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    const item = /^[-*]\s+(.*)$/.exec(line) ?? /^\d+\.\s+(.*)$/.exec(line);
    if (line && item) {
      const kind: ListBlock["kind"] = /^[-*]\s/.test(line) ? "ul" : "ol";
      let target = list;
      if (target === undefined || target.kind !== kind) {
        const fresh: ListBlock = kind === "ul" ? { kind: "ul", items: [] } : { kind: "ol", items: [] };
        blocks.push(fresh);
        target = fresh;
        list = fresh;
      }
      target.items.push(parseInline(item[1] ?? ""));
      continue;
    }
    list = undefined;
    if (!line) continue;
    if (line.startsWith("## ")) blocks.push({ kind: "h2", parts: parseInline(line.slice(3)) });
    else if (line.startsWith("# ")) blocks.push({ kind: "h1", parts: parseInline(line.slice(2)) });
    else blocks.push({ kind: "p", parts: parseInline(line) });
  }
  return blocks;
}
