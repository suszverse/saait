"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth/guards";
import { BookingError, confirmBalancePaid } from "@/server/bookings";
import { db } from "@/server/db";
import { leaveReview, ReviewError } from "@/server/reviews";

const codeSchema = z.string().regex(/^SA-\d{4,5}$/);

/**
 * The client marks the balance as handed to the provider. A refused confirm
 * (not theirs, wrong state) just lands back on the booking page, which shows
 * the state as it is; a repeat is a no-op.
 */
export async function markBalancePaid(form: FormData) {
  const code = codeSchema.parse(form.get("code"));
  const user = await requireUser(`/bookings/${code}`);
  try {
    await confirmBalancePaid({ db: db() }, user.id, code);
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
  }
  revalidatePath(`/bookings/${code}`);
  redirect(`/bookings/${code}`);
}

export type ReviewState = { status: "idle" | "done" | "error"; message?: string };

const reviewSchema = z.object({
  code: codeSchema,
  rating: z.coerce.number().int().min(1, "Choose 1 to 5 stars.").max(5, "Choose 1 to 5 stars."),
  body: z.string().max(1000, "Keep your review under 1000 characters.").optional(),
});

/** Leaves the client's review; every refusal comes back as inline text. */
export async function submitReview(_prev: ReviewState, form: FormData): Promise<ReviewState> {
  const parsed = reviewSchema.safeParse({
    code: form.get("code"),
    rating: form.get("rating") ?? "",
    body: (form.get("body") as string | null) ?? undefined,
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check your review and try again." };
  const { code, rating, body } = parsed.data;
  const user = await requireUser(`/bookings/${code}`);
  try {
    await leaveReview(db(), user.id, code, { rating, body });
  } catch (e) {
    if (!(e instanceof ReviewError)) throw e;
    if (e.code === "already_reviewed") return { status: "done", message: "You reviewed this booking." };
    return { status: "error", message: e.message };
  }
  revalidatePath(`/bookings/${code}`);
  // The form unmounts once the booking counts as reviewed, so the thanks line
  // travels in the URL and the page shows it.
  redirect(`/bookings/${code}?reviewed=1`);
}
