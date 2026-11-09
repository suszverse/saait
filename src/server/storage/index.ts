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

/** Portfolio uploads: photos the QR screener can decode plus the two clip containers phones export. */
export const PORTFOLIO_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"] as const;
export type PortfolioType = (typeof PORTFOLIO_TYPES)[number];

/** Major brands an MP4 exported by a phone or editor carries in its ftyp box. QuickTime uses `qt  `. */
const MP4_BRANDS = /^(isom|iso2|iso[3-6]|mp41|mp42|mp71|avc1|hvc1|dash|M4V |M4A |3gp[4-7]|f4v )$/;

/**
 * Same magic-byte sniffing as sniffType, for the portfolio's narrower list.
 * HEIC and PDF are not portfolio media; MP4 and MOV both start with an ftyp
 * box whose brand tells them apart.
 */
export function sniffPortfolioType(bytes: Uint8Array): PortfolioType | null {
  const image = sniffType(bytes);
  if (image === "image/jpeg" || image === "image/png" || image === "image/webp") return image;
  if (image) return null;
  const b = bytes;
  if (b.length >= 12 && String.fromCharCode(...b.slice(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (brand === "qt  ") return "video/quicktime";
    if (MP4_BRANDS.test(brand)) return "video/mp4";
  }
  return null;
}
