import "server-only";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { addDays, todayInNepal } from "@/lib/nepali-date";
import { hasAcceptedCurrent } from "./agreement";
import { sms } from "./auth/service";
import { uniqueAlias } from "./crew/alias";
import { checkPrivateProfile } from "./crew/private-profile";
import { db, schema as s } from "./db";
import type { Deps } from "./kyc";
import type { Db } from "./providers";
import { localEncryptedStore } from "./storage/local-encrypted";

export function kycDeps(): Deps {
  return { db: db(), sms: sms(), store: localEncryptedStore(env().DOCUMENT_DIR, env().DOCUMENT_KEY) };
}

export async function providerForUser(userId: string) {
  const [p] = await db().select().from(s.providerProfiles).where(eq(s.providerProfiles.userId, userId));
  return p ?? null;
}

export class ProviderAccountError extends Error {
  constructor(
    public readonly code: "agreement_required",
    message: string,
  ) {
    super(message);
  }
}

/** What a freelancer can be hired for. Fixed so crew profiles stay comparable and carry no free text here. */
export const CREW_ROLES = ["Second shooter", "Candid", "Drone", "Video", "Editing", "Lighting", "Assistant", "Low light"] as const;

/** A studio starts on Business for 30 days at no charge; nothing is listed without a paid plan. */
export const TRIAL_DAYS = 30;

const slugField = (message: string) => z.string({ error: message }).regex(/^[a-z0-9-]{1,40}$/, message);
const common = {
  fullName: z.string({ error: "Enter your full name as on your ID." }).trim().min(3, "Enter your full name as on your ID.").max(120),
  city: slugField("Pick your home city."),
};

/**
 * Two shapes behind one form. A studio is a listed business with a name and
 * packages; a freelancer is crew that studios hire by the day, shown to them
 * under a generated handle, so the fields that would identify them are not
 * collected here at all.
 */
export const onboardingInput = z.discriminatedUnion(
  "kind",
  [
    z.object({
      kind: z.literal("studio"),
      ...common,
      businessName: z.string({ error: "Enter your registered business name." }).trim().min(2, "Enter your registered business name.").max(120),
      displayName: z.string({ error: "Enter the name clients will see." }).trim().min(2, "Enter the name clients will see.").max(80),
      categories: z.array(slugField("Pick a service from the list.")).min(1, "Pick at least one service.").max(9),
    }),
    z.object({
      kind: z.literal("freelancer"),
      ...common,
      headline: z.string({ error: "Write one line about your work." }).trim().min(3, "Write one line about your work.").max(120, "Keep your headline under 120 characters."),
      roles: z.array(z.enum(CREW_ROLES, { error: "Pick roles from the list." })).min(1, "Pick at least one role.").max(6, "Pick up to six roles."),
      /** Rupees as typed; stored as paisa. */
      dayRate: z.coerce.number({ error: "Enter your day rate in rupees." }).int("Enter your day rate in whole rupees.").min(1_000, "Day rate is between Rs 1,000 and Rs 1,00,000.").max(100_000, "Day rate is between Rs 1,000 and Rs 1,00,000."),
      bio: z.string().trim().max(600, "Keep your bio under 600 characters.").optional(),
    }),
  ],
  { error: "Choose freelancer or studio." },
);
export type OnboardingInput = z.infer<typeof onboardingInput>;

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "provider"
  );
}

/**
 * Section 5, step 3: packages start from templates seeded by category, the
 * studio's own packages being the first templates. Providers adjust prices
 * before going live; nothing shows until KYC is verified anyway.
 */
const TEMPLATES: Record<string, { name: string; summary: string; price: number; hours: number; shooters: number; photos?: number; delivery: number; peak: number; inclusions: string[] }[]> = {
  "wedding-photo": [
    { name: "Basic", summary: "One photographer for the main ceremony.", price: 35_000, hours: 8, shooters: 1, photos: 300, delivery: 21, peak: 5_000, inclusions: ["1 photographer", "8 hours", "300 edited photos"] },
    { name: "Standard", summary: "Photo and highlight film, two shooters.", price: 65_000, hours: 10, shooters: 2, photos: 500, delivery: 30, peak: 8_000, inclusions: ["2 shooters", "photo and highlight film", "500 photos"] },
    { name: "Premium", summary: "Cinematic film, drone, album included.", price: 120_000, hours: 12, shooters: 3, photos: 800, delivery: 45, peak: 0, inclusions: ["3 shooters", "cinematic film", "drone", "album"] },
  ],
};
const GENERIC = { name: "Half day", summary: "Up to four hours of coverage.", price: 15_000, hours: 4, shooters: 1, photos: 150, delivery: 7, peak: 0, inclusions: ["1 photographer", "4 hours", "150 photos"] };

/**
 * Section 5, "Provider onboards", step 1. Creates a Registered draft profile:
 * nothing is public until KYC is verified. Operators and admins keep their
 * role; a client account becomes a provider account. Every provider has
 * accepted the current terms first; a freelancer gets a crew handle as their
 * display name and a studio gets a Business trial so it can be listed once
 * verified.
 */
export async function createProviderProfile(db: Db, user: { id: string; role: string }, raw: unknown) {
  if (user.role === "operator" || user.role === "admin") {
    throw new z.ZodError([{ code: "custom", path: [], message: "Operator accounts cannot list as providers. Sign in with a different number.", input: null }]);
  }
  const v = onboardingInput.parse(raw);
  const [existing] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.userId, user.id));
  if (existing) return existing;
  if (!(await hasAcceptedCurrent(db, user.id))) {
    throw new ProviderAccountError("agreement_required", "Please read and accept the terms before listing your work.");
  }
  if (v.kind === "freelancer") {
    const check = checkPrivateProfile({ headline: v.headline, bio: v.bio, roles: v.roles });
    if (!check.ok) throw new z.ZodError([{ code: "custom", path: [check.field], message: check.reason, input: v[check.field] }]);
  }
  const [city] = await db.select().from(s.cities).where(eq(s.cities.slug, v.city));
  if (!city) throw new z.ZodError([{ code: "custom", path: ["city"], message: "Pick your home city.", input: v.city }]);
  const cats = v.kind === "studio" ? await db.select().from(s.serviceCategories).where(inArray(s.serviceCategories.slug, v.categories)) : [];
  if (v.kind === "studio" && cats.length !== new Set(v.categories).size) {
    throw new z.ZodError([{ code: "custom", path: ["categories"], message: "Pick services from the list.", input: v.categories }]);
  }
  const displayName = v.kind === "studio" ? v.displayName : await uniqueAlias(db);
  let slug = slugify(displayName);
  for (let i = 2; ; i++) {
    const [hit] = await db.select({ id: s.providerProfiles.id }).from(s.providerProfiles).where(eq(s.providerProfiles.slug, slug));
    if (!hit) break;
    slug = `${slugify(displayName)}-${i}`;
  }
  const today = todayInNepal();
  return db.transaction(async (tx) => {
    const [p] = await tx
      .insert(s.providerProfiles)
      .values(
        v.kind === "studio"
          ? { userId: user.id, slug, displayName, businessName: v.businessName, kind: v.kind, plan: "pro", homeCityId: city.id, lat: city.lat, lng: city.lng, dailyCapacity: 2 }
          : {
              userId: user.id,
              slug,
              displayName,
              alias: displayName,
              kind: v.kind,
              crewHeadline: v.headline,
              crewRoles: [...v.roles],
              dayRate: v.dayRate * 100,
              bio: v.bio || null,
              homeCityId: city.id,
              lat: city.lat,
              lng: city.lng,
              dailyCapacity: 1,
            },
      )
      .returning();
    if (v.kind === "studio") {
      await tx.insert(s.subscriptions).values({ providerId: p.id, plan: "pro", price: 0, periodStart: today, periodEnd: addDays(today, TRIAL_DAYS) });
    }
    if (cats.length) await tx.insert(s.providerCategories).values(cats.map((c) => ({ providerId: p.id, categoryId: c.id })));
    const pkgs = cats.flatMap((c) =>
      (TEMPLATES[c.slug] ?? [GENERIC]).map((t, i) => ({
        providerId: p.id,
        categoryId: c.id,
        name: t.name,
        summary: t.summary,
        price: t.price * 100,
        coverageHours: t.hours,
        shooters: t.shooters,
        editedPhotos: t.photos ?? null,
        deliveryDays: t.delivery,
        peakSurcharge: t.peak * 100,
        inclusions: t.inclusions,
        position: i,
      })),
    );
    if (pkgs.length) await tx.insert(s.packages).values(pkgs);
    await tx.update(s.users).set({ role: "provider", name: v.fullName }).where(eq(s.users.id, user.id));
    return p;
  });
}

/** Provider home: today's bookings and the next wedding dates with slots left. */
export async function providerToday(providerId: string, capacity: number) {
  const today = todayInNepal();
  const [booked, upcoming, saait] = await Promise.all([
    db()
      .select()
      .from(s.bookings)
      .where(and(eq(s.bookings.providerId, providerId), eq(s.bookings.day, today), inArray(s.bookings.status, ["confirmed", "in_progress"]))),
    db()
      .select({ day: s.bookings.day })
      .from(s.bookings)
      .where(and(eq(s.bookings.providerId, providerId), gte(s.bookings.day, today), inArray(s.bookings.status, ["confirmed", "in_progress"]))),
    db()
      .select()
      .from(s.auspiciousDates)
      .where(and(gte(s.auspiciousDates.day, today), lte(s.auspiciousDates.day, addDays(today, 120))))
      .orderBy(asc(s.auspiciousDates.day))
      .limit(4),
  ]);
  const count = new Map<string, number>();
  for (const b of upcoming) count.set(b.day, (count.get(b.day) ?? 0) + 1);
  return {
    today,
    booked,
    dates: saait.map((d) => ({ day: d.day, left: Math.max(0, capacity - (count.get(d.day) ?? 0)) })),
  };
}
