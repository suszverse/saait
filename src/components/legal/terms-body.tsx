import { BS_MONTHS, toBs } from "@/lib/nepali-date";
import type { Block, Inline, Rule, Terms } from "@/lib/terms";

/**
 * Terms, privacy and chat rules (Figma J3). Server components only: the
 * contents list is plain anchor links, and the active row follows the URL
 * fragment through a `:has(:target)` stylesheet rather than any client JS.
 * `SevenRules` is shared with the sign-up agreement screen.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "Kartik 23, 2083"; falls back to the raw version string for non-dates. */
function versionLabel(version: string): string {
  if (!ISO.test(version)) return version;
  try {
    const b = toBs(version);
    return `${BS_MONTHS[b.month - 1]} ${b.day}, ${b.year}`;
  } catch {
    return version;
  }
}

function Inlines({ inlines }: { inlines: Inline[] }) {
  return inlines.map((run, i) =>
    run.type === "bold" ? (
      <strong key={i} className="font-bold text-ink">
        {run.text}
      </strong>
    ) : (
      <span key={i}>{run.text}</span>
    ),
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.type === "p") {
    return (
      <p className="text-body text-ink">
        <Inlines inlines={block.inlines} />
      </p>
    );
  }
  const Tag = block.type;
  const marker = block.type === "ol" ? "list-decimal" : "list-disc";
  return (
    <Tag className={`flex flex-col gap-2 pl-5 text-body text-ink ${marker} marker:text-stone`}>
      {block.items.map((item, i) => (
        <li key={i}>
          <Inlines inlines={item} />
        </li>
      ))}
    </Tag>
  );
}

/** The seven rules: Teal number, Heading title, Stone body. Reused by the agreement screen. */
export function SevenRules({ rules }: { rules: Rule[] }) {
  return (
    <ol role="list" className="flex list-none flex-col gap-6 p-0">
      {rules.map((rule, i) => (
        <li key={i} className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-3 gap-y-1">
          <span aria-hidden="true" className="text-heading font-extrabold tabular-nums text-teal">
            {i + 1}
          </span>
          <h3 className="text-heading font-bold text-ink">{rule.title || `Rule ${i + 1}`}</h3>
          <p className="col-start-2 text-body text-stone">{rule.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** Row and chip classes share one element: chips on phone, list rows on desktop. */
const tocLink =
  "inline-flex min-h-10 items-center rounded-chip border border-line px-3.5 text-small font-semibold text-ink no-underline transition-colors hover:bg-tint " +
  "md:min-h-11 md:w-full md:rounded-control md:border-0 md:px-3 md:py-2.5 md:text-label md:leading-5";

/** Highlights the row whose section is the current fragment; the first row when there is none. */
function activeRowStyles(ids: string[]): string {
  const rules = ids.map((id) => `html:has(#${id}:target) [data-toc="${id}"]{background:var(--tint);border-color:var(--ink)}`);
  if (ids[0]) rules.push(`html:not(:has(:target)) [data-toc="${ids[0]}"]{background:var(--tint);border-color:var(--ink)}`);
  return rules.join("\n");
}

export function TermsBody({ terms }: { terms: Terms }) {
  const [rulesSection, ...rest] = terms.sections;
  const ids = terms.sections.map((s) => s.id);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[260px_minmax(0,1fr)] md:gap-x-16">
      <style>{activeRowStyles(ids)}</style>

      <nav aria-labelledby="toc-heading" className="flex flex-col gap-3 self-start md:sticky md:top-8">
        <p id="toc-heading" className="text-micro font-bold uppercase tracking-wide text-stone">
          On this page
        </p>
        <ul className="flex flex-wrap gap-2 p-0 md:flex-col md:gap-0.5">
          {terms.sections.map((s) => (
            <li key={s.id} className="list-none md:w-full">
              <a href={`#${s.id}`} data-toc={s.id} className={tocLink}>
                {s.heading}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="flex min-w-0 max-w-[720px] flex-col gap-10">
        <header className="flex flex-col gap-3">
          <h1 className="text-title font-extrabold text-ink md:text-display">{terms.title}</h1>
          <p className="text-body text-stone">
            Plain language, one page. Last changed {versionLabel(terms.version)}. Changes are announced in the app 30 days before they apply.
          </p>
        </header>

        {rulesSection && (
          <section id={rulesSection.id} aria-labelledby={`${rulesSection.id}-heading`} className="flex scroll-mt-8 flex-col gap-6">
            <h2 id={`${rulesSection.id}-heading`} className="text-title font-extrabold text-ink">
              {rulesSection.heading}
            </h2>
            {terms.rules.length > 0 ? (
              <SevenRules rules={terms.rules} />
            ) : (
              rulesSection.blocks.map((b, i) => <BlockView key={i} block={b} />)
            )}
          </section>
        )}

        {rest.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-heading`} className="flex scroll-mt-8 flex-col gap-4">
            <h2 id={`${s.id}-heading`} className="text-title font-extrabold text-ink">
              {s.heading}
            </h2>
            {s.blocks.map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </section>
        ))}

        <footer className="border-t border-line pt-6 text-small text-stone">
          <a href="mailto:support@saait.app" className="font-semibold text-ink">
            support@saait.app
          </a>
          {" · "}
          <a href="mailto:privacy@saait.app" className="font-semibold text-ink">
            privacy@saait.app
          </a>
          {" · "}Saait, Butwal, Nepal
        </footer>
      </article>
    </div>
  );
}
