import { currentUser } from "@/server/auth/guards";
import { KycError, readDocument } from "@/server/kyc";
import { kycDeps } from "@/server/provider-account";

/**
 * Operator-only document stream. Every view is audited by readDocument.
 * Images are served inline for review; anything else is an attachment.
 * nosniff plus a sandboxed CSP means a disguised file can never run as a
 * page, even if it slipped past the upload sniffer.
 */
export async function GET(_req: Request, ctx: RouteContext<"/admin/kyc/document/[docId]">) {
  const { docId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(docId)) return new Response("Not found", { status: 404 });
  const user = await currentUser();
  if (!user || (user.role !== "operator" && user.role !== "admin")) return new Response("Not found", { status: 404 });
  try {
    const { bytes, mimeType } = await readDocument(kycDeps(), { id: user.id, role: user.role }, docId);
    const inline = mimeType.startsWith("image/");
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="document-${docId.slice(0, 8)}${mimeType === "application/pdf" ? ".pdf" : ""}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    if (e instanceof KycError) return new Response("Not found", { status: 404 });
    throw e;
  }
}
