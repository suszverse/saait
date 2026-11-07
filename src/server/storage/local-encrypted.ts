import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentStore } from "./index";

const KEY_RE = /^[0-9a-f-]{36}$/;

/**
 * File layout: 12-byte IV, 16-byte GCM tag, ciphertext. A wrong key or a
 * tampered file fails authentication instead of returning garbage.
 */
export function localEncryptedStore(dir: string, hexKey: string): DocumentStore {
  const key = Buffer.from(hexKey, "hex");
  if (key.length !== 32) throw new Error("Document key must be 32 bytes");
  const file = (k: string) => {
    if (!KEY_RE.test(k)) throw new Error("Bad document key");
    return path.join(dir, `${k}.bin`);
  };
  return {
    async put(bytes) {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const k = randomUUID();
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([c.update(bytes), c.final()]);
      await writeFile(file(k), Buffer.concat([iv, c.getAuthTag(), body]), { mode: 0o600 });
      return k;
    },
    async get(k) {
      const raw = await readFile(file(k));
      if (raw.length < 28) throw new Error("Document is truncated");
      const d = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12), { authTagLength: 16 });
      d.setAuthTag(raw.subarray(12, 28));
      return new Uint8Array(Buffer.concat([d.update(raw.subarray(28)), d.final()]));
    },
    async delete(k) {
      await rm(file(k), { force: true });
    },
  };
}
