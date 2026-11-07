"use client";

import { useActionState } from "react";
import { Button, TextField } from "@/components/ui";
import { identityAction, panAction, payoutAction, submitAction, type KycFormState } from "./actions";

export function IdentityForm({ idType, idNumber, locked }: { idType: "citizenship" | "passport"; idNumber: string; locked: boolean }) {
  const [state, action, pending] = useActionState(identityAction, {} as KycFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="grid grid-cols-2 gap-2" disabled={locked}>
        <legend className="sr-only">ID type</legend>
        {(["citizenship", "passport"] as const).map((t) => (
          <label key={t} className="flex h-11 cursor-pointer items-center justify-center rounded-control border border-line text-small font-semibold has-checked:border-ink has-checked:bg-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink">
            <input type="radio" name="idType" value={t} defaultChecked={t === idType} className="sr-only" />
            {t === "citizenship" ? "Citizenship card" : "Passport"}
          </label>
        ))}
      </fieldset>
      <TextField
        id="idNumber"
        name="idNumber"
        label="ID number"
        defaultValue={idNumber}
        disabled={locked}
        helper="Must match the name on your PAN and payout account."
        error={state.error}
        required
      />
      <Button type="submit" variant="secondary" disabled={pending || locked}>
        Continue to PAN
      </Button>
    </form>
  );
}

export function PanForm({ pan, vat, locked }: { pan: string; vat: boolean; locked: boolean }) {
  const [state, action, pending] = useActionState(panAction, {} as KycFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <TextField id="pan" name="pan" label="PAN number" inputMode="numeric" defaultValue={pan} disabled={locked} error={state.error} helper="9 digits, as on your PAN card." required />
      <fieldset className="flex flex-col gap-2" disabled={locked}>
        <legend className="mb-2 text-small font-semibold">VAT registered?</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["no", "No"],
            ["yes", "Yes"],
          ].map(([v, l]) => (
            <label key={v} className="flex h-11 cursor-pointer items-center justify-center rounded-control border border-line text-small font-semibold has-checked:border-ink has-checked:bg-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink">
              <input type="radio" name="vat" value={v} defaultChecked={(v === "yes") === vat} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
        <p className="text-meta text-stone">This sets the tax withheld from released deposits: 15% if not VAT registered, 1.5% if registered.</p>
      </fieldset>
      <Button type="submit" variant="secondary" disabled={pending || locked}>
        Continue to payout
      </Button>
    </form>
  );
}

export function PayoutForm(props: { method: string; name: string; number: string; locked: boolean }) {
  const [state, action, pending] = useActionState(payoutAction, {} as KycFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="grid grid-cols-3 gap-2" disabled={props.locked}>
        <legend className="mb-2 text-small font-semibold">Paid to</legend>
        {[
          ["bank", "Bank"],
          ["esewa", "eSewa"],
          ["khalti", "Khalti"],
        ].map(([v, l]) => (
          <label key={v} className="flex h-11 cursor-pointer items-center justify-center rounded-control border border-line text-small font-semibold has-checked:border-ink has-checked:bg-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink">
            <input type="radio" name="method" value={v} defaultChecked={v === (props.method || "esewa")} className="sr-only" />
            {l}
          </label>
        ))}
      </fieldset>
      <TextField id="accountName" name="accountName" label="Name on the account" defaultValue={props.name} disabled={props.locked} required />
      <TextField
        id="accountNumber"
        name="accountNumber"
        label="Account or wallet number"
        defaultValue={props.number}
        disabled={props.locked}
        error={state.error}
        helper="Deposits are released only to this account. Changing it later pauses payouts for 7 days."
        required
      />
      <Button type="submit" variant="secondary" disabled={pending || props.locked}>
        Continue to review
      </Button>
    </form>
  );
}

export function SubmitForm({ ready }: { ready: boolean }) {
  const [state, action, pending] = useActionState(submitAction, {} as KycFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error && (
        <p role="alert" className="text-meta text-sindoor">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={!ready || pending}>
        Send for verification
      </Button>
      {!ready && <p className="text-center text-micro font-normal text-stone">Add every photo and detail above to send.</p>}
    </form>
  );
}
