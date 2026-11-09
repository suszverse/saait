import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Button, StatusChip } from "@/components/ui";
import { requireRole } from "@/server/auth/guards";
import { db, schema as s } from "@/server/db";
import { CHECKLIST, currentDocuments, duplicates, isReverification, queue } from "@/server/kyc";
import { maskPhone } from "@/server/sms";
import { openReview } from "../actions";
import { DecisionForm } from "../decision-form";
import { Queue } from "../queue";

export const metadata: Metadata = { title: "Review provider" };

const DOC_LABEL: Record<string, string> = {
  id_front: "ID front",
  id_back: "ID back",
  selfie: "Selfie",
  pan_certificate: "PAN card",
  payout_proof: "Payout proof",
};

export default async function ReviewPage({ params }: PageProps<"/admin/kyc/[id]">) {
  await connection();
  const { id } = await params;
  await requireRole(["operator", "admin"], `/admin/kyc/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [row] = await db()
    .select({ p: s.providerProfiles, u: s.users, city: s.cities.name })
    .from(s.providerProfiles)
    .innerJoin(s.users, eq(s.users.id, s.providerProfiles.userId))
    .leftJoin(s.cities, eq(s.cities.id, s.providerProfiles.homeCityId))
    .where(eq(s.providerProfiles.id, id));
  if (!row) notFound();
  const { p, u } = row;
  const [lastReview] = await db().select().from(s.kycReviews).where(eq(s.kycReviews.providerId, p.id)).orderBy(desc(s.kycReviews.createdAt)).limit(1);
  const [q, docs, dups, cats] = await Promise.all([
    queue(db()),
    currentDocuments(db(), p.id),
    duplicates(db(), p.id),
    db()
      .select({ name: s.serviceCategories.shortName })
      .from(s.providerCategories)
      .innerJoin(s.serviceCategories, eq(s.serviceCategories.id, s.providerCategories.categoryId))
      .where(eq(s.providerCategories.providerId, p.id)),
  ]);
  const inReview = p.kycStatus === "under_review";
  const canOpen = p.kycStatus === "submitted" || p.kycStatus === "reverification_due";
  const masked = (n: string | null) => (n ? `••••${n.replace(/\s|-/g, "").slice(-4)}` : "");
  const facts: [string, string, boolean?][] = [
    ["Name on ID (as given)", u.name ?? "Not given"],
    [p.passportNumber ? "Passport no." : "Citizenship no.", p.citizenshipNumber ?? p.passportNumber ?? "Not given"],
    ["PAN", p.panNumber ? `${p.panNumber} · ${p.vatRegistered ? "VAT registered · 1.5% TDS" : "not VAT registered · 15% TDS"}` : "Not given"],
    ["Name on payout account", p.payoutAccountName ? `${p.payoutAccountName} · ${p.payoutMethod} ${masked(p.payoutAccountNumber)}` : "Not given"],
    ["Duplicates", dups.length ? `Shares details with ${dups.map((d) => d.name).join(", ")}` : "None on phone, ID, PAN or payout", dups.length === 0],
  ];

  return (
    <main className="flex flex-col gap-5 px-gutter py-7 md:px-8">
      <h1 className="text-title font-extrabold">Verification queue</h1>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="lg:w-[360px] lg:shrink-0">
          <Queue q={q} selected={p.id} />
        </div>
        <section className="flex min-w-0 flex-1 flex-col gap-5 rounded-card border border-line bg-ground p-6" aria-labelledby="who">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <h2 id="who" className="text-screen font-extrabold">
                {p.displayName}
              </h2>
              <p className="text-small text-stone">
                {p.kind === "studio" ? "Studio" : "Freelancer"} · {row.city ?? "No city"} · {cats.map((c) => c.name).join(", ").toLowerCase() || "no services"} · phone {maskPhone(u.phone)}
                {isReverification(p) ? " · re-verification" : ""}
                {p.kycRejections ? ` · rejected ${p.kycRejections} time${p.kycRejections > 1 ? "s" : ""} before` : ""}
              </p>
            </div>
            <StatusChip type={p.kycStatus === "verified" ? "verified" : p.kycStatus === "rejected" ? "rejected" : "under_review"}>
              {inReview ? "Under review" : p.kycStatus.replace("_", " ")}
            </StatusChip>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {["id_front", "id_back", "selfie", "pan_certificate", "payout_proof"].map((k) => {
              const d = docs.find((x) => x.kind === k);
              return (
                <figure key={k} className="flex flex-col gap-1.5">
                  <figcaption className="text-meta font-semibold">{DOC_LABEL[k]}</figcaption>
                  {d ? (
                    d.mimeType === "application/pdf" ? (
                      <a href={`/admin/kyc/document/${d.id}`} className="flex aspect-[3/2] items-center justify-center rounded-control bg-tint text-small font-semibold">
                        Open PDF
                      </a>
                    ) : (
                      <a href={`/admin/kyc/document/${d.id}`} target="_blank" rel="noopener noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element -- private, operator-only document stream */}
                        <img src={`/admin/kyc/document/${d.id}`} alt={`${DOC_LABEL[k]} of ${p.displayName}`} className="aspect-[3/2] w-full rounded-control bg-tint object-cover" />
                      </a>
                    )
                  ) : (
                    <span className="flex aspect-[3/2] items-center justify-center rounded-control border border-dashed border-check-border text-meta text-stone">Missing</span>
                  )}
                </figure>
              );
            })}
          </div>

          <dl className="grid grid-cols-1 gap-x-5 gap-y-3 text-small sm:grid-cols-2 xl:grid-cols-3">
            {facts.map(([k, v, good]) => (
              <div key={k} className="flex flex-col">
                <dt className="text-stone">{k}</dt>
                <dd className={`font-semibold ${good === true ? "text-teal" : good === false ? "text-sindoor" : ""}`}>{v}</dd>
              </div>
            ))}
          </dl>

          {lastReview?.note && (
            <p className="rounded-control bg-tint px-3 py-2 text-meta">
              Last decision ({lastReview.decision.replace("_", " ")}): {lastReview.note}
            </p>
          )}

          {inReview ? (
            <DecisionForm providerId={p.id} checklist={CHECKLIST.map((c) => ({ key: c.key, label: c.label }))} />
          ) : canOpen ? (
            <form action={openReview} className="flex flex-col gap-2 border-t border-line pt-4">
              <input type="hidden" name="providerId" value={p.id} />
              <p className="text-small text-stone">Opening the review freezes the provider&apos;s details so what you approve is what you saw.</p>
              <Button type="submit" variant="secondary" className="self-start">
                Open review
              </Button>
            </form>
          ) : (
            <p className="border-t border-line pt-4 text-small text-stone">This provider is not waiting for review.</p>
          )}
        </section>
      </div>
    </main>
  );
}
