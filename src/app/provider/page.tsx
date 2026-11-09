import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { requireUser } from "@/server/auth/guards";
import { providerForUser } from "@/server/provider-account";

/**
 * /provider is now only a signpost: studios live under /business and
 * freelancers under /crew. Signed-in clients still start onboarding here.
 */
export default async function ProviderHome() {
  await connection();
  const user = await requireUser("/provider");
  if (user.role === "operator" || user.role === "admin") notFound();
  const p = await providerForUser(user.id);
  if (!p) redirect("/provider/onboarding");
  redirect(p.kind === "studio" ? "/business" : "/crew");
}
