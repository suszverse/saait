/**
 * Idempotent, non-destructive seed: rows are inserted when missing (by slug,
 * phone or day) and existing rows are never rewritten, so an operator's
 * approval, a provider's price edit or a renamed category survive a re-run.
 * Runs in one transaction so a failure leaves nothing half-seeded.
 * Usage: pnpm db:seed
 */
import nextEnv from "@next/env";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { fromBs } from "../../lib/nepali-date";
import * as s from "./schema";
import { CATEGORIES, CITIES, DEMO_CLIENT, OPERATORS, PLACES, PROVIDERS, SAAIT_FALGUN_2083 } from "./seed-data";

type DB = ReturnType<typeof drizzle<typeof s>>;

export async function seed(root: DB) {
  return root.transaction(async (tx) => seedIn(tx as unknown as DB));
}

async function seedIn(db: DB) {
  for (const c of CITIES) {
    await db.insert(s.cities).values(c).onConflictDoNothing({ target: s.cities.slug });
  }
  for (const [i, c] of CATEGORIES.entries()) {
    await db.insert(s.serviceCategories).values({ ...c, sortOrder: i }).onConflictDoNothing({ target: s.serviceCategories.slug });
  }
  for (const d of SAAIT_FALGUN_2083) {
    await db.insert(s.auspiciousDates).values({ day: fromBs({ year: 2083, month: 11, day: d }), note: `Falgun ${d}, 2083` }).onConflictDoNothing();
  }
  const cityBySlug = new Map((await db.select().from(s.cities)).map((c) => [c.slug, c]));
  const catBySlug = new Map((await db.select().from(s.serviceCategories)).map((c) => [c.slug, c]));

  // Same rule as the rest: an operator's corrected coordinates or renamed venue survive a re-run.
  for (const pl of PLACES) {
    const { city, ...rest } = pl;
    await db.insert(s.places).values({ ...rest, cityId: city ? cityBySlug.get(city)!.id : null }).onConflictDoNothing({ target: s.places.slug });
  }

  for (const u of [...OPERATORS, { ...DEMO_CLIENT, role: "client" as const }]) {
    await db.insert(s.users).values(u).onConflictDoNothing({ target: s.users.phone });
  }

  for (const p of PROVIDERS) {
    const [existingProfile] = await db.select({ id: s.providerProfiles.id }).from(s.providerProfiles).where(eq(s.providerProfiles.slug, p.slug));
    if (existingProfile) continue; // never rewrite a provider someone may have edited
    await db.insert(s.users).values({ phone: p.phone, name: p.displayName, role: "provider" }).onConflictDoNothing({ target: s.users.phone });
    const [user] = await db.select().from(s.users).where(eq(s.users.phone, p.phone));
    const city = cityBySlug.get(p.city)!;
    const values = {
      userId: user.id,
      slug: p.slug,
      displayName: p.displayName,
      businessName: p.businessName ?? null,
      kind: p.kind,
      alias: p.alias ?? null,
      homeCityId: city.id,
      lat: city.lat,
      lng: city.lng,
      bio: p.bio,
      sinceYear: p.since,
      languages: ["Nepali", "English"],
      dailyCapacity: p.capacity,
      kycStatus: p.kyc,
      kycRejections: p.kycRejections ?? 0,
      verifiedAt: p.kyc === "verified" || p.kyc === "reverification_due" ? new Date("2026-10-01T00:00:00Z") : null,
      citizenshipNumber: p.citizenship ?? null,
      panNumber: p.pan ?? null,
      vatRegistered: p.vatRegistered ?? false,
      payoutMethod: p.payout?.method ?? null,
      payoutAccountName: p.payout?.name ?? null,
      payoutAccountNumber: p.payout?.number ?? null,
      ratingAvg: p.ratingCount ? p.rating : null,
      ratingCount: p.ratingCount,
      completedBookings: p.completed,
      responseMinutes: p.responseMinutes || null,
      plan: p.plan,
      portfolioTones: p.tones,
      photoCount: p.photoCount,
    };
    const [prof] = await db.insert(s.providerProfiles).values(values).returning();
    for (const c of p.categories) {
      await db.insert(s.providerCategories).values({ providerId: prof.id, categoryId: catBySlug.get(c)!.id }).onConflictDoNothing();
    }
    for (const [i, k] of p.packages.entries()) {
      const categoryId = catBySlug.get(k.category)!.id;
      const pv = {
        providerId: prof.id,
        categoryId,
        name: k.name,
        summary: k.summary,
        price: k.price * 100,
        coverageHours: k.hours,
        shooters: k.shooters,
        editedPhotos: k.photos ?? null,
        highlightFilmMinutes: k.filmMinutes ?? null,
        album: k.album ?? false,
        deliveryDays: k.delivery,
        inclusions: k.inclusions,
        peakSurcharge: k.peak * 100,
        position: i,
      };
      const [pkg] = await db.insert(s.packages).values(pv).returning();
      for (const a of k.addons ?? []) {
        await db.insert(s.packageAddons).values({ packageId: pkg.id, name: a.name, price: a.price * 100 });
      }
    }
  }

  // Make the "1 of 3 slots left" and "Full" states on the Figma screens real.
  const shrestha = (await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.slug, "shrestha-studio")))[0];
  const himal = (await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.slug, "himal-captures")))[0];
  if (shrestha) {
    await db.insert(s.availabilityDays).values({ providerId: shrestha.id, day: fromBs({ year: 2083, month: 11, day: 19 }), status: "blocked" }).onConflictDoNothing();
  }
  if (himal) {
    await db.insert(s.availabilityDays).values({ providerId: himal.id, day: fromBs({ year: 2083, month: 11, day: 12 }), status: "blocked" }).onConflictDoNothing();
  }

  const counts = await db.execute(sql`select
    (select count(*) from cities)::int as cities,
    (select count(*) from service_categories)::int as categories,
    (select count(*) from auspicious_dates)::int as saait_days,
    (select count(*) from places)::int as places,
    (select count(*) from provider_profiles)::int as providers,
    (select count(*) from provider_profiles where kyc_status = 'verified')::int as verified,
    (select count(*) from provider_profiles where kyc_status = 'verified' and kind = 'studio' and plan in ('pro', 'studio'))::int as listed,
    (select count(*) from packages)::int as packages,
    (select count(*) from users)::int as users`);
  return counts[0];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  nextEnv.loadEnvConfig(process.cwd());
  const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema: s, casing: "snake_case" });
  try {
    console.log("seeded", await seed(db));
  } finally {
    await client.end();
  }
}
