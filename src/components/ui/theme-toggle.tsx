"use client";

import { useId, useState, useTransition } from "react";
import { saveTheme } from "@/app/settings/actions";
import { THEME_COOKIE, type Theme, themeSchema } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const ORDER: Theme[] = ["system", "light", "dark"];
const ONE_YEAR = 60 * 60 * 24 * 365;

function resolve(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Applies the choice on this device at once: <html data-theme> for the CSS,
 * localStorage for the blocking init script, the cookie for the server render.
 * The init script only listens to prefers-color-scheme while in "system", so
 * switching back to system re-resolves once here and the next load re-attaches.
 */
function applyLocally(theme: Theme) {
  document.documentElement.dataset.theme = resolve(theme);
  try {
    localStorage.setItem(THEME_COOKIE, theme);
  } catch {}
  document.cookie =
    theme === "system"
      ? `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`
      : `${THEME_COOKIE}=${theme}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

type Props = {
  value: Theme;
  /** Single 36 px icon button that cycles system → light → dark; for headers. */
  compact?: boolean;
  /** When true the choice is also saved to the account through the server action. */
  signedIn?: boolean;
  className?: string;
};

export function ThemeToggle({ value, compact = false, signedIn = false, className = "" }: Props) {
  const [theme, setThemeState] = useState<Theme>(value);
  const [status, setStatus] = useState<string | null>(null);
  const [, start] = useTransition();
  const name = useId();

  function choose(next: Theme) {
    if (!themeSchema.safeParse(next).success || next === theme) return;
    setThemeState(next);
    applyLocally(next);
    if (!signedIn) return;
    start(async () => {
      const r = await saveTheme(next);
      setStatus("ok" in r ? "Saved to your account." : r.error);
    });
  }

  if (compact) {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    const label = OPTIONS.find((o) => o.value === theme)!.label;
    const dark = typeof window !== "undefined" ? resolve(theme) === "dark" : theme === "dark";
    return (
      <button
        type="button"
        onClick={() => choose(next)}
        aria-pressed={theme !== "system"}
        aria-label={`Theme: ${label}. Switch to ${OPTIONS.find((o) => o.value === next)!.label}`}
        title={`Theme: ${label}`}
        className={`inline-flex size-9 items-center justify-center rounded-control text-ink transition-colors hover:bg-tint ${className}`.trim()}
      >
        {dark ? <MoonIcon /> : <SunIcon />}
      </button>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`.trim()}>
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Theme</legend>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-control bg-tint p-1">
          {OPTIONS.map((o) => {
            const checked = o.value === theme;
            return (
              <label
                key={o.value}
                className={
                  "relative flex h-9 cursor-pointer items-center justify-center rounded-[10px] border text-small font-semibold transition-colors " +
                  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink " +
                  (checked ? "border-line bg-ground text-ink" : "border-transparent text-stone hover:text-ink")
                }
              >
                <input
                  type="radio"
                  name={name}
                  value={o.value}
                  checked={checked}
                  onChange={() => choose(o.value)}
                  className="sr-only"
                />
                {o.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      {signedIn && (
        <p role="status" aria-live="polite" className="min-h-5 text-meta text-stone">
          {status}
        </p>
      )}
    </div>
  );
}

/* Local icons: sun and moon are not part of the Icon/* set yet. */
function SunIcon() {
  return (
    <svg aria-hidden="true" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  );
}
