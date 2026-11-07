import { FilterChipLink } from "@/components/ui";

export function CategoryChips({
  categories,
  current,
  hrefFor,
  label,
}: {
  categories: { slug: string; shortName: string }[];
  current: string;
  hrefFor: (slug: string) => string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="-mx-gutter flex gap-2 overflow-x-auto px-gutter [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
      {categories.map((c) => (
        <FilterChipLink key={c.slug} href={hrefFor(c.slug)} selected={c.slug === current} scroll={false}>
          {c.shortName}
        </FilterChipLink>
      ))}
    </nav>
  );
}
