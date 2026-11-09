"use client";

import { startTransition, useActionState } from "react";
import { Button, TextField } from "@/components/ui";
import { startOnboarding, type OnboardingState } from "./actions";

export function OnboardingForm({ cities, categories }: { cities: { slug: string; name: string }[]; categories: { slug: string; shortName: string }[] }) {
  const [state, action, pending] = useActionState(startOnboarding, {} as OnboardingState);
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
      <TextField id="fullName" name="fullName" label="Your full name, as on your ID" required autoComplete="name" helper="Only our team sees this. It must match your ID, PAN and payout account." />
      <TextField id="displayName" name="displayName" label="Business or display name" placeholder="Shrestha Studio" required autoComplete="organization" />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-small font-semibold">You are</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["freelancer", "A freelancer"],
            ["studio", "A studio with a team"],
          ].map(([v, l]) => (
            <label key={v} className="flex h-12 cursor-pointer items-center justify-center rounded-control border border-line text-small font-semibold has-checked:border-ink has-checked:bg-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink">
              <input type="radio" name="kind" value={v} defaultChecked={v === "freelancer"} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
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
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-small font-semibold">What you shoot</legend>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <label key={c.slug} className="inline-flex h-10 cursor-pointer items-center rounded-chip border border-line px-3.5 text-small font-semibold has-checked:border-ink has-checked:bg-ink has-checked:text-on-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink">
              <input type="checkbox" name="categories" value={c.slug} className="sr-only" />
              {c.shortName}
            </label>
          ))}
        </div>
      </fieldset>
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
