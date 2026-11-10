import { env } from "@/env";
import { currentUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { PortfolioError, uploadPortfolioItem } from "@/server/portfolio";
import { providerForUser } from "@/server/provider-account";
import { defaultScreener, ManualOcr } from "@/server/screening";
import { localEncryptedStore } from "@/server/storage/local-encrypted";

/**
 * Portfolio upload. Multipart with one `file` field; the signed-in user's
 * own provider profile is the only possible target, so there is no id in
 * the request. The route reads the whole body into memory and leaves the
 * type, size, length and slot checks to uploadPortfolioItem. Route handlers
 * have no Next body limit (the 10 MB serverActions limit in next.config.ts
 * applies to server actions only), so the server-side MAX_*_BYTES are what
 * bound a request here.
 */
const STATUS: Record<PortfolioError["code"], number> = {
  too_large: 413,
  limit_reached: 409,
  unsupported_type: 422,
  bad_file: 422,
  too_long: 422,
  not_found: 400,
  forbidden: 400,
};

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to upload" }, { status: 401 });
  const profile = await providerForUser(user.id);
  if (!profile) return Response.json({ error: "No provider profile" }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Send multipart form data with a file field" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Missing file field" }, { status: 400 });

  try {
    const result = await uploadPortfolioItem(
      {
        db: db(),
        store: localEncryptedStore(env().DOCUMENT_DIR, env().DOCUMENT_KEY),
        screener: defaultScreener({ ocr: ManualOcr }),
      },
      profile.id,
      { bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type, filename: file.name },
    );
    return Response.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof PortfolioError) return Response.json({ error: e.message, code: e.code }, { status: STATUS[e.code] });
    throw e;
  }
}
