import { env } from "@/env";
import { currentUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { readItem } from "@/server/portfolio";
import { sniffPortfolioType } from "@/server/storage";
import { localEncryptedStore } from "@/server/storage/local-encrypted";

/**
 * Portfolio media stream. Approved items are public and cacheable; pending
 * and held items are visible only to the owner and operators, and anything
 * else answers 404 so the route never confirms an item exists. Phase 1 rows
 * that carry a url and no storage key are redirected to that url. The
 * content type comes from the bytes, not from a stored label, and nosniff
 * plus a sandboxed CSP keep a disguised file from running as a page.
 */
export async function GET(_req: Request, ctx: RouteContext<"/media/[itemId]">) {
  const { itemId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(itemId)) return new Response("Not found", { status: 404 });

  const item = await readItem(db(), itemId);
  if (!item) return new Response("Not found", { status: 404 });

  const approved = item.status === "approved";
  if (!approved) {
    const user = await currentUser();
    const allowed = user !== null && (user.id === item.ownerId || user.role === "operator" || user.role === "admin");
    if (!allowed) return new Response("Not found", { status: 404 });
  }

  if (!item.storageKey) {
    if (item.url) return Response.redirect(item.url, 302);
    return new Response("Not found", { status: 404 });
  }

  const bytes = await localEncryptedStore(env().DOCUMENT_DIR, env().DOCUMENT_KEY).get(item.storageKey);
  const mimeType = sniffPortfolioType(bytes) ?? "application/octet-stream";
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
      "Cache-Control": approved ? "public, max-age=86400" : "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
