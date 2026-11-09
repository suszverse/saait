import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { containsQr, QrScanError } from "./qr";

const fixture = (name: string) => readFile(path.join(import.meta.dirname, "fixtures", name));

async function expectScan(p: Promise<unknown>, code: QrScanError["code"]) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof QrScanError && e.code === code);
}

describe("containsQr", () => {
  it("finds a QR code and returns its text", async () => {
    const r = await containsQr(await fixture("qr-whatsapp.png"), "image/png");
    expect(r).toEqual({ found: true, text: "https://wa.me/9779812344471" });
  });

  it("reports no QR on a plain photo", async () => {
    expect(await containsQr(await fixture("plain-photo.png"), "image/png")).toEqual({ found: false });
  });

  it("still finds the QR after re-encoding as JPEG and WebP", async () => {
    const { default: sharp } = await import("sharp");
    const png = await fixture("qr-whatsapp.png");
    const jpeg = await sharp(png).jpeg().toBuffer();
    const webp = await sharp(png).webp().toBuffer();
    expect((await containsQr(jpeg, "image/jpeg")).text).toBe("https://wa.me/9779812344471");
    expect((await containsQr(webp, "image/webp")).text).toBe("https://wa.me/9779812344471");
  });

  it("rejects a corrupt buffer", async () => {
    await expectScan(containsQr(new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...randomBytes(64)]), "image/png"), "bad_image");
  });

  it("rejects an unsupported mime type", async () => {
    await expectScan(containsQr(await fixture("plain-photo.png"), "application/pdf"), "unsupported_mime");
  });
});
