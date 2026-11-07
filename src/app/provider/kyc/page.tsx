import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BottomNav, CheckIcon, ChevronLeftIcon, ClockIcon, StatusChip } from "@/components/ui";
import { requireRole } from "@/server/auth/guards";
import { desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/server/db";
import { currentDocuments, readiness } from "@/server/kyc";
import { providerForUser } from "@/server/provider-account";
import { maskPhone } from "@/server/sms";
import { IdentityForm, PanForm, PayoutForm, SubmitForm } from "./step-forms";
import { UploadTile } from "./upload-tile";

export const metadata: Metadata = { title: "Get verified" };

const STEPS = [
  { key: "phone", label: "Phone" },
  { key: "id", label: "ID" },
  { key: "pan", label: "PAN" },
  { key: "payout", label: "Payout" },
] as const;
type Step = "id" | "pan" | "payout" | "review";

const STATUS_NOTE: Record<string, { type: "under_review" | "rejected" | "verified" | "saait"; text: string }> = {
  submitted: { type: "under_review", text: "With our team. We check within two working days and send you an SMS." },
  under_review: { type: "under_review", text: "Our team is checking your documents now." },
  verified: { type: "verified", text: "You are verified. Your packages are live." },
  rejected: { type: "rejected", text: "We could not verify you. Fix what our team found and send again." },
  reverification_due: { type: "saait", text: "You changed a detail, so we need to check again. Send for verification when ready." },
};

export default async function KycPage({ searchParams }: PageProps<"/provider/kyc">) {
  await connection();
  const user = await requireRole(["provider"], "/provider/kyc");
  const p = await providerForUser(user.id);
  if (!p) redirect("/provider/onboarding");
  const sp = await searchParams;
  const r = await readiness(db(), p.id);
  const docs = new Set((await currentDocuments(db(), p.id)).map((d) => d.kind));
  const firstGap: Step = !(r.id && r.documents.id_front && r.documents.id_back && r.documents.selfie) ? "id" : !(r.pan && r.documents.pan_certificate) ? "pan" : !(r.payout && r.documents.payout_proof) ? "payout" : "review";
  const asked = typeof sp.step === "string" && ["id", "pan", "payout", "review"].includes(sp.step) ? (sp.step as Step) : firstGap;
  const step: Step = asked;
  const locked = p.kycStatus === "submitted" || p.kycStatus === "under_review";
  const doneIdx = { id: 1, pan: 2, payout: 3, review: 4 }[step];
  const note = STATUS_NOTE[p.kycStatus];
  const [last] = await db().select().from(s.kycReviews).where(eq(s.kycReviews.providerId, p.id)).orderBy(desc(s.kycReviews.createdAt)).limit(1);
  const reason = (p.kycStatus === "rejected" || p.kycStatus === "registered") && last?.note && last.decision !== "approved" ? last.note : null;

  return (
    <>
      <main className="mx-auto flex w-full max-w-form flex-1 flex-col pb-8">
        <header className="flex items-center gap-2 px-gutter pt-14 md:pt-10">
          <Link href="/provider" aria-label="Back" className="-ml-3 flex size-11 items-center justify-center rounded-control">
            <ChevronLeftIcon size={22} />
          </Link>
          <div className="flex flex-col">
            <h1 className="text-screen font-extrabold">Get verified</h1>
            <p className="text-meta text-stone">Clients only see verified providers</p>
          </div>
        </header>

        <ol className="mt-4 grid grid-cols-4 gap-1.5 px-gutter" aria-label="Verification steps">
          {STEPS.map((s, i) => {
            const state = i === 0 || i < doneIdx ? "done" : i === doneIdx ? "current" : "todo";
            return (
              <li key={s.key} className="flex flex-col gap-1.5" aria-current={state === "current" ? "step" : undefined}>
                <span className={`h-1 rounded-chip ${state === "done" ? "bg-teal" : state === "current" ? "bg-ink" : "bg-line"}`} />
                {i === 0 ? (
                  <span className="text-micro text-ink">{s.label}</span>
                ) : (
                  <Link href={`/provider/kyc?step=${s.key}`} className={`text-micro no-underline ${state === "todo" ? "text-stone" : "text-ink"}`}>
                    {s.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>

        {note && (
          <div className="mx-gutter mt-4 flex flex-col gap-2 rounded-card bg-tint px-4 py-3.5">
            <StatusChip type={note.type}>{p.kycStatus === "verified" ? "Verified" : p.kycStatus === "rejected" ? "Rejected" : "Under review"}</StatusChip>
            <p className="text-small">{note.text}</p>
            {reason && <p className="text-small font-semibold">Our team said: {reason}</p>}
          </div>
        )}
        {!note && reason && (
          <div className="mx-gutter mt-4 rounded-card bg-tint px-4 py-3.5 text-small">
            <span className="font-semibold">Please retake a photo.</span> Our team said: {reason}
          </div>
        )}

        <section className="flex flex-col gap-4 px-gutter pt-5">
          {step === "id" && (
            <>
              <div className="flex flex-col gap-1">
                <h2 className="text-heading font-bold">Step 2 of 4: your ID</h2>
                <p className="text-small text-stone">Citizenship card or passport. Our team checks it against your selfie within two working days. Only the team can see these files.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <UploadTile kind="id_front" label="Front" hint="Flat, no glare, all four corners" uploaded={docs.has("id_front")} locked={locked} />
                <UploadTile kind="id_back" label="Back" hint="Flat, no glare, all four corners" uploaded={docs.has("id_back")} locked={locked} />
                <UploadTile kind="selfie" label="Selfie" hint="Your face, in good light" uploaded={docs.has("selfie")} locked={locked} camera="user" />
              </div>
              <IdentityForm idType={p.passportNumber ? "passport" : "citizenship"} idNumber={p.citizenshipNumber ?? p.passportNumber ?? ""} locked={locked} />
            </>
          )}
          {step === "pan" && (
            <>
              <div className="flex flex-col gap-1">
                <h2 className="text-heading font-bold">Step 3 of 4: your PAN</h2>
                <p className="text-small text-stone">Your PAN certificate, in the same name as your ID.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <UploadTile kind="pan_certificate" label="PAN certificate" hint="The whole certificate, readable" uploaded={docs.has("pan_certificate")} locked={locked} />
              </div>
              <PanForm pan={p.panNumber ?? ""} vat={p.vatRegistered} locked={locked} />
            </>
          )}
          {step === "payout" && (
            <>
              <div className="flex flex-col gap-1">
                <h2 className="text-heading font-bold">Step 4 of 4: where deposits go</h2>
                <p className="text-small text-stone">A bank account or wallet in the same name as your ID or company.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <UploadTile kind="payout_proof" label="Proof of account" hint="Cheque, statement or wallet screen with your name" uploaded={docs.has("payout_proof")} locked={locked} />
              </div>
              <PayoutForm method={p.payoutMethod ?? ""} name={p.payoutAccountName ?? ""} number={p.payoutAccountNumber ?? ""} locked={locked} />
            </>
          )}
          {step === "review" && (
            <>
              <h2 className="text-heading font-bold">Check and send</h2>
              <ul className="flex flex-col gap-2 text-small">
                {[
                  ["Phone", true, maskPhone(user.phone)],
                  ["ID photos and number", r.id && r.documents.id_front && r.documents.id_back && r.documents.selfie, "id"],
                  ["PAN certificate and number", r.pan && r.documents.pan_certificate, "pan"],
                  ["Payout account and proof", r.payout && r.documents.payout_proof, "payout"],
                ].map(([label, ok, step]) => (
                  <li key={String(label)} className="flex h-11 items-center justify-between rounded-control border border-line px-3">
                    <span className="flex items-center gap-2">
                      {ok ? <CheckIcon size={16} className="text-teal" /> : <ClockIcon size={16} className="text-stone" />}
                      {label}
                    </span>
                    {!ok && (
                      <Link href={`/provider/kyc?step=${step}`} className="text-small font-semibold">
                        Add
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              {!locked && p.kycStatus !== "verified" && <SubmitForm ready={r.ready} />}
            </>
          )}

          <div className="flex flex-col gap-2 rounded-card bg-tint px-4 py-3.5">
            <p className="text-small font-bold">What verification unlocks</p>
            <ul className="flex flex-col gap-1.5 text-small">
              <li className="flex gap-2">
                <CheckIcon size={18} className="mt-px shrink-0 text-teal" />
                Your packages go live and clients can lock dates with you
              </li>
              <li className="flex gap-2">
                <CheckIcon size={18} className="mt-px shrink-0 text-teal" />
                Deposits are released to your verified account
              </li>
              <li className="flex gap-2">
                <ClockIcon size={18} className="mt-px shrink-0 text-stone" />
                Urgent job alerts after 3 completed bookings
              </li>
            </ul>
          </div>
        </section>
      </main>
      <BottomNav role="provider" active="account" />
    </>
  );
}
