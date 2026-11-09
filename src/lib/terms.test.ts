import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  inlinesToText,
  loadTerms,
  parseInlines,
  parseTerms,
  slugify,
} from "./terms";

/** Bold rule titles from section 1 of the legal draft, trailing period dropped. */
function draftRuleTitles(): string[] {
  const draft = readFileSync(
    path.resolve(process.cwd(), "docs/legal/terms-draft.md"),
    "utf8",
  );
  const [, sectionOne = ""] = draft.split(/^## 1\. .*$/m);
  const [body = ""] = sectionOne.split(/^## 2\. /m);
  return Array.from(body.matchAll(/^\d+\. \*\*(.+?)\*\*/gm), (m) =>
    m[1].replace(/\.$/, ""),
  );
}

describe("loadTerms", () => {
  const terms = loadTerms();

  it("reads the version line", () => {
    expect(terms.version).toBe("2026-11-09");
  });

  it("keeps the title and intro", () => {
    expect(terms.title).toBe("Terms, privacy and chat rules");
    expect(terms.intro.length).toBeGreaterThan(0);
    expect(terms.intro[0]).toMatch(/^Every account accepts/);
  });

  it("has seven rules matching the legal draft", () => {
    expect(terms.rules).toHaveLength(7);
    expect(terms.rules.map((r) => r.title)).toEqual(draftRuleTitles());
    for (const rule of terms.rules) {
      expect(rule.body.length).toBeGreaterThan(0);
      expect(rule.body).not.toContain("**");
    }
  });

  it("has nine sections with unique kebab ids", () => {
    expect(terms.sections).toHaveLength(9);
    expect(terms.sections[0].heading.startsWith("1.")).toBe(true);
    const ids = terms.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("terms-of-use");
    expect(ids).toContain("chat-rules");
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("keeps bold inlines inside list items", () => {
    // The committed file only uses bold in section 1 (the rules list); the
    // other sections are plain. Check the real file there and a synthetic
    // section 3 with bold in a bullet list.
    const boldIn = (section: (typeof terms.sections)[number]) =>
      section.blocks
        .flatMap((b) => (b.type === "p" ? b.inlines : b.items.flat()))
        .filter((i) => i.type === "bold");
    expect(boldIn(terms.sections[0]).length).toBe(7);

    const synthetic = parseTerms(
      [
        "version: 2026-01-01",
        "# T",
        "## 1. Rules",
        "1. **A.** a",
        "## 2. Two",
        "- plain",
        "## 3. Chat rules",
        "- **Blocked:** numbers",
        "- Allowed: anything",
      ].join("\n"),
    );
    expect(synthetic.sections[2].id).toBe("chat-rules");
    expect(boldIn(synthetic.sections[2])).toEqual([
      { type: "bold", text: "Blocked:" },
    ]);
  });

  it("returns the same object on repeated calls", () => {
    expect(loadTerms()).toBe(terms);
  });
});

describe("parseInlines", () => {
  it("splits text and bold", () => {
    expect(parseInlines("a **b** c")).toEqual([
      { type: "text", text: "a " },
      { type: "bold", text: "b" },
      { type: "text", text: " c" },
    ]);
  });
  it("leaves unclosed markers as text", () => {
    expect(parseInlines("a **b")).toEqual([{ type: "text", text: "a **b" }]);
    expect(inlinesToText(parseInlines("**x** y"))).toBe("x y");
  });
});

describe("slugify", () => {
  it("drops the number and kebab-cases the rest", () => {
    expect(slugify("2. Terms of use")).toBe("terms-of-use");
    expect(slugify("9. Changes, disputes and contact")).toBe(
      "changes-disputes-and-contact",
    );
  });
});
