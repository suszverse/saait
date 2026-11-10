"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProviderKind } from "@/server/auth/guards";
import { complete, CrewError, markNoShow } from "@/server/crew/jobs";
import { db } from "@/server/db";
import { ReviewError, reviewCrew } from "@/server/reviews";

const HERE = "/business/crew/jobs";
const jobId = z.string().uuid();

/** Back to the list with a notice or an inline error pinned to one job. */
function back(params: Record<string, string>): never {
  redirect(`${HERE}?${new URLSearchParams(params).toString()}`);
}

async function run(formData: FormData, op: (userId: string, id: string) => Promise<unknown>, done: string): Promise<void> {
  const { user } = await requireProviderKind("studio", HERE);
  const id = jobId.safeParse(formData.get("jobId"));
  if (!id.success) back({ error: "That job could not be found." });
  let failure: string | null = null;
  try {
    await op(user.id, id.data);
  } catch (e) {
    if (e instanceof CrewError) failure = e.message;
    else throw e;
  }
  // redirect() throws, so it stays outside the try block.
  if (failure) back({ job: id.data, error: failure });
  back({ job: id.data, done });
}

export async function completeJob(formData: FormData): Promise<void> {
  await run(formData, (u, id) => complete(db(), u, id), "completed");
}

export async function noShowJob(formData: FormData): Promise<void> {
  await run(formData, (u, id) => markNoShow(db(), u, id), "no_show");
}

const review = z.object({
  rating: z.coerce.number().int().min(1, "Pick a rating from 1 to 5.").max(5, "Pick a rating from 1 to 5."),
  body: z.string().max(1000, "Keep your review under 1000 characters.").optional(),
});

export async function reviewJob(formData: FormData): Promise<void> {
  const { user } = await requireProviderKind("studio", HERE);
  const id = jobId.safeParse(formData.get("jobId"));
  if (!id.success) back({ error: "That job could not be found." });
  const parsed = review.safeParse({ rating: formData.get("rating") ?? "", body: formData.get("body") ?? undefined });
  if (!parsed.success) back({ job: id.data, error: parsed.error.issues[0]?.message ?? "Please check the review." });

  let failure: string | null = null;
  try {
    await reviewCrew(db(), user.id, id.data, parsed.data);
  } catch (e) {
    if (e instanceof ReviewError && e.code === "already_reviewed") back({ job: id.data, done: "reviewed" });
    else if (e instanceof ReviewError) failure = e.message;
    else throw e;
  }
  if (failure) back({ job: id.data, error: failure });
  back({ job: id.data, done: "reviewed" });
}
