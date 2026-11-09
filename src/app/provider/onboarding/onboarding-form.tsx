"use client";

import { startTransition, useActionState, useState } from "react";
import { Button, TextField } from "@/components/ui";
import { startOnboarding, type OnboardingState } from "./actions";

export type ProviderKind = "freelancer" | "studio";

const chip = "inline-flex h-10 cursor-pointer items-center rounded-chip border border-line px-3.5 text-small font-semibold has-checked:border-ink has-checked:bg-ink has-checked:text-on-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink";

export function OnboardingForm({
  cities,
  categories,
  roles,
  initialKind,
}: {
  cities: { slug: string; name: string }[];
  categories: { slug: string; shortName: string }[];
  roles: readonly string[];
  initialKind: ProviderKind;
}) {
  const [state, action, pending] = useActionState(startOnboarding, {} as OnboardingState);
  // The radio is the source of truth; this only decides which field set is shown.
  const [kind, setKind] = useState<ProviderKind>(initialKind);
  return (
    <form
      // Submit by hand so an error keeps everything the provider typed.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="flex flex-col gap-5"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-small font-semibold">You are</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["freelancer", "A freelancer"],
              ["studio", "A studio with a team"],
            ] as const
          ).map(([v, l]) => (
            <label key={v} className="flex h-12 cursor-pointer items-center justify-center rounded-control border border-line text-small font-semibold has-checked:border-ink has-checked:bg-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink">
              <input type="radio" name="kind" value={v} checked={kind === v} onChange={() => setKind(v)} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <TextField
        id="fullName"
        name="fullName"
        label="Your full name, as on your ID"
        required
        autoComplete="name"
        helper={kind === "freelancer" ? "Your name and number stay private until you are hired. It must match your ID, PAN and payout account." : "Only our team sees this. It must match your ID, PAN and payout account."}
      />
      {kind === "studio" ? (
        <>
          <TextField id="businessName" name="businessName" label="Registered business name" placeholder="Shrestha Studio Pvt. Ltd." required autoComplete="organization" helper="As on your PAN certificate." />
          <TextField id="displayName" name="displayName" label="Business or display name" placeholder="Shrestha Studio" required />
        </>
      ) : (
        <>
          <TextField id="headline" name="headline" label="One line about your work" placeholder="Candid second shooter, 6 wedding seasons" required maxLength={120} helper="Studios see this line with your roles and day rate. Leave out names, numbers and links." />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-small font-semibold">What you can be hired for</legend>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <label key={r} className={chip}>
                  <input type="checkbox" name="roles" value={r} className="sr-only" />
                  {r}
                </label>
              ))}
            </div>
          </fieldset>
          <TextField id="dayRate" name="dayRate" label="Day rate, in rupees" type="number" inputMode="numeric" min={1000} max={100000} step={1} placeholder="5000" required helper="Between Rs 1,000 and Rs 1,00,000 for a full day." />
          <TextField id="bio" name="bio" label="About you (optional)" multiline maxLength={600} helper="Gear, style, seasons worked. Keep it to the city; no contact details." />
        </>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="city" className="text-small font-semibold">
          Home city
        </label>
        <select id="city" name="city" required defaultValue="" className="h-13 rounded-button border border-line bg-ground px-3.5 text-body focus:border-ink focus:ring-1 focus:ring-inset focus:ring-ink focus:outline-none">
          <option value="" disabled>
            Pick a city
          </option>
          {cities.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {kind === "studio" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-small font-semibold">What you shoot</legend>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <label key={c.slug} className={chip}>
                <input type="checkbox" name="categories" value={c.slug} className="sr-only" />
                {c.shortName}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {state.error && (
        <p role="alert" className="text-meta text-sindoor">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving" : "Continue to verification"}
      </Button>
    </form>
  );
}
