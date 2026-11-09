/**
 * Portfolio upload screening, system plan section on contact-screening and
 * docs/proposals/leakage-and-rewards.md section 11. A photo goes live only
 * when nothing in it can route a client around the booking page: a QR code
 * is a hold outright; printed text (a phone number on a banner, a wallet
 * handle in a watermark) needs OCR, which Phase 1 does not have, so the
 * `ManualOcr` adapter parks the photo as pending for an operator. Clips are
 * always pending: nothing here can watch a video.
 *
 * The real OCR adapter slots in behind `OcrAdapter` later without touching
 * the upload path.
 */
import { containsQr } from "./qr";

export { QrScanError } from "./qr";

export type MediaKind = "photo" | "clip";
export type Verdict = "approve" | "hold" | "pending";
export type ScreenInput = { bytes: Uint8Array; mime: string; mediaKind: MediaKind };
export type ScreenResult = { verdict: Verdict; reason?: string };

export interface Screener {
  screen(input: ScreenInput): Promise<ScreenResult>;
}

export type OcrResult = { result: "clean" } | { result: "flagged"; reason: string } | { result: "manual" };

/** Reads printed text out of an image. `manual` means nobody automated has looked. */
export interface OcrAdapter {
  scan(input: { bytes: Uint8Array; mime: string }): Promise<OcrResult>;
}

/** Phase 1: no OCR, so every photo without a QR code waits for an operator. */
export const ManualOcr: OcrAdapter = {
  async scan() {
    return { result: "manual" };
  },
};

export const QR_REASON = "This image has a QR code. Payment details stay on the booking page.";

export function defaultScreener({ ocr }: { ocr: OcrAdapter }): Screener {
  return {
    async screen({ bytes, mime, mediaKind }) {
      if (mediaKind === "clip") return { verdict: "pending" };
      const qr = await containsQr(bytes, mime);
      if (qr.found) return { verdict: "hold", reason: QR_REASON };
      const text = await ocr.scan({ bytes, mime });
      if (text.result === "clean") return { verdict: "approve" };
      if (text.result === "flagged") return { verdict: "hold", reason: text.reason };
      return { verdict: "pending" };
    },
  };
}
