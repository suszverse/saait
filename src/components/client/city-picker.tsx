import { ChevronDownIcon } from "@/components/ui";
import type { SearchQuery } from "@/server/search";

/**
 * Native select inside a GET form: the platform control, keyboard and screen
 * reader ready. The arrow button submits for people without JavaScript; with
 * JavaScript the form submits on change.
 */
export function CityPicker({ cities, current, q }: { cities: { slug: string; name: string }[]; current: string; q: SearchQuery }) {
  return (
    <form action="/" method="get" className="flex items-center gap-2">
      <input type="hidden" name="date" value={q.date} />
      <input type="hidden" name="category" value={q.category} />
      <label htmlFor="city" className="sr-only">
        City
      </label>
      <select
        id="city"
        name="city"
        defaultValue={current}
        className="min-h-11 cursor-pointer appearance-none bg-transparent pr-1 text-title font-extrabold text-ink"
        data-autosubmit
      >
        {cities.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
      <button type="submit" aria-label="Show providers in this city" className="flex size-11 items-center justify-center rounded-control">
        <ChevronDownIcon size={20} />
      </button>
      <script
        // Tiny progressive enhancement: submit on change.
        dangerouslySetInnerHTML={{
          __html:
            "document.currentScript.previousElementSibling.previousElementSibling.addEventListener('change',function(e){e.target.form.requestSubmit()})",
        }}
      />
    </form>
  );
}
