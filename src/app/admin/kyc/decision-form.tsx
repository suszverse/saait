"use client";

import { startTransition, useActionState, useState } from "react";
import { CheckIcon } from "@/components/ui";
import { decideAction, type DecisionState } from "./actions";

/** Approve needs all six checks (enforced again on the server); reject needs a note. */
export function DecisionForm({ providerId, checklist }: { providerId: string; checklist: { key: string; label: string }[] }) {
  const [state, action, pending] = useActionState(decideAction, {} as DecisionState);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const done = checklist.filter((c) => checked[c.key]).length;
  const all = done === checklist.length;
  return (
    <form
      // Submit by hand so React does not reset the form: ticks and the note
      // stay as they were if the server refuses the decision.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => action(fd));
      }}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="providerId" value={providerId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label font-bold">Checklist</legend>
        {checklist.map((c) => {
          const on = !!checked[c.key];
          return (
            <label key={c.key} className="flex h-11 cursor-pointer items-center gap-2.5 rounded-control border border-line bg-ground px-3 text-small has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink">
              <input type="checkbox" name={`check_${c.key}`} checked={on} onChange={(e) => setChecked((s) => ({ ...s, [c.key]: e.target.checked }))} className="sr-only" />
              <span aria-hidden="true" className={`flex size-5 shrink-0 items-center justify-center rounded-[6px] border-2 text-on-accent ${on ? "border-ink bg-ink" : "border-check-border bg-ground"}`}>
                {on && <CheckIcon size={12} strokeWidth={3.5} />}
              </span>
              {c.label}
            </label>
          );
        })}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="note" className="text-small font-semibold">
          Note to provider (sent on rejection)
        </label>
        <textarea id="note" name="note" rows={2} className="resize-none rounded-button border border-line bg-ground px-3.5 py-3 text-label leading-field focus:border-ink focus:ring-1 focus:ring-inset focus:ring-ink focus:outline-none" />
      </div>
      {state.error && (
        <p role="alert" className="text-meta text-sindoor">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={!all || pending}
          className="h-12 rounded-button bg-teal px-5 text-label font-bold text-on-accent disabled:cursor-not-allowed disabled:bg-line disabled:text-disabled-text"
        >
          Approve as Verified
        </button>
        <button type="submit" name="decision" value="reject" disabled={pending} className="h-12 rounded-button border border-sindoor bg-ground px-5 text-label font-bold text-sindoor">
          Reject with note
        </button>
        <button type="submit" name="decision" value="better_photo" disabled={pending} className="h-12 rounded-button border border-line bg-ground px-4 text-label font-semibold">
          Ask for a better photo
        </button>
        <span className="ml-auto text-meta text-stone" aria-live="polite">
          {all ? "All 6 checks done. Approval is logged with your name." : `${done} of 6 checks done. Approve needs all 6.`}
        </span>
      </div>
    </form>
  );
}
