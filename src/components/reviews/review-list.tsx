import type { PublicReview } from "@/server/reviews";

const Stars = ({ rating }: { rating: number }) => (
  <span role="img" aria-label={`${rating} out of 5 stars`} className="text-label tracking-wider text-ink">
    {"★".repeat(rating)}
    <span className="text-line">{"★".repeat(5 - rating)}</span>
  </span>
);

/** Public reviews block for a provider profile. Server component. */
export function ReviewList({ reviews, count, average }: { reviews: PublicReview[]; count: number; average: number | null }) {
  return (
    <section aria-labelledby="reviews-h" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id="reviews-h" className="text-heading font-bold">
          {count > 0 && average ? `Reviews · ${count} · ${average.toFixed(1)}` : "Reviews"}
        </h2>
        <p className="text-meta text-stone">from completed bookings on Saait · free to leave, never paid for</p>
      </div>
      {reviews.length === 0 ? (
        <p className="text-small text-stone">No reviews yet.</p>
      ) : (
        <ul className="flex flex-col">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 border-t border-line py-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-small font-semibold">{r.author}</span>
                <Stars rating={r.rating} />
              </div>
              <p className="text-meta text-stone">{[r.eventMonth, r.packageName].filter(Boolean).join(" · ")}</p>
              {r.body && <p className="text-small">{r.body}</p>}
              {r.reply && (
                <p className="mt-1 border-l border-line pl-3 text-small text-stone">
                  <span className="font-semibold">Reply from the business: </span>
                  {r.reply}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
