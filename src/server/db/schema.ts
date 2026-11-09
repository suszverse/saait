/**
 * Core tables from docs/system-plan.md section 10.
 *
 * Conventions: money is bigint paisa (mode "number", safe to 9e15) with a
 * currency column alongside; calendar days are Postgres `date` (Gregorian,
 * displayed in Bikram Sambat at the edge); every row has created_at.
 * Migrations are forward-only.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => bigint(name, { mode: "number" });
const currency = () => text("currency").notNull().default("NPR");

// ---------- enums ----------
export const roleEnum = pgEnum("role", ["client", "provider", "operator", "admin"]);
export const kycStatusEnum = pgEnum("kyc_status", [
  "registered",
  "submitted",
  "under_review",
  "verified",
  "rejected",
  "reverification_due",
]);
export const providerKindEnum = pgEnum("provider_kind", ["freelancer", "studio"]);
export const documentKindEnum = pgEnum("document_kind", [
  "id_front",
  "id_back",
  "selfie",
  "pan_certificate",
  "company_registration",
  "vat_certificate",
  "signatory_letter",
  "payout_proof",
]);
export const dayStatusEnum = pgEnum("day_status", ["open", "blocked"]);
export const holdStatusEnum = pgEnum("hold_status", ["active", "converted", "expired", "released"]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "held",
  "confirmed",
  "in_progress",
  "delivered",
  "completed",
  "cancelled",
  "disputed",
]);
/** Phase 2 hook: urgent requests and the dispatch engine read this. */
export const urgencyEnum = pgEnum("urgency", ["standard", "urgent"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "succeeded", "failed", "refunded"]);
export const paymentKindEnum = pgEnum("payment_kind", ["deposit_and_fee", "refund"]);
export const payoutStatusEnum = pgEnum("payout_status", ["scheduled", "held", "paid"]);
export const planEnum = pgEnum("plan", ["free", "pro", "studio"]);
export const disputeStatusEnum = pgEnum("dispute_status", ["open", "decided"]);
export const offerStatusEnum = pgEnum("offer_status", ["sent", "accepted", "declined", "expired"]);
export const themePrefEnum = pgEnum("theme_pref", ["system", "light", "dark"]);
export const placeKindEnum = pgEnum("place_kind", ["district", "municipality", "ward", "chowk", "venue"]);
/** Screening holds a message before the other side sees it; cleared means a reviewer let it through. */
export const messageStatusEnum = pgEnum("message_status", ["held", "delivered", "cleared"]);
export const threadKindEnum = pgEnum("thread_kind", ["client_business", "business_crew"]);
export const reportStatusEnum = pgEnum("report_status", ["open", "confirmed", "dismissed"]);
/** Credit is spendable paisa off a booking fee; points are the reputation balance. */
export const rewardKindEnum = pgEnum("reward_kind", ["credit", "points"]);
export const rewardReasonEnum = pgEnum("reward_reason", [
  "booking_completed",
  "on_time",
  "review_left",
  "five_star",
  "referral",
  "report_confirmed",
  "urgent_completed",
  "crew_job_completed",
  "no_show",
  "checkout_spend",
  "plan_month",
  "expiry",
  "reset",
]);
/** A business offers a freelancer a day; no_show is set after the day passes without the crew turning up. */
export const crewJobStatusEnum = pgEnum("crew_job_status", ["offered", "accepted", "declined", "completed", "no_show"]);
export const mediaKindEnum = pgEnum("media_kind", ["photo", "clip"]);
/** Uploads wait for screening; held items stay private to the provider with a reason. */
export const mediaStatusEnum = pgEnum("media_status", ["pending", "approved", "held"]);

// ---------- people ----------
export const users = pgTable(
  "users",
  {
    id: id(),
    phone: text("phone").notNull(), // E.164, +977XXXXXXXXXX
    name: text("name"),
    role: roleEnum("role").notNull().default("client"),
    phoneLockedUntil: timestamp("phone_locked_until", { withTimezone: true }),
    theme: themePrefEnum("theme").notNull().default("system"),
    /** Set when a confirmed report pauses this user's chat; null means they may write. */
    chatPausedUntil: timestamp("chat_paused_until", { withTimezone: true }),
    /** Rewards points cannot be earned or spent while frozen. */
    pointsFrozenUntil: timestamp("points_frozen_until", { withTimezone: true }),
    /** Short code this user shares; a referee's sign-up with it writes a referrals row. */
    referralCode: text("referral_code").unique(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_phone_uq").on(t.phone)],
);

/** One row per user per version of the terms accepted at sign-up or on re-prompt. */
export const agreementAcceptances = pgTable(
  "agreement_acceptances",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agreement_acceptances_user_version_uq").on(t.userId, t.version)],
);

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: id(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: smallint("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("otp_codes_phone_idx").on(t.phone, t.createdAt)],
);

// ---------- reference data ----------
export const cities = pgTable("cities", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  nameNp: text("name_np"),
  cluster: text("cluster").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  createdAt: createdAt(),
});

/**
 * Places a client can type as a venue or search area: districts down to chowks
 * and named venues. Coordinates are bounded to Nepal so a bad geocode cannot
 * land a row in the sea.
 */
export const places = pgTable(
  "places",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    nameNp: text("name_np"),
    kind: placeKindEnum("kind").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    district: text("district").notNull(),
    cityId: uuid("city_id").references(() => cities.id),
    /** Where the row came from: seed | operator | geocoder. */
    source: text("source").notNull().default("seed"),
    createdAt: createdAt(),
  },
  (t) => [
    index("places_name_lower_idx").on(sql`lower(${t.name})`),
    check("places_in_nepal", sql`${t.lat} between 26.3 and 30.5 and ${t.lng} between 80.0 and 88.3`),
  ],
);

export const serviceCategories = pgTable("service_categories", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/** The pre-loaded auspicious wedding-date layer. */
export const auspiciousDates = pgTable("auspicious_dates", {
  day: date("day").primaryKey(),
  note: text("note"),
  createdAt: createdAt(),
});

// ---------- providers ----------
export const providerProfiles = pgTable(
  "provider_profiles",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id).unique(),
    slug: text("slug").notNull().unique(),
    displayName: text("display_name").notNull(),
    businessName: text("business_name"),
    kind: providerKindEnum("kind").notNull().default("freelancer"),
    /** Freelancers are anonymous to clients: "Crew A3-417" stands in for the name. Required when kind = freelancer. */
    alias: text("alias"),
    crewHeadline: text("crew_headline"),
    crewRoles: text("crew_roles").array().notNull().default(sql`'{}'::text[]`),
    /** Crew day rate in NPR paisa, shown to studios hiring crew. */
    dayRate: money("day_rate"),
    homeCityId: uuid("home_city_id").references(() => cities.id),
    serviceRadiusKm: integer("service_radius_km").notNull().default(25),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    bio: text("bio"),
    sinceYear: smallint("since_year"),
    languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
    /** Per-date capacity: a studio takes three events, a freelancer one. */
    dailyCapacity: smallint("daily_capacity").notNull().default(1),
    // KYC
    kycStatus: kycStatusEnum("kyc_status").notNull().default("registered"),
    kycRejections: smallint("kyc_rejections").notNull().default(0),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    reverifyBy: date("reverify_by"),
    /** As typed on the card, for display. Uniqueness is on the derived key. */
    citizenshipNumber: text("citizenship_number"),
    /** Digits only, Devanagari digits folded to ASCII: 27-01-71-00412 = २७०१७१००४१२. */
    citizenshipKey: text("citizenship_key").generatedAlwaysAs(
      sql`nullif(regexp_replace(translate(citizenship_number, '०१२३४५६७८९', '0123456789'), '[^0-9]', '', 'g'), '')`,
    ),
    passportNumber: text("passport_number"),
    /** Upper-case letters and digits only. */
    passportKey: text("passport_key").generatedAlwaysAs(
      sql`nullif(upper(regexp_replace(passport_number, '[^0-9A-Za-z]', '', 'g')), '')`,
    ),
    panNumber: text("pan_number"),
    vatRegistered: boolean("vat_registered").notNull().default(false),
    payoutMethod: text("payout_method"), // bank | esewa | khalti
    payoutAccountName: text("payout_account_name"),
    payoutAccountNumber: text("payout_account_number"),
    payoutHoldUntil: date("payout_hold_until"),
    gearSummary: text("gear_summary"),
    /**
     * Travel fee zones beyond the service radius: [{ upToKm, fee }], fee in
     * NPR paisa. Display configuration only; any fee charged is snapshotted
     * into a booking add-on as a bigint like every other amount.
     */
    travelFeeZones: jsonb("travel_fee_zones").$type<{ upToKm: number; fee: number }[]>().notNull().default(sql`'[]'::jsonb`),
    // Stats shown on cards; recomputed from bookings and reviews.
    ratingAvg: doublePrecision("rating_avg"),
    ratingCount: integer("rating_count").notNull().default(0),
    completedBookings: integer("completed_bookings").notNull().default(0),
    responseMinutes: integer("response_minutes"),
    reliabilityScore: smallint("reliability_score").notNull().default(100),
    plan: planEnum("plan").notNull().default("free"),
    portfolioTones: text("portfolio_tones").array().notNull().default(sql`'{}'::text[]`),
    photoCount: integer("photo_count").notNull().default(0),
    urgentOptIn: boolean("urgent_opt_in").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    // Section 15: one provider profile per citizenship number and per PAN.
    uniqueIndex("provider_citizenship_uq").on(t.citizenshipKey),
    uniqueIndex("provider_passport_uq").on(t.passportKey),
    uniqueIndex("provider_pan_uq").on(t.panNumber).where(sql`${t.panNumber} is not null`),
    uniqueIndex("provider_alias_uq").on(t.alias).where(sql`${t.alias} is not null`),
    index("provider_kyc_idx").on(t.kycStatus),
    // A number that normalises to nothing would dodge the unique index.
    check("citizenship_has_digits", sql`${t.citizenshipNumber} is null or ${t.citizenshipKey} is not null`),
    check("passport_has_characters", sql`${t.passportNumber} is null or ${t.passportKey} is not null`),
    check("pan_nine_digits", sql`${t.panNumber} is null or ${t.panNumber} ~ '^[0-9]{9}$'`),
    check("capacity_positive", sql`${t.dailyCapacity} between 1 and 20`),
    check("freelancer_has_alias", sql`${t.kind} <> 'freelancer' or ${t.alias} is not null`),
    check("day_rate_non_negative", sql`${t.dayRate} is null or ${t.dayRate} >= 0`),
  ],
);

export const providerCategories = pgTable(
  "provider_categories",
  {
    providerId: uuid("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => serviceCategories.id),
  },
  (t) => [primaryKey({ columns: [t.providerId, t.categoryId] })],
);

/** Linked media (Phase 1) carries a url; uploaded media carries a storage key. Never neither. */
export const portfolioItems = pgTable(
  "portfolio_items",
  {
    id: id(),
    providerId: uuid("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // image | reel | youtube
    mediaKind: mediaKindEnum("media_kind").notNull().default("photo"),
    url: text("url"),
    storageKey: text("storage_key"),
    status: mediaStatusEnum("status").notNull().default("pending"),
    /** Why screening held it, shown to the provider. */
    reason: text("reason"),
    durationSeconds: integer("duration_seconds"),
    bytes: bigint("bytes", { mode: "number" }),
    caption: text("caption"),
    position: smallint("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [check("portfolio_has_media", sql`${t.url} is not null or ${t.storageKey} is not null`)],
);

/** Section 4: channels, quiet hours and alert scope. Urgent opt-in is Phase 2. */
export const notificationPreferences = pgTable("notification_preferences", {
  providerId: uuid("provider_id").primaryKey().references(() => providerProfiles.id, { onDelete: "cascade" }),
  sms: boolean("sms").notNull().default(true),
  email: text("email"),
  quietFrom: smallint("quiet_from"), // hour 0-23, Nepal time
  quietTo: smallint("quiet_to"),
  cityIds: uuid("city_ids").array().notNull().default(sql`'{}'::uuid[]`),
  categoryIds: uuid("category_ids").array().notNull().default(sql`'{}'::uuid[]`),
  urgentAlerts: boolean("urgent_alerts").notNull().default(false),
  createdAt: createdAt(),
});

export const providerDocuments = pgTable(
  "provider_documents",
  {
    id: id(),
    providerId: uuid("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "cascade" }),
    kind: documentKindEnum("kind").notNull(),
    /** Storage key of the AES-256-GCM encrypted blob, never a public URL. */
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("provider_documents_provider_idx").on(t.providerId, t.kind)],
);

/** One row per operator decision on a KYC submission. */
export const kycReviews = pgTable("kyc_reviews", {
  id: id(),
  providerId: uuid("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").notNull().references(() => users.id),
  decision: text("decision").notNull(), // approved | rejected | needs_better_photo
  checklist: jsonb("checklist").$type<Record<string, boolean>>().notNull(),
  note: text("note"),
  createdAt: createdAt(),
});

// ---------- packages and calendar ----------
export const packages = pgTable(
  "packages",
  {
    id: id(),
    providerId: uuid("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => serviceCategories.id),
    name: text("name").notNull(),
    summary: text("summary").notNull(),
    price: money("price").notNull(),
    currency: currency(),
    coverageHours: smallint("coverage_hours").notNull(),
    shooters: smallint("shooters").notNull().default(1),
    editedPhotos: integer("edited_photos"),
    highlightFilmMinutes: smallint("highlight_film_minutes"),
    rawFiles: boolean("raw_files").notNull().default(false),
    album: boolean("album").notNull().default(false),
    deliveryDays: smallint("delivery_days").notNull(),
    inclusions: text("inclusions").array().notNull().default(sql`'{}'::text[]`),
    exclusions: text("exclusions"),
    depositPercent: smallint("deposit_percent").notNull().default(25),
    /** Shown upfront on the card, applied on auspicious dates. */
    peakSurcharge: money("peak_surcharge").notNull().default(0),
    /** Provider's own display order. Never sorted cheapest-first by default. */
    position: smallint("position").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index("packages_provider_idx").on(t.providerId, t.categoryId),
    check("price_positive", sql`${t.price} > 0 and ${t.peakSurcharge} >= 0`),
    check("packages_currency", sql`${t.currency} = 'NPR'`),
    check("deposit_percent_range", sql`${t.depositPercent} between 10 and 50`),
  ],
);

export const packageAddons = pgTable(
  "package_addons",
  {
    id: id(),
    packageId: uuid("package_id").notNull().references(() => packages.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    price: money("price").notNull(),
    currency: currency(),
    createdAt: createdAt(),
  },
  (t) => [check("addon_price_positive", sql`${t.price} > 0 and ${t.currency} = 'NPR'`)],
);

/** Only exceptions are stored: a day with no row is open at full capacity. */
export const availabilityDays = pgTable(
  "availability_days",
  {
    providerId: uuid("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    status: dayStatusEnum("status").notNull().default("open"),
    capacity: smallint("capacity"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.providerId, t.day] })],
);

export const dateHolds = pgTable(
  "date_holds",
  {
    id: id(),
    providerId: uuid("provider_id").notNull().references(() => providerProfiles.id),
    /** A hold comes from checkout on a package or from a custom offer. */
    packageId: uuid("package_id").references(() => packages.id),
    offerId: uuid("offer_id").references((): AnyPgColumn => offers.id),
    clientId: uuid("client_id").notNull().references(() => users.id),
    day: date("day").notNull(),
    status: holdStatusEnum("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("date_holds_day_idx").on(t.providerId, t.day, t.status),
    check("hold_has_source", sql`num_nonnulls(${t.packageId}, ${t.offerId}) = 1`),
  ],
);

// ---------- conversation (Phase 2 surface; Phase 1 uses WhatsApp deep links) ----------
export const enquiries = pgTable("enquiries", {
  id: id(),
  providerId: uuid("provider_id").notNull().references(() => providerProfiles.id),
  clientId: uuid("client_id").notNull().references(() => users.id),
  packageId: uuid("package_id").references(() => packages.id),
  day: date("day"),
  channel: text("channel").notNull().default("whatsapp"),
  createdAt: createdAt(),
});

/**
 * One conversation between two accounts about a business. Client to business
 * threads carry a booking or a day; business to crew threads carry neither.
 * Participants are stored as (a, b) in the order the caller normalises them.
 */
export const chatThreads = pgTable(
  "chat_threads",
  {
    id: id(),
    kind: threadKindEnum("kind").notNull(),
    aUserId: uuid("a_user_id").notNull().references(() => users.id),
    bUserId: uuid("b_user_id").notNull().references(() => users.id),
    providerId: uuid("provider_id").notNull().references(() => providerProfiles.id),
    bookingId: uuid("booking_id").references((): AnyPgColumn => bookings.id),
    day: date("day"),
    createdAt: createdAt(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  },
  (t) => [
    // Null days collapse onto the epoch so two general threads for the same pair dedupe too.
    uniqueIndex("chat_threads_pair_day_uq").on(t.aUserId, t.bUserId, t.providerId, sql`coalesce(${t.day}, '1970-01-01'::date)`),
    check("thread_two_parties", sql`${t.aUserId} <> ${t.bUserId}`),
  ],
);

/** Belongs to a chat thread (Phase 3) or to a legacy enquiry (Phase 1), never neither. */
export const messages = pgTable(
  "messages",
  {
    id: id(),
    enquiryId: uuid("enquiry_id").references(() => enquiries.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => chatThreads.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    status: messageStatusEnum("status").notNull().default("delivered"),
    /** Why screening held it, shown to the sender. */
    reason: text("reason"),
    /** Which screening layer fired (1 = text patterns, 2 = normalised digits, 3 = image/QR). */
    heldLayer: smallint("held_layer"),
    attachmentKey: text("attachment_key"),
    appealedAt: timestamp("appealed_at", { withTimezone: true }),
    reviewedById: uuid("reviewed_by_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewOutcome: text("review_outcome"), // cleared | upheld
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_thread_created_idx").on(t.threadId, t.createdAt),
    check("message_has_home", sql`${t.threadId} is not null or ${t.enquiryId} is not null`),
  ],
);

/** A user flags a business (optionally pointing at a thread); an operator decides. */
export const reports = pgTable("reports", {
  id: id(),
  reporterId: uuid("reporter_id").notNull().references(() => users.id),
  subjectProviderId: uuid("subject_provider_id").notNull().references(() => providerProfiles.id),
  threadId: uuid("thread_id").references(() => chatThreads.id),
  reason: text("reason").notNull(),
  status: reportStatusEnum("status").notNull().default("open"),
  decidedById: uuid("decided_by_id").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Contact details unlock after the deposit; each viewer's first look is recorded once. */
export const contactReveals = pgTable(
  "contact_reveals",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().references((): AnyPgColumn => bookings.id),
    viewerId: uuid("viewer_id").notNull().references(() => users.id),
    revealedAt: timestamp("revealed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("contact_reveals_once_uq").on(t.bookingId, t.viewerId)],
);

/** Custom offers; in Phase 1 the operator enters them on the client's behalf. */
export const offers = pgTable(
  "offers",
  {
  id: id(),
  enquiryId: uuid("enquiry_id").references(() => enquiries.id),
  providerId: uuid("provider_id").notNull().references(() => providerProfiles.id),
  clientId: uuid("client_id").notNull().references(() => users.id),
  day: date("day").notNull(),
  description: text("description").notNull(),
  price: money("price").notNull(),
  currency: currency(),
  depositPercent: smallint("deposit_percent").notNull().default(25),
  status: offerStatusEnum("status").notNull().default("sent"),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  },
  (t) => [check("offer_money", sql`${t.price} > 0 and ${t.depositPercent} between 10 and 50 and ${t.currency} = 'NPR'`)],
);

// ---------- bookings and money ----------
export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    code: text("code").notNull().unique(), // SA-4471
    clientId: uuid("client_id").notNull().references(() => users.id),
    providerId: uuid("provider_id").notNull().references(() => providerProfiles.id),
    packageId: uuid("package_id").references(() => packages.id),
    offerId: uuid("offer_id").references(() => offers.id),
    holdId: uuid("hold_id").references(() => dateHolds.id),
    day: date("day").notNull(),
    urgency: urgencyEnum("urgency").notNull().default("standard"),
    status: bookingStatusEnum("status").notNull().default("held"),
    venue: text("venue").notNull(),
    venueLat: doublePrecision("venue_lat"),
    venueLng: doublePrecision("venue_lng"),
    contactPhone: text("contact_phone").notNull(),
    // Price snapshot at booking time.
    packageName: text("package_name").notNull(),
    packagePrice: money("package_price").notNull(),
    peakSurcharge: money("peak_surcharge").notNull().default(0),
    addonsTotal: money("addons_total").notNull().default(0),
    addons: jsonb("addons").$type<{ id: string; name: string; price: number }[]>().notNull().default(sql`'[]'::jsonb`),
    agreedTotal: money("agreed_total").notNull(),
    depositAmount: money("deposit_amount").notNull(),
    bookingFee: money("booking_fee").notNull(),
    /** VAT inside the booking fee (fee x 13/113), for the invoice. */
    bookingFeeVat: money("booking_fee_vat").notNull().default(0),
    /** Reward credit spent at checkout; only ever reduces the booking fee, never the deposit. */
    creditApplied: money("credit_applied").notNull().default(0),
    urgentSurcharge: money("urgent_surcharge").notNull().default(0),
    balanceDue: money("balance_due").notNull(),
    currency: currency(),
    cancellationPolicy: jsonb("cancellation_policy").$type<{ minDaysBefore: number; refundPercent: number }[]>().notNull(),
    balancePaidProviderConfirmedAt: timestamp("balance_paid_provider_confirmed_at", { withTimezone: true }),
    balancePaidClientConfirmedAt: timestamp("balance_paid_client_confirmed_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    galleryUrl: text("gallery_url"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("bookings_provider_day_idx").on(t.providerId, t.day, t.status),
    index("bookings_client_idx").on(t.clientId),
    check(
      "booking_money_non_negative",
      sql`${t.packagePrice} >= 0 and ${t.peakSurcharge} >= 0 and ${t.agreedTotal} >= 0 and ${t.balanceDue} >= 0 and ${t.depositAmount} <= ${t.agreedTotal} and ${t.addonsTotal} >= 0 and ${t.depositAmount} >= 0 and ${t.bookingFee} >= 0 and ${t.bookingFeeVat} >= 0 and ${t.urgentSurcharge} >= 0 and ${t.currency} = 'NPR'`,
    ),
    check("booking_money_consistent", sql`${t.agreedTotal} = ${t.packagePrice} + ${t.peakSurcharge} + ${t.addonsTotal} and ${t.balanceDue} = ${t.agreedTotal} - ${t.depositAmount}`),
    check("booking_credit_within_fee", sql`${t.creditApplied} >= 0 and ${t.creditApplied} <= ${t.bookingFee}`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id),
    kind: paymentKindEnum("kind").notNull().default("deposit_and_fee"),
    gateway: text("gateway").notNull(), // manual | esewa | khalti | fonepay
    method: text("method").notNull(),
    /** Idempotency: one row per gateway reference. */
    gatewayRef: text("gateway_ref").notNull(),
    amount: money("amount").notNull(),
    currency: currency(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    raw: jsonb("raw"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("payments_gateway_ref_uq").on(t.gateway, t.gatewayRef),
    check("payments_amount_positive", sql`${t.amount} > 0 and ${t.currency} = 'NPR'`),
  ],
);

export const payouts = pgTable(
  "payouts",
  {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id).unique(),
  providerId: uuid("provider_id").notNull().references(() => providerProfiles.id),
  grossDeposit: money("gross_deposit").notNull(),
  withheld: money("withheld").notNull(),
  netAmount: money("net_amount").notNull(),
  currency: currency(),
  status: payoutStatusEnum("status").notNull().default("scheduled"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  approvedById: uuid("approved_by_id").references(() => users.id),
  createdAt: createdAt(),
  },
  (t) => [check("payout_consistent", sql`${t.grossDeposit} >= 0 and ${t.withheld} >= 0 and ${t.withheld} <= ${t.grossDeposit} and ${t.netAmount} = ${t.grossDeposit} - ${t.withheld} and ${t.currency} = 'NPR'`)],
);

export const withholdingRecords = pgTable(
  "withholding_records",
  {
  id: id(),
  payoutId: uuid("payout_id").notNull().references(() => payouts.id).unique(),
  providerPan: text("provider_pan").notNull(),
  rateBp: integer("rate_bp").notNull(),
  amount: money("amount").notNull(),
  currency: currency(),
  tdsCertificateRef: text("tds_certificate_ref"),
  filedAt: timestamp("filed_at", { withTimezone: true }),
  createdAt: createdAt(),
  },
  (t) => [check("withholding_money", sql`${t.amount} >= 0 and ${t.rateBp} between 0 and 10000 and ${t.currency} = 'NPR'`)],
);

// ---------- crew ----------
/**
 * A business hires a freelancer for one day at a day rate, optionally for a
 * specific booking. A freelancer holds at most one live (offered or accepted)
 * job per day; declined and finished jobs free the day again.
 */
export const crewJobs = pgTable(
  "crew_jobs",
  {
    id: id(),
    businessId: uuid("business_id").notNull().references(() => providerProfiles.id),
    freelancerId: uuid("freelancer_id").notNull().references(() => providerProfiles.id),
    bookingId: uuid("booking_id").references(() => bookings.id),
    day: date("day").notNull(),
    role: text("role").notNull(), // second_shooter | videographer | drone | editor ...
    dayRate: money("day_rate").notNull(),
    currency: currency(),
    status: crewJobStatusEnum("status").notNull().default("offered"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("crew_jobs_freelancer_day_live_uq").on(t.freelancerId, t.day).where(sql`${t.status} in ('offered', 'accepted')`),
    index("crew_jobs_business_day_idx").on(t.businessId, t.day),
    check("crew_job_money", sql`${t.dayRate} >= 0 and ${t.currency} = 'NPR'`),
    check("crew_job_two_parties", sql`${t.businessId} <> ${t.freelancerId}`),
  ],
);

/** A review sits on a booking (client and business rate each other) or on a crew job (business and crew), never both. */
export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    bookingId: uuid("booking_id").references(() => bookings.id),
    crewJobId: uuid("crew_job_id").references(() => crewJobs.id),
    authorId: uuid("author_id").notNull().references(() => users.id),
    subjectId: uuid("subject_id").notNull().references(() => users.id),
    rating: smallint("rating").notNull(),
    body: text("body"),
    photos: text("photos").array().notNull().default(sql`'{}'::text[]`),
    reply: text("reply"),
    replyAt: timestamp("reply_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reviews_one_per_side_uq").on(t.bookingId, t.authorId),
    check("rating_range", sql`${t.rating} between 1 and 5`),
    check("review_has_subject", sql`num_nonnulls(${t.bookingId}, ${t.crewJobId}) = 1`),
  ],
);

export const disputes = pgTable(
  "disputes",
  {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id),
  openedById: uuid("opened_by_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  evidence: jsonb("evidence").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  status: disputeStatusEnum("status").notNull().default("open"),
  decision: text("decision"),
  refundAmount: money("refund_amount"),
  currency: currency(),
  decidedById: uuid("decided_by_id").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: createdAt(),
  },
  (t) => [check("dispute_money", sql`(${t.refundAmount} is null or ${t.refundAmount} >= 0) and ${t.currency} = 'NPR'`)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
  id: id(),
  providerId: uuid("provider_id").notNull().references(() => providerProfiles.id),
  plan: planEnum("plan").notNull(),
  price: money("price").notNull(),
  currency: currency(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  createdAt: createdAt(),
  },
  (t) => [check("subscription_money", sql`${t.price} >= 0 and ${t.currency} = 'NPR' and ${t.periodEnd} > ${t.periodStart}`)],
);

/** Phase 2 hook: the dispatch engine draws from this pool. */
export const backupPoolMembers = pgTable(
  "backup_pool_members",
  {
    providerId: uuid("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "cascade" }),
    cityId: uuid("city_id").notNull().references(() => cities.id),
    categoryId: uuid("category_id").notNull().references(() => serviceCategories.id),
    standbyFee: money("standby_fee").notNull().default(0),
    currency: currency(),
    responseSlaMinutes: integer("response_sla_minutes").notNull().default(60),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.providerId, t.cityId, t.categoryId] }),
    check("standby_money", sql`${t.standbyFee} >= 0 and ${t.currency} = 'NPR'`),
  ],
);

// ---------- rewards ----------
/** One row per referee; the referrer is credited through the ledger when the referee's first booking completes. */
export const referrals = pgTable(
  "referrals",
  {
    id: id(),
    referrerId: uuid("referrer_id").notNull().references(() => users.id),
    refereeId: uuid("referee_id").notNull().references(() => users.id).unique(),
    createdAt: createdAt(),
  },
  (t) => [check("referral_two_people", sql`${t.referrerId} <> ${t.refereeId}`)],
);

/**
 * Append-only: a balance is the sum of a user's rows, and corrections are new
 * rows with the opposite sign. A trigger in migration 0005 rejects UPDATE and
 * DELETE. Each earning event may be written once per source row; spend,
 * expiry and plan months recur, so the idempotency index skips those reasons.
 */
export const rewardLedger = pgTable(
  "reward_ledger",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id),
    kind: rewardKindEnum("kind").notNull(),
    /** Signed: positive earns, negative spends or forfeits. Credit is NPR paisa, points are points. */
    amount: bigint("amount", { mode: "number" }).notNull(),
    reason: rewardReasonEnum("reason").notNull(),
    bookingId: uuid("booking_id").references(() => bookings.id),
    reviewId: uuid("review_id").references(() => reviews.id),
    crewJobId: uuid("crew_job_id").references(() => crewJobs.id),
    reportId: uuid("report_id").references(() => reports.id),
    referralId: uuid("referral_id").references(() => referrals.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("reward_ledger_user_idx").on(t.userId, t.kind, t.createdAt),
    uniqueIndex("reward_ledger_once_uq")
      .on(
        t.userId,
        t.kind,
        t.reason,
        sql`coalesce(${t.bookingId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        sql`coalesce(${t.reviewId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        sql`coalesce(${t.crewJobId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        sql`coalesce(${t.reportId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        sql`coalesce(${t.referralId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${t.reason} not in ('checkout_spend', 'expiry', 'plan_month')`),
    check("reward_amount_nonzero", sql`${t.amount} <> 0`),
  ],
);

// ---------- operations ----------
export const outboxStatusEnum = pgEnum("outbox_status", ["pending", "sending", "sent"]);

/**
 * Outbound SMS outbox. Rows are written in the same transaction as the state
 * change they announce, then claimed one at a time before sending, so a text
 * is never lost to a crash and never sent twice by concurrent workers.
 */
export const smsOutbox = pgTable(
  "sms_outbox",
  {
    id: id(),
    bookingId: uuid("booking_id").references(() => bookings.id),
    purpose: text("purpose").notNull(),
    to: text("to").notNull(),
    body: text("body").notNull(),
    status: outboxStatusEnum("status").notNull().default("pending"),
    attempts: smallint("attempts").notNull().default(0),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sms_outbox_once_uq").on(t.bookingId, t.purpose, t.to),
    index("sms_outbox_pending_idx").on(t.status, t.createdAt),
  ],
);

export const smsLog = pgTable("sms_log", {
  id: id(),
  to: text("to").notNull(),
  body: text("body").notNull(),
  provider: text("provider").notNull(),
  purpose: text("purpose").notNull(),
  createdAt: createdAt(),
});

/** Section 15: every KYC decision, payout and dispute outcome. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    detail: jsonb("detail"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_subject_idx").on(t.subjectType, t.subjectId)],
);
