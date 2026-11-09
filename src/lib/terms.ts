import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Parser for src/content/terms.md, the single source of the terms, privacy
 * policy and chat rules shown at sign-up. Supports only what that file uses:
 * a `version:` line, `#` and `##` headings, paragraphs, ordered and unordered
 * lists, and **bold**. Server-only (reads the filesystem); no React here.
 */

export type Inline = { type: "text" | "bold"; text: string };

export type Block =
  | { type: "p"; inlines: Inline[] }
  | { type: "ul" | "ol"; items: Inline[][] };

export type Rule = { title: string; body: string };

export type Section = { id: string; heading: string; blocks: Block[] };

export type Terms = {
  version: string;
  title: string;
  intro: string[];
  rules: Rule[];
  sections: Section[];
};

const TERMS_PATH = path.join("src", "content", "terms.md");

/** Splits a line of markdown into text and bold runs. Unclosed `**` is text. */
export function parseInlines(line: string): Inline[] {
  const inlines: Inline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const match of line.matchAll(re)) {
    const start = match.index ?? 0;
    if (start > last) inlines.push({ type: "text", text: line.slice(last, start) });
    inlines.push({ type: "bold", text: match[1] });
    last = start + match[0].length;
  }
  if (last < line.length) inlines.push({ type: "text", text: line.slice(last) });
  return inlines;
}

/** Plain text of a run of inlines, bold markers dropped. */
export function inlinesToText(inlines: Inline[]): string {
  return inlines.map((i) => i.text).join("");
}

/** Kebab slug of a section heading with its leading "N." removed. */
export function slugify(heading: string): string {
  return heading
    .replace(/^\d+\.\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Groups non-blank lines into paragraph and list blocks. */
function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: "p", inlines: parseInlines(paragraph.join(" ")) });
    paragraph = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushParagraph();
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    const listType = ul ? "ul" : ol ? "ol" : null;
    if (listType) {
      flushParagraph();
      const item = parseInlines((ul ?? ol)![1]);
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === listType) prev.items.push(item);
      else blocks.push({ type: listType, items: [item] });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
}

/** Turns a "**Title.** Body" list item into a rule. */
function ruleFrom(item: Inline[]): Rule {
  const [first, ...rest] = item;
  if (!first || first.type !== "bold") {
    return { title: "", body: inlinesToText(item).trim() };
  }
  return {
    title: first.text.replace(/\.$/, ""),
    body: inlinesToText(rest).trim(),
  };
}

/** Parses the whole document. Exported for tests; callers use loadTerms(). */
export function parseTerms(markdown: string): Terms {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let version = "";
  let title = "";
  const introLines: string[] = [];
  const sections: Section[] = [];
  const usedIds = new Set<string>();
  let current: { heading: string; lines: string[] } | null = null;

  const pushSection = () => {
    if (!current) return;
    const base = slugify(current.heading) || "section";
    let id = base;
    for (let n = 2; usedIds.has(id); n += 1) id = `${base}-${n}`;
    usedIds.add(id);
    sections.push({ id, heading: current.heading, blocks: parseBlocks(current.lines) });
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    const versionMatch = /^version:\s*(.+)$/.exec(line);
    if (!version && !title && versionMatch) {
      version = versionMatch[1].trim();
      continue;
    }
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      pushSection();
      current = { heading: h2[1].trim(), lines: [] };
      continue;
    }
    const h1 = /^#\s+(.*)$/.exec(line);
    if (h1 && !current) {
      title = h1[1].trim();
      continue;
    }
    if (current) current.lines.push(raw);
    else introLines.push(raw);
  }
  pushSection();

  const intro = parseBlocks(introLines)
    .filter((b) => b.type === "p")
    .map((b) => inlinesToText(b.inlines));

  const rulesList = sections[0]?.blocks.find((b) => b.type === "ol");
  const rules = rulesList && rulesList.type === "ol" ? rulesList.items.map(ruleFrom) : [];

  return { version, title, intro, rules, sections };
}

let cached: Terms | null = null;

/** Reads and parses src/content/terms.md once per process. */
export function loadTerms(): Terms {
  if (cached) return cached;
  const file = path.resolve(process.cwd(), TERMS_PATH);
  cached = parseTerms(readFileSync(file, "utf8"));
  return cached;
}
