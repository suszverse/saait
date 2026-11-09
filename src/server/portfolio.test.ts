import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "./db/schema";
import { approveItem, holdItem, listPortfolio, PortfolioError, readClipDuration, removeItem, uploadPortfolioItem, type Deps } from "./portfolio";
import { defaultScreener, ManualOcr, QR_REASON, type OcrAdapter, type Screener } from "./screening";
import type { DocumentStore } from "./storage";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });

const fixture = (name: string) => readFile(path.join(import.meta.dirname, "screening", "fixtures", name));
const cleanOcr: OcrAdapter = { scan: async () => ({ result: "clean" }) };
const approveAll: Screener = { screen: async () => ({ verdict: "approve" }) };

/** In-memory store; the encryption is covered by the KYC tests. */
function memoryStore(): DocumentStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    put: async (bytes) => {
      const k = randomUUID();
      files.set(k, bytes);
      return k;
    },
    get: async (k) => files.get(k) ?? Promise.reject(new Error("missing")),
    delete: async (k) => void files.delete(k),
  };
}

const JPEG = (n = 64) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...randomBytes(n)]);
const PDF = () => new Uint8Array([...Buffer.from("%PDF-1.4\n"), ...randomBytes(64)]);

/** ISO box helper: 32-bit size, four-char type, payload. */
function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const body = Buffer.concat(payload.map((p) => Buffer.from(p)));
  const out = Buffer.alloc(8 + body.length);
  out.writeUInt32BE(out.length, 0);
  out.write(type, 4, "ascii");
  body.copy(out, 8);
  return new Uint8Array(out);
}
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return new Uint8Array(b);
};
/** Minimal MP4: ftyp + moov/mvhd (version 0) with the given length. */
function mp4(seconds: number, brand = "isom"): Uint8Array {
  const timescale = 1000;
  const mvhd = box("mvhd", u32(0), u32(0), u32(0), u32(timescale), u32(seconds * timescale), new Uint8Array(80));
  return Buffer.concat([box("ftyp", Buffer.from(brand), u32(0), Buffer.from("isom")), box("moov", mvhd)]);
}

let store: ReturnType<typeof memoryStore>;
let deps: Deps;
let owner: { id: string; role: string };
let providerId: string;
let operator: { id: string; role: string };
let stranger: { id: string; role: string };

async function expectPortfolio(p: Promise<unknown>, code: PortfolioError["code"]) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof PortfolioError && e.code === code);
}

/** Another agent may be resetting the test database; wait for the tables to come back. */
async function truncate(attempt = 0): Promise<void> {
  try {
    await client`truncate table users restart identity cascade`;
  } catch (e) {
    if (attempt < 20 && /does not exist/.test(String(e))) {
      await new Promise((r) => setTimeout(r, 500));
      return truncate(attempt + 1);
    }
    throw e;
  }
}

beforeEach(async () => {
  await truncate();
  store = memoryStore();
  deps = { db, store, screener: approveAll };
  const [u] = await db.insert(s.users).values({ phone: "+9779800000101", role: "provider" }).returning();
  owner = { id: u.id, role: u.role };
  const [p] = await db.insert(s.providerProfiles).values({ userId: u.id, slug: "anita", displayName: "anita", alias: "Crew T1-001" }).returning();
  providerId = p.id;
  const [op] = await db.insert(s.users).values({ phone: "+9779800000900", role: "operator" }).returning();
  operator = { id: op.id, role: op.role };
  const [c] = await db.insert(s.users).values({ phone: "+9779800000200", role: "client" }).returning();
  stranger = { id: c.id, role: c.role };
});
afterAll(async () => {
  await client.end();
});

describe("uploadPortfolioItem", () => {
  it("refuses the 13th photo for a New freelancer with the slot message", async () => {
    for (let i = 0; i < 12; i++) await uploadPortfolioItem(deps, providerId, { bytes: JPEG(), mime: "image/jpeg" });
    const p = uploadPortfolioItem(deps, providerId, { bytes: JPEG(), mime: "image/jpeg" });
    await expectPortfolio(p, "limit_reached");
    await expect(p).rejects.toThrow("You have used all 12 photo slots. Remove one to add another.");
  });

  it("does not count held photos against the limit", async () => {
    const holdAll: Screener = { screen: async () => ({ verdict: "hold", reason: "test" }) };
    for (let i = 0; i < 12; i++) await uploadPortfolioItem({ ...deps, screener: holdAll }, providerId, { bytes: JPEG(), mime: "image/jpeg" });
    const r = await uploadPortfolioItem(deps, providerId, { bytes: JPEG(), mime: "image/jpeg" });
    expect(r.status).toBe("approved");
  });

  it("holds a QR image with the reason and stores the row as held", async () => {
    const real = { ...deps, screener: defaultScreener({ ocr: cleanOcr }) };
    const r = await uploadPortfolioItem(real, providerId, { bytes: await fixture("qr-whatsapp.png"), mime: "image/png" });
    expect(r.status).toBe("held");
    expect(r.reason).toBe(QR_REASON);
    const [row] = await db.select().from(s.portfolioItems).where(eq(s.portfolioItems.id, r.id));
    expect(row.status).toBe("held");
    expect(row.mediaKind).toBe("photo");
    expect(row.bytes).toBeGreaterThan(0);
    expect(row.storageKey && store.files.has(row.storageKey)).toBe(true);
  });

  it("refuses a PDF whatever the browser calls it", async () => {
    await expectPortfolio(uploadPortfolioItem(deps, providerId, { bytes: PDF(), mime: "image/jpeg" }), "unsupported_type");
  });

  it("leaves a clean photo pending with manual OCR and approves it with a clean OCR stub", async () => {
    const bytes = await fixture("plain-photo.png");
    const pending = await uploadPortfolioItem({ ...deps, screener: defaultScreener({ ocr: ManualOcr }) }, providerId, { bytes, mime: "image/png" });
    expect(pending).toMatchObject({ status: "pending", reason: null });
    const approved = await uploadPortfolioItem({ ...deps, screener: defaultScreener({ ocr: cleanOcr }) }, providerId, { bytes, mime: "image/png" });
    expect(approved).toMatchObject({ status: "approved", reason: null });
  });

  it("refuses a photo over the size cap", async () => {
    const big = new Uint8Array(20 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff, 0xe0]);
    await expectPortfolio(uploadPortfolioItem(deps, providerId, { bytes: big, mime: "image/jpeg" }), "too_large");
  });

  it("reads the mvhd duration and refuses a 61 second clip", async () => {
    expect(readClipDuration(mp4(61))).toBe(61);
    await expectPortfolio(uploadPortfolioItem(deps, providerId, { bytes: mp4(61), mime: "video/mp4" }), "too_long");
  });

  it("accepts a 60 second clip as pending with its duration and bytes", async () => {
    const screener = defaultScreener({ ocr: cleanOcr });
    const bytes = mp4(60, "qt  ");
    const r = await uploadPortfolioItem({ ...deps, screener }, providerId, { bytes, mime: "video/quicktime" });
    expect(r.status).toBe("pending");
    const [row] = await db.select().from(s.portfolioItems).where(eq(s.portfolioItems.id, r.id));
    expect(row).toMatchObject({ mediaKind: "clip", durationSeconds: 60, bytes: bytes.byteLength });
  });

  it("refuses a clip whose header carries no mvhd", async () => {
    const bytes = box("ftyp", Buffer.from("isom"), u32(0), Buffer.from("isom"));
    await expectPortfolio(uploadPortfolioItem(deps, providerId, { bytes, mime: "video/mp4" }), "bad_file");
  });
});

describe("review and listing", () => {
  it("only operators approve or hold, and each decision is audited", async () => {
    const pendingScreener: Screener = { screen: async () => ({ verdict: "pending" }) };
    const r = await uploadPortfolioItem({ ...deps, screener: pendingScreener }, providerId, { bytes: JPEG(), mime: "image/jpeg" });
    await expectPortfolio(approveItem(db, owner, r.id), "forbidden");
    await expectPortfolio(holdItem(db, owner, r.id, "no"), "forbidden");
    await approveItem(db, operator, r.id);
    let [row] = await db.select().from(s.portfolioItems).where(eq(s.portfolioItems.id, r.id));
    expect(row.status).toBe("approved");
    await holdItem(db, operator, r.id, "Phone number on the banner.");
    [row] = await db.select().from(s.portfolioItems).where(eq(s.portfolioItems.id, r.id));
    expect(row).toMatchObject({ status: "held", reason: "Phone number on the banner." });
    const logs = await db.select().from(s.auditLog).where(eq(s.auditLog.subjectId, r.id));
    expect(logs.map((l) => l.action).sort()).toEqual(["portfolio.approved", "portfolio.held"]);
  });

  it("lists approved items to anyone and everything to the owner and operators", async () => {
    const a = await uploadPortfolioItem(deps, providerId, { bytes: JPEG(), mime: "image/jpeg" });
    const h = await uploadPortfolioItem({ ...deps, screener: { screen: async () => ({ verdict: "hold", reason: "x" }) } }, providerId, { bytes: JPEG(), mime: "image/jpeg" });
    expect((await listPortfolio(db, providerId)).map((i) => i.id)).toEqual([a.id]);
    expect((await listPortfolio(db, providerId, stranger)).map((i) => i.id)).toEqual([a.id]);
    expect((await listPortfolio(db, providerId, owner)).map((i) => i.id).sort()).toEqual([a.id, h.id].sort());
    expect((await listPortfolio(db, providerId, operator)).map((i) => i.id).sort()).toEqual([a.id, h.id].sort());
  });

  it("lets only the owner remove an item, and drops the stored file", async () => {
    const r = await uploadPortfolioItem(deps, providerId, { bytes: JPEG(), mime: "image/jpeg" });
    await expectPortfolio(removeItem({ db, store }, stranger, r.id), "forbidden");
    expect(store.files.size).toBe(1);
    await removeItem({ db, store }, owner, r.id);
    expect(store.files.size).toBe(0);
    expect(await db.select().from(s.portfolioItems)).toHaveLength(0);
  });
});
