export type UploadFilePayload = { name: string; type: string; base64: string };

const MAX_EDGE = 1200;

export async function compressImage(file: Blob & { name?: string }): Promise<UploadFilePayload> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kompresi gambar gagal di perangkat ini.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob((result) => resolve(result), type, 0.82));
  // WebP first; older Safari falls back to PNG for unknown types, so use JPEG then.
  let blob = await encode("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg");
  if (!blob) throw new Error("Kompresi gambar gagal.");
  const type = blob.type === "image/webp" ? "image/webp" : "image/jpeg";

  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 1) binary += String.fromCharCode(buffer[i]!);

  return {
    name: (file.name ?? "foto").replace(/\.[^.]+$/, "") + (type === "image/webp" ? ".webp" : ".jpg"),
    type,
    base64: btoa(binary),
  };
}
