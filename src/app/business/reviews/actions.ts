"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProviderKind } from "@/server/auth/guards";
import { db } from "@/server/db";
import { REPLY_BODY_MAX, ReviewError, reply } from "@/server/reviews";

const PATH = "/business/reviews";
const form = z.object({
  reviewId: z.string().uuid(),
  body: z.string().trim().min(1, "Write a reply first.").max(REPLY_BODY_MAX, `Keep your reply under ${REPLY_BODY_MAX} characters.`),
});

/** Posts the one reply to a review. Failures return to the page with the message shown under that review. */
export async function replyToReview(formData: FormData): Promise<void> {
  const { user } = await requireProviderKind("studio", PATH);
  const parsed = form.safeParse(Object.fromEntries(formData));
  const back = (id: string, message: string): never => redirect(`${PATH}?${new URLSearchParams({ review: id, error: message })}#review-${id}`);
  const rawId = formData.get("reviewId");
  const id = typeof rawId === "string" ? rawId : "";

  if (!parsed.success) return back(id, parsed.error.issues[0]?.message ?? "Please check your reply.");

  let failure: string | null = null;
  try {
    await reply(db(), user.id, parsed.data.reviewId, parsed.data.body);
  } catch (e) {
    if (e instanceof ReviewError) failure = e.message;
    else throw e;
  }
  revalidatePath(PATH);
  if (failure) return back(parsed.data.reviewId, failure);
  redirect(PATH);
}
