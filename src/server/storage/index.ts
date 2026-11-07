/**
 * Private document storage behind one interface. Phase 1 writes AES-256-GCM
 * encrypted files to local disk; an S3-compatible store with the same
 * encryption slots in later. Keys are opaque and never public URLs.
 */
export interface DocumentStore {
  put(bytes: Uint8Array): Promise<string>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

export const ALLOWED_DOCUMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"] as const;
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

/**
 * Sniff the real type from magic bytes; never trust the browser's label.
 * Sniffing cannot rule out polyglots, so documents are only ever served to
 * operators with nosniff and as attachments (src/app/admin/kyc/document).
 */
export function sniffType(bytes: Uint8Array): (typeof ALLOWED_DOCUMENT_TYPES)[number] | null {
  const b = bytes;
  // JPEG: SOI then a real marker (APP0/APP1/APP2/DQT/APP13/APP14), not just three bytes.
  if (b.length >= 64 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && [0xe0, 0xe1, 0xe2, 0xdb, 0xed, 0xee].includes(b[3])) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  if (b.length >= 12 && String.fromCharCode(...b.slice(4, 8)) === "ftyp" && /^(heic|heix|mif1|heif)$/.test(String.fromCharCode(...b.slice(8, 12)))) return "image/heic";
  if (b.length >= 5 && String.fromCharCode(...b.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}
