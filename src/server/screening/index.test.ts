import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultScreener, ManualOcr, QR_REASON, type OcrAdapter } from "./index";

const fixture = (name: string) => readFile(path.join(import.meta.dirname, "fixtures", name));
const cleanOcr: OcrAdapter = { scan: async () => ({ result: "clean" }) };

describe("defaultScreener", () => {
  it("holds an image with a QR code and says why", async () => {
    const r = await defaultScreener({ ocr: cleanOcr }).screen({ bytes: await fixture("qr-whatsapp.png"), mime: "image/png", mediaKind: "photo" });
    expect(r).toEqual({ verdict: "hold", reason: QR_REASON });
  });

  it("leaves a clean photo pending without OCR", async () => {
    const r = await defaultScreener({ ocr: ManualOcr }).screen({ bytes: await fixture("plain-photo.png"), mime: "image/png", mediaKind: "photo" });
    expect(r).toEqual({ verdict: "pending" });
  });

  it("approves a clean photo when the OCR adapter says clean", async () => {
    const r = await defaultScreener({ ocr: cleanOcr }).screen({ bytes: await fixture("plain-photo.png"), mime: "image/png", mediaKind: "photo" });
    expect(r).toEqual({ verdict: "approve" });
  });

  it("holds a photo the OCR adapter flags, with its reason", async () => {
    const ocr: OcrAdapter = { scan: async () => ({ result: "flagged", reason: "Phone number printed on the banner." }) };
    const r = await defaultScreener({ ocr }).screen({ bytes: await fixture("plain-photo.png"), mime: "image/png", mediaKind: "photo" });
    expect(r).toEqual({ verdict: "hold", reason: "Phone number printed on the banner." });
  });

  it("never scans a clip; clips are always pending", async () => {
    let scanned = false;
    const ocr: OcrAdapter = { scan: async () => ((scanned = true), { result: "clean" }) };
    const r = await defaultScreener({ ocr }).screen({ bytes: new Uint8Array(32), mime: "video/mp4", mediaKind: "clip" });
    expect(r).toEqual({ verdict: "pending" });
    expect(scanned).toBe(false);
  });
});
