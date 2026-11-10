import type { Metadata } from "next";
import { connection } from "next/server";
import { Button } from "@/components/ui";
import { requireProviderKind } from "@/server/auth/guards";
import { db } from "@/server/db";
import { REPLY_BODY_MAX, listReviewsFor } from "@/server/reviews";
import { replyToReview } from "./actions";

export const metadata: Metadata = { title: "Reviews" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Stars({ rating }: { rating: number }) {
  return (
    <span role="img" aria-label={`${rating} out of 5 stars`} className="text-body font-bold tracking-wide text-ink">
      {"★".repeat(rating)}
      <span className="text-line">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

/** Business reviews: read what clients wrote and answer each once. */
export default async function BusinessReviews({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const sp = await searchParams;
  const { profile } = await requireProviderKind("studio", "/business/reviews");
  const reviews = await listReviewsFor(db(), profile.id, { limit: 50 });

  const count = reviews.length;
  const average = count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;
  const errorFor = one(sp.review);
  const error = one(sp.error);

  return (
    <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-gutter pt-6 pb-8 md:px-gutter-desktop md:pt-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-profile font-extrabold">Reviews</h1>
        <p className="text-small text-stone">Reviews are free to leave and free to show. You can reply once to each.</p>
      </header>

      {count === 0 ? (
        <p className="rounded-card border border-line p-4 text-body text-stone">No reviews yet. Clients can review a booking after it is completed.</p>
      ) : (
        <>
          <p className="flex items-baseline gap-2">
            <span className="text-profile font-extrabold">{average.toFixed(1)}</span>
            <Stars rating={Math.round(average)} />
            <span className="text-small text-stone">
              {count} {count === 1 ? "review" : "reviews"}
            </span>
          </p>
          <ul className="flex flex-col gap-4">
            {reviews.map((r) => (
              <li key={r.id} id={`review-${r.id}`} className="flex flex-col gap-3 rounded-card border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-body font-bold">{r.author}</span>
                  <Stars rating={r.rating} />
                </div>
                <p className="text-meta text-stone">{[r.eventMonth, r.packageName].filter(Boolean).join(" · ")}</p>
                {r.body ? <p className="text-body whitespace-pre-line">{r.body}</p> : null}

                {r.reply !== null ? (
                  <div className="flex flex-col gap-1 rounded-control border border-line p-3">
                    <p className="text-meta font-semibold text-stone">Your reply</p>
                    <p className="text-body whitespace-pre-line">{r.reply}</p>
                  </div>
                ) : (
                  <form action={replyToReview} className="flex flex-col gap-2">
                    <input type="hidden" name="reviewId" value={r.id} />
                    <label htmlFor={`reply-${r.id}`} className="text-small font-semibold">
                      Reply
                    </label>
                    <textarea
                      id={`reply-${r.id}`}
                      name="body"
                      rows={3}
                      required
                      maxLength={REPLY_BODY_MAX}
                      aria-describedby={errorFor === r.id && error ? `reply-error-${r.id}` : undefined}
                      className="w-full min-w-0 rounded-button border border-line bg-ground p-3.5 text-body outline-none focus:border-ink focus:ring-1 focus:ring-inset focus:ring-ink"
                    />
                    {errorFor === r.id && error ? (
                      <p id={`reply-error-${r.id}`} role="alert" className="text-small font-semibold">
                        {error}
                      </p>
                    ) : null}
                    <p className="text-meta text-stone">Up to {REPLY_BODY_MAX} characters. You cannot edit a reply once sent.</p>
                    <Button type="submit" variant="secondary" size="md" className="self-start">
                      Reply
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
