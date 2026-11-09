"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, CheckIcon } from "@/components/ui";
import { agree, type AgreeState } from "./actions";

export type JoinKind = "client" | "studio" | "freelancer";

/**
 * The one checkbox of sign-up (Figma J2). The box is a native input kept
 * screen-reader only, with the visible square drawn beside it, the same
 * pattern as the add-on checkboxes on the booking form. The wrapping label
 * is the hit target. The button stays disabled until the box is ticked, as
 * the design asks; the server re-checks `accepted` regardless.
 */
export function AgreeForm({ kind, version, next }: { kind: JoinKind; version: string; next?: string }) {
  const [state, submit, pending] = useActionState<AgreeState, FormData>(agree, {});
  const [checked, setChecked] = useState(false);

  return (
    <form action={submit} className="flex flex-col gap-5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="version" value={version} />
      {next && <input type="hidden" name="next" value={next} />}

      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-body text-ink">
        <input
          type="checkbox"
          name="accepted"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          aria-describedby={state.error ? "agree-error" : undefined}
          aria-invalid={state.error ? true : undefined}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[6px] border-2 text-on-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
            checked ? "border-ink bg-ink" : "border-check-border bg-ground"
          }`}
        >
          {checked && <CheckIcon size={12} strokeWidth={3.5} />}
        </span>
        <span>
          I have read and agree to the{" "}
          <Link href="/terms" className="font-semibold text-ink">
            Terms of Use, Privacy Policy and Chat Rules
          </Link>
          , including message checking before delivery.
        </span>
      </label>

      {state.error && (
        <p id="agree-error" role="alert" className="text-small text-sindoor">
          {state.error}
        </p>
      )}

      <Button type="submit" variant="primary" disabled={!checked || pending}>
        {pending ? "Saving" : "Agree and continue"}
      </Button>

      <Link href="/terms" className="self-center text-small font-semibold text-ink">
        Read the full terms · about 5 minutes
      </Link>
    </form>
  );
}
