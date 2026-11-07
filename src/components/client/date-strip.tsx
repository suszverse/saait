import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, DayCell, SaaitDot } from "@/components/ui";
import { addDays, bsDayMonth, bsMonthYear, dayOfWeek, toBs, type IsoDate } from "@/lib/nepali-date";

/** The week (Sun to Sat) containing `day`, Nepali dates first, wedding dates dotted. */
export function DateStrip({ day, saait, hrefFor }: { day: IsoDate; saait: Set<IsoDate>; hrefFor: (d: IsoDate) => string }) {
  const dowIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dayOfWeek(day));
  const start = addDays(day, -dowIndex);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <section aria-labelledby="month-heading" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link href={hrefFor(addDays(start, -7))} aria-label="Previous week" className="-ml-3 flex size-11 items-center justify-center rounded-control">
            <ChevronLeftIcon size={20} />
          </Link>
          <h2 id="month-heading" className="text-heading font-bold">
            {bsMonthYear(day)}
          </h2>
          <Link href={hrefFor(addDays(start, 7))} aria-label="Next week" className="flex size-11 items-center justify-center rounded-control">
            <ChevronRightIcon size={20} />
          </Link>
        </div>
        <p className="flex items-center gap-1.5 text-meta text-marigold-text">
          <SaaitDot size={8} />
          <span>साइत · wedding date</span>
        </p>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <DayCell
            key={d}
            href={hrefFor(d)}
            dow={dayOfWeek(d)}
            day={toBs(d).day}
            selected={d === day}
            saait={saait.has(d)}
            label={`${dayOfWeek(d)} ${bsDayMonth(d)}${saait.has(d) ? ", wedding date" : ""}`}
            scroll={false}
          />
        ))}
      </div>
    </section>
  );
}
