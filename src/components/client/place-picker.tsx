"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { ChevronDownIcon, filterChipClass, FilterChipLink, TextField } from "@/components/ui";
import type { NearbyPlace, Place } from "@/server/places";

/**
 * Where the search runs from. The point lives in the URL and nowhere else:
 * chips are links, "Near me" asks the browser once and then navigates, and
 * the typed search only ever sends the text. No position reaches a server
 * action or a store; the server reads it from the query and drops it.
 */
export const NEAR_ME_LABEL = "Near me";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

type Point = { label: string; lat: number; lng: number };

export function PlacePicker({ current, nearby, baseQuery }: { current: Point; nearby: NearbyPlace[]; baseQuery: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const searchId = useId();

  const hrefFor = (p: Point) => {
    const params = new URLSearchParams(baseQuery);
    // Four decimals is about 11 m: enough to find who can reach you, no more.
    params.set("lat", p.lat.toFixed(4));
    params.set("lng", p.lng.toFixed(4));
    params.set("place", p.label);
    return `/?${params.toString()}`;
  };
  const go = (p: Point) => start(() => router.replace(hrefFor(p), { scroll: false }));

  const openSearch = (why: string | null) => {
    setNotice(why);
    setSearching(true);
  };

  const nearMe = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      openSearch("Your browser cannot share a location. Type a place instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => go({ label: NEAR_ME_LABEL, lat: coords.latitude, lng: coords.longitude }),
      () => openSearch("We could not get your location. Type a place instead."),
      { maximumAge: 5 * 60_000, timeout: 10_000 },
    );
  };

  const isCurrent = (p: { lat: number; lng: number }) => Math.abs(p.lat - current.lat) < 1e-4 && Math.abs(p.lng - current.lng) < 1e-4;
  const nearMeSelected = current.label === NEAR_ME_LABEL;

  return (
    <div className="flex flex-col gap-2.5" aria-busy={pending || undefined}>
      <div className="flex flex-col gap-0.5">
        <p className="text-small text-stone">Shooting near</p>
        <button
          type="button"
          onClick={() => (searching ? setSearching(false) : openSearch(null))}
          aria-expanded={searching}
          aria-controls={`${searchId}-panel`}
          className="-ml-1 flex min-h-11 max-w-full items-center gap-2 rounded-control pl-1 pr-2 text-left text-title font-extrabold text-ink"
        >
          <PinIcon size={24} className="shrink-0 text-stone" />
          <span className="min-w-0 truncate">{current.label}</span>
          <ChevronDownIcon size={20} className={`shrink-0 text-stone transition-transform motion-reduce:transition-none ${searching ? "rotate-180" : ""}`} />
        </button>
      </div>

      <nav aria-label="Search area" className="flex flex-wrap gap-2">
        <button type="button" onClick={nearMe} aria-pressed={nearMeSelected} className={filterChipClass(nearMeSelected)}>
          {NEAR_ME_LABEL}
        </button>
        {nearby.map((p) => {
          const km = p.distanceKm < 0.95 ? "under 1" : String(Math.round(p.distanceKm));
          return (
            <FilterChipLink key={p.slug} href={hrefFor({ label: p.name, lat: p.lat, lng: p.lng })} selected={isCurrent(p)} replace scroll={false}>
              {p.name}
              <span className="font-normal text-stone">&nbsp;· {km} km</span>
            </FilterChipLink>
          );
        })}
      </nav>

      <p className="text-small text-stone">Your location is used once to find who can reach you. It is not stored.</p>

      <div id={`${searchId}-panel`} hidden={!searching}>
        {searching && <PlaceSearch id={searchId} notice={notice} hrefFor={hrefFor} />}
      </div>
    </div>
  );
}

function PlaceSearch({
  id,
  notice,
  hrefFor,
}: {
  id: string;
  notice: string | null;
  hrefFor: (p: Point) => string;
}) {
  const [text, setText] = useState("");
  // Results remember the term they answer, so a stale answer is never shown for new text.
  const [answer, setAnswer] = useState<{ term: string; places: Place[]; failed: boolean } | null>(null);
  const term = text.trim();
  const live = term.length >= MIN_CHARS;
  const results = live && answer?.term === term ? answer.places : null;
  const failed = live && answer?.term === term ? answer.failed : false;

  useEffect(() => {
    if (term.length < MIN_CHARS) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const body: unknown = await res.json();
        const places = body && typeof body === "object" && Array.isArray((body as { places?: unknown }).places) ? ((body as { places: Place[] }).places ?? []) : [];
        setAnswer({ term, places: places.slice(0, 8), failed: false });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setAnswer({ term, places: [], failed: true });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term]);

  const status = failed ? "Could not search right now. Try again." : results && results.length === 0 ? `No place matches “${term}”.` : null;

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      <TextField
        id={`${id}-place`}
        // The panel mounts only when opened, so this moves focus from the button that opened it, once.
        autoFocus
        label="Place"
        type="search"
        autoComplete="off"
        enterKeyHint="search"
        placeholder="Town, chowk or venue"
        value={text}
        onChange={(e) => setText(e.target.value)}
        helper={notice ?? "Type at least two letters."}
      />
      <p className="text-meta text-stone" aria-live="polite">
        {status}
      </p>
      {results && results.length > 0 && (
        <ul aria-label="Matching places" className="flex flex-col divide-y divide-line rounded-card border border-line">
          {results.map((p) => {
            return (
              <li key={p.slug}>
                <Link
                  href={hrefFor({ label: p.name, lat: p.lat, lng: p.lng })}
                  replace
                  scroll={false}
                  className="flex min-h-13 flex-col justify-center px-4 py-2.5 text-ink no-underline hover:bg-tint"
                >
                  <span className="text-body font-semibold">
                    {p.name}
                    {p.nameNp && <span className="font-normal text-stone"> · {p.nameNp}</span>}
                  </span>
                  <span className="text-meta text-stone">{p.district}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Map pin, same stroke and viewBox as the `Icon/*` set. Not yet in icons.tsx. */
function PinIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
