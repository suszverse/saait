"use client";

import { useActionState, useMemo, useState } from "react";
import { Button, CheckIcon, TextField } from "@/components/ui";
import { quote } from "@/lib/fees";
import { formatRs, paisa } from "@/lib/money";
import { checkoutAction, type CheckoutState } from "./actions";

type Addon = { id: string; name: string; price: number };
const METHODS = [
  { id: "esewa", label: "eSewa" },
  { id: "khalti", label: "Khalti" },
  { id: "fonepay", label: "Fonepay QR" },
] as const;

/**
 * Totals update as add-ons change, using the same pure fee rules the server
 * uses. The server recomputes everything on submit; this is display only.
 */
export function BookingForm(props: {
  providerSlug: string;
  providerKind: "studio" | "freelancer";
  packageId: string;
  packageName: string;
  date: string;
  packagePrice: number;
  peakSurcharge: number;
  depositPercent: number;
  addons: Addon[];
  refundLine: string;
}) {
  const [state, action, pending] = useActionState(checkoutAction, {} as CheckoutState);
  const [chosen, setChosen] = useState<string[]>([]);
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("esewa");
  const q = useMemo(
    () =>
      quote({
        packagePrice: paisa(props.packagePrice),
        peakSurcharge: paisa(props.peakSurcharge),
        addons: props.addons.filter((a) => chosen.includes(a.id)).map((a) => paisa(a.price)),
        depositPercent: props.depositPercent,
      }),
    [chosen, props],
  );
  const who = props.providerKind === "studio" ? "the studio" : "the provider";
  const methodLabel = METHODS.find((m) => m.id === method)!.label;

  return (
    <form action={action} className="flex flex-1 flex-col">
      <input type="hidden" name="providerSlug" value={props.providerSlug} />
      <input type="hidden" name="packageId" value={props.packageId} />
      <input type="hidden" name="date" value={props.date} />

      <div className="flex flex-col gap-4">
        <TextField
          id="venue"
          name="venue"
          label="Venue"
          placeholder="Hall or hotel, town"
          autoComplete="off"
          required
          error={state.field === "venue" ? state.error : undefined}
        />

        {props.addons.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-small font-semibold">Add-ons</legend>
            {props.addons.map((a) => {
              const on = chosen.includes(a.id);
              return (
                <label
                  key={a.id}
                  className={`flex h-12 cursor-pointer items-center justify-between gap-2.5 rounded-button border px-3.5 text-label ${on ? "border-ink bg-tint" : "border-line bg-white"}`}
                >
                  <span className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      name="addon"
                      value={a.id}
                      checked={on}
                      onChange={(e) => setChosen((c) => (e.target.checked ? [...c, a.id] : c.filter((x) => x !== a.id)))}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`flex size-5 items-center justify-center rounded-[6px] border-2 text-white peer-focus-visible:outline-2 peer-focus-visible:outline-ink ${on ? "border-ink bg-ink" : "border-check-border bg-white"}`}
                    >
                      {on && <CheckIcon size={12} strokeWidth={3.5} />}
                    </span>
                    {a.name}
                  </span>
                  <span className="font-semibold">{formatRs(paisa(a.price))}</span>
                </label>
              );
            })}
          </fieldset>
        )}

        <dl className="mt-0.5 flex flex-col gap-2 text-label">
          <div className="flex justify-between gap-2">
            <dt>{props.packageName} package</dt>
            <dd>{formatRs(q.packagePrice)}</dd>
          </div>
          {q.peakSurcharge > 0 && (
            <div className="flex justify-between gap-2 text-marigold-text">
              <dt>Wedding date surcharge</dt>
              <dd>{formatRs(q.peakSurcharge)}</dd>
            </div>
          )}
          {q.addons > 0 && (
            <div className="flex justify-between gap-2">
              <dt>Add-ons</dt>
              <dd>{formatRs(q.addons)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2 border-t border-line pt-2 font-bold">
            <dt>Agreed total</dt>
            <dd>{formatRs(q.agreedTotal)}</dd>
          </div>
        </dl>

        <dl className="flex flex-col gap-2 rounded-card bg-tint px-4 py-3.5 text-small" aria-live="polite">
          <div className="flex justify-between gap-2 text-body leading-field font-bold">
            <dt>Pay now to lock the date</dt>
            <dd>{formatRs(q.payNow)}</dd>
          </div>
          <div className="flex justify-between gap-2 text-stone">
            <dt>{props.depositPercent}% deposit, held until the event</dt>
            <dd>{formatRs(q.deposit)}</dd>
          </div>
          <div className="flex justify-between gap-2 text-stone">
            <dt>Booking guarantee fee</dt>
            <dd>{formatRs(q.bookingFee)}</dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-line pt-2 text-stone">
            <dt>Balance, paid to {who} after the event</dt>
            <dd>{formatRs(q.balance)}</dd>
          </div>
        </dl>

        <p className="text-meta text-stone">{props.refundLine}</p>
      </div>

      <div className="sticky bottom-0 mt-auto flex flex-col gap-2.5 border-t border-line bg-white pt-3 pb-7 md:static md:mt-6 md:border-0">
        {state.error && state.field !== "venue" && (
          <p role="alert" className="text-meta text-sindoor">
            {state.error}
          </p>
        )}
        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="sr-only">Pay with</legend>
          {METHODS.map((m) => (
            <label
              key={m.id}
              className={`flex h-11 cursor-pointer items-center justify-center rounded-control border text-small font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink ${method === m.id ? "border-ink bg-tint" : "border-line bg-white"}`}
            >
              <input type="radio" name="method" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} className="sr-only" />
              {m.label}
            </label>
          ))}
        </fieldset>
        <Button type="submit" disabled={pending}>
          {pending ? "Holding your date" : `Pay ${formatRs(q.payNow)} with ${methodLabel}`}
        </Button>
      </div>
    </form>
  );
}
