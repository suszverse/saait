"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { submitReview, type ReviewState } from "./actions";

export function ReviewForm({ code }: { code: string }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(submitReview, { status: "idle" });

  if (state.status === "done") {
    return (
      <p role="status" className="rounded-card border border-line px-4 py-3.5 text-small font-semibold text-teal">
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-card border border-line px-4 py-3.5">
      <input type="hidden" name="code" value={code} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-small font-semibold">How was it?</legend>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="relative flex size-11 cursor-pointer items-center justify-center rounded-control border border-line text-label font-semibold has-checked:border-ink has-checked:bg-ink has-checked:text-ground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink">
              <input type="radio" name="rating" value={n} required className="absolute inset-0 cursor-pointer opacity-0" aria-label={`${n} ${n === 1 ? "star" : "stars"}`} />
              <span aria-hidden="true">{n}★</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 text-small">
        <span className="text-stone">Tell others what it was like (optional)</span>
        <textarea name="body" rows={3} maxLength={1000} className="rounded-control border border-line px-3 py-2 text-body" />
      </label>
      {state.status === "error" && (
        <p role="alert" className="text-small text-sindoor">
          {state.message}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Sending" : "Leave review"}
      </Button>
      <p className="text-meta text-stone">Free to leave. You get Rs 100 credit whatever you rate.</p>
    </form>
  );
}
