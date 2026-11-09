/**
 * Server-side QR detection for uploaded images, system plan section on
 * contact-screening. Providers may not smuggle a phone number or payment
 * link past the chat by printing a QR code into a portfolio or document
 * image, so every upload is decoded here before it is accepted.
 *
 * sharp turns JPEG, PNG or WebP into raw RGBA; jsQR does the detection.
 */
import jsQR from "jsqr";
import sharp from "sharp";

export class QrScanError extends Error {
  constructor(
    public readonly code: "unsupported_mime" | "bad_image",
    message: string,
  ) {
    super(message);
  }
}

export const SCANNABLE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ScannableMime = (typeof SCANNABLE_MIMES)[number];

/** Larger images are scaled down first; jsQR is O(pixels) and QR modules survive the resize. */
const MAX_EDGE = 1600;

export type QrScanResult = { found: boolean; text?: string };

export async function containsQr(bytes: Uint8Array, mime: string): Promise<QrScanResult> {
  if (!(SCANNABLE_MIMES as readonly string[]).includes(mime)) {
    throw new QrScanError("unsupported_mime", `cannot scan ${mime} for QR codes`);
  }
  let data: Buffer;
  let width: number;
  let height: number;
  try {
    const out = await sharp(Buffer.from(bytes), { failOn: "error" })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    data = out.data;
    width = out.info.width;
    height = out.info.height;
  } catch (e) {
    throw new QrScanError("bad_image", `could not decode ${mime}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const code = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width, height);
  return code ? { found: true, text: code.data } : { found: false };
}
