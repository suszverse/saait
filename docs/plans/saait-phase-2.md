# Plan

<!-- harness:begin 7ca902e8-9a21-4aa4-969f-bf1715d73be1 -->
### Build the Saait redesign v2 in code: business/crew account kinds with the seven-rules agreement, venue-as-a-point search, secure chat with an operator queue, rewards ledger, crew hiring, portfolios with free reviews, a dark theme and per-role navigation

`saait-phase-2` · session `7ca902e8-9a21-4aa4-969f-bf1715d73be1` · status **draft**

**0/66** tasks closed (0 verified, 0 shipped).

## P1 — Accounts, agreement, theme shell  (0/19)

Each new account picks a kind, accepts the seven rules and lands in the right area. Clients only ever see businesses. Light and dark tokens are in place, so every later screen is built on them from the start.

**Exit criteria:** A new phone number goes /join, picks Business or Freelancer, accepts the seven rules (an agreement_acceptances row with the current version) and reaches onboarding. A freelancer is given a 'Crew Xn-nnn' alias and never appears in /results, /p/<slug> or /book/<slug>. The theme switch flips html[data-theme] with no flash and survives a reload. /business and /crew answer only to their own kind. pnpm typecheck, pnpm lint, pnpm test and pnpm e2e all pass.

- [ ] **P1.T1** Add agreement, theme and alias columns  `todo`
      - depends on: — (independent)
      - files: `src/server/db/schema.ts`, `drizzle/`, `src/server/db/schema.test.ts`
      - done when: Migration 0002 is generated and applies forward-only. It adds: table agreement_acceptances (id, user_id fk, version text, accepted_at timestamptz, unique (user_id, version)); enum theme_pref (system|light|dark) and users.theme default 'system'; provider_profiles.alias (text, unique where not null), crew_headline text, crew_roles text[] default '{}', day_rate money (paisa) with currency and CHECK day_rate >= 0; CHECK (kind <> 'freelancer' or alias is not null). Existing freelancer rows get an alias backfilled inside the migration SQL. In schema.test.ts, a freelancer insert without an alias is rejected and a duplicate (user, version) acceptance is rejected.
      - verify: `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:reset:test`, `pnpm test -- src/server/db/schema.test.ts`, `pnpm typecheck`
      - commit: `feat(db): agreement acceptances, theme preference and crew alias columns`
- [ ] **P1.T2** Write the public terms source  `todo`
      - depends on: — (independent)
      - files: `src/content/terms.md`
      - done when: The first line is 'version: 2026-11-09'. Section 1 lists exactly seven numbered bold-titled rules, word for word as section 1 of docs/legal/terms-draft.md. Sections 2 to 9 of the draft follow. The draft's status line and its 'Open for the lawyer' section are left out. The file does not contain the words 'anonymous', 'alias' or 'strike' (copy rule in docs/design/figma.md).
      - verify: `test "$(grep -cE '^[1-7]\. \*\*' src/content/terms.md)" = 7`, `! grep -inE 'anonymous|alias|strike|lawyer' src/content/terms.md`
      - commit: `docs(legal): public terms source shared by sign-up and /terms`
- [ ] **P1.T3** Parse terms markdown into rules  `todo`
      - depends on: P1.T2
      - files: `src/lib/terms.ts`, `src/lib/terms.test.ts`
      - done when: loadTerms() returns {version, rules: {title, body}[], sections: {id, heading, blocks}[]}. It supports a small markdown subset (headings, paragraphs, ordered and unordered lists, bold) and adds no new dependency. Tests check that version equals '2026-11-09', that rules.length is 7, that each rule title matches the bold text in section 1 of docs/legal/terms-draft.md, and that section ids are unique slugs.
      - verify: `pnpm test -- src/lib/terms.test.ts`, `pnpm typecheck`
      - commit: `feat(legal): parse the terms source into the seven rules and sections`
- [ ] **P1.T4** Render the /terms page  `todo`
      - depends on: P1.T3
      - files: `src/app/terms/page.tsx`, `src/components/legal/terms-body.tsx`
      - done when: GET /terms renders frame J3: a sidebar of contents that anchor-links every section id, the seven rules first, then sections 2 to 9, and the version date. It is public, needs no session, and uses only Saait tokens. terms-body.tsx is the renderer that the agreement screen reuses.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(legal): /terms page rendered from the shared terms source`
- [ ] **P1.T5** Record agreement acceptance server-side  `todo`
      - depends on: P1.T1, P1.T3
      - files: `src/server/agreement.ts`, `src/server/agreement.test.ts`
      - done when: acceptAgreement(db, userId, raw) validates {version: string, accepted: literal true} with zod. It throws AgreementError when the version is not the current loadTerms().version. It is idempotent and writes an audit() row. hasAcceptedCurrent(db, userId) returns a boolean. Tests cover a stale version, accepted=false, a double accept (one row) and the audit row.
      - verify: `pnpm test -- src/server/agreement.test.ts`, `pnpm typecheck`
      - commit: `feat(agreement): store versioned acceptance of the seven rules`
- [ ] **P1.T6** Build Join and agreement screens  `todo`
      - depends on: P1.T4, P1.T5
      - files: `src/app/join/page.tsx`, `src/app/join/agree/page.tsx`, `src/app/join/agree/actions.ts`, `src/app/join/agree/agree-form.tsx`, `src/app/login/actions.ts`, `src/server/db/seed.ts`
      - done when: /join (J1) offers three choices: book a shoot, business, freelancer. Each goes through /login when there is no session, then /join/agree?kind=… (J2), which shows the seven rules through terms-body and one checkbox. The submit button stays disabled until the box is ticked. Submitting calls acceptAgreement and redirects to /provider/onboarding?kind=studio|freelancer, or to / for clients. The login action sends any user without a current acceptance to /join/agree?next=…. seed.ts records current acceptances for seeded users so existing e2e journeys are not blocked.
      - verify: `pnpm typecheck`, `pnpm lint`, `pnpm e2e -- tests/e2e/booking.spec.ts`
      - commit: `feat(join): pick an account kind, then accept the seven rules`
- [ ] **P1.T7** Add text normaliser for contact detection  `todo`
      - depends on: — (independent)
      - files: `src/server/text/normalise.ts`, `src/server/text/normalise.test.ts`
      - done when: normalise(text) applies NFKC, folds Devanagari and other digit scripts to ASCII, strips zero-width characters and separators between digits, maps homoglyphs (o to 0, l and I to 1 inside digit runs), undoes common leetspeak, and turns number words in English, Nepali ('नौ आठ') and romanised Nepali ('nau aath') into digits. Tests cover '९८४१ २३ ४५ ६७' giving '9841234567', 'nine eight four one' giving '9841', 'nau aath' giving '98', and that '500 photos, 10 hours, Falgun 12' is unchanged in meaning.
      - verify: `pnpm test -- src/server/text/normalise.test.ts`
      - commit: `feat(text): normaliser for digits, number words and homoglyphs`
- [ ] **P1.T8** Generate crew aliases and check profiles  `todo`
      - depends on: P1.T7
      - files: `src/server/crew/alias.ts`, `src/server/crew/alias.test.ts`, `src/server/crew/private-profile.ts`, `src/server/crew/private-profile.test.ts`
      - done when: generateAlias(rand) returns strings matching /^Crew [A-Z][0-9]-[0-9]{3}$/. uniqueAlias(db) retries on collision. checkPrivateProfile({headline, bio, roles}) runs normalise and rejects, with a field-specific reason, any Nepal mobile or landline, +977, email, URL, @handle, words such as studio, films, photography, productions or pvt ltd, and place detail finer than a city. Tests cover each rejection and a clean profile passing.
      - verify: `pnpm test -- src/server/crew/alias.test.ts`, `pnpm test -- src/server/crew/private-profile.test.ts`
      - commit: `feat(crew): alias generator with a private-profile check`
- [ ] **P1.T9** Make onboarding kind-aware  `todo`
      - depends on: P1.T1, P1.T5, P1.T8
      - files: `src/server/provider-account.ts`, `src/server/provider-account.test.ts`, `src/app/provider/onboarding/actions.ts`, `src/app/provider/onboarding/onboarding-form.tsx`, `src/app/provider/onboarding/page.tsx`, `tests/e2e/kyc.spec.ts`
      - done when: onboardingInput is a zod discriminated union on kind. 'studio' requires a businessName. 'freelancer' takes headline, roles and day rate (rupees, stored as paisa). createProviderProfile refuses users without a current acceptance, assigns uniqueAlias for freelancers, sets displayName to the alias, and returns {error, field} from checkPrivateProfile. The form shows 'Your name and number stay private until you are hired' and uses no 'alias' or 'anonymous' copy. Tests cover a studio created, a freelancer given an alias, and a freelancer whose headline contains 'Butwal Films 9841234567' rejected on headline. kyc.spec.ts is updated to the Join path.
      - verify: `pnpm test -- src/server/provider-account.test.ts`, `pnpm typecheck`, `pnpm e2e -- tests/e2e/kyc.spec.ts`
      - commit: `feat(onboarding): business and private crew onboarding paths`
- [ ] **P1.T10** Limit client search to businesses  `todo`
      - depends on: — (independent)
      - files: `src/server/search.ts`, `src/server/search.test.ts`, `src/server/providers.ts`, `src/server/bookings.ts`, `src/server/bookings.test.ts`, `src/server/db/seed-data.ts`, `src/server/db/seed.ts`
      - done when: searchFreeOnDate, freeCount and getVerifiedProvider return only providers with kind='studio' and plan in ('pro','studio'). checkout throws BookingError for any other provider. Seeded bookable providers are studios on 'pro' or 'studio', and at least two seeded freelancers stay verified but unlisted. Tests check that a verified freelancer is absent from search, that getVerifiedProvider returns null for it, that checkout rejects it, and that a free-plan studio is absent.
      - verify: `pnpm db:reset:test`, `pnpm test -- src/server/search.test.ts`, `pnpm test -- src/server/bookings.test.ts`
      - commit: `feat(search): clients see only subscribed businesses`
- [ ] **P1.T11** Move colour tokens to CSS variables  `todo`
      - depends on: — (independent)
      - files: `src/app/globals.css`
      - done when: Every --color-* value is set on :root and on [data-theme="dark"], using the light and dark values in proposal section 14. @theme maps the Tailwind colours to var(--…). New tokens 'ground' (page) and 'on-accent' (text on Sindoor, Ink or Teal fills) exist. color-scheme is light on :root and dark under [data-theme=dark]. Every existing utility name still resolves.
      - verify: `pnpm build`, `grep -q 'data-theme="dark"' src/app/globals.css`
      - commit: `feat(theme): colour tokens as CSS variables with a dark mode`
- [ ] **P1.T12** Apply theme before first paint  `todo`
      - depends on: P1.T11
      - files: `src/app/layout.tsx`, `src/lib/theme.ts`, `src/lib/theme.test.ts`
      - done when: layout.tsx reads the saait_theme cookie and sets html data-theme when it is light or dark. An inline script in <head> resolves 'system' through prefers-color-scheme and localStorage before paint. themeColor gives light and dark media entries. The body uses bg-ground rather than bg-white. parseTheme in theme.ts is tested for valid values, junk and a missing value.
      - verify: `pnpm test -- src/lib/theme.test.ts`, `pnpm typecheck`
      - commit: `feat(theme): resolve theme before first paint from cookie or system`
- [ ] **P1.T13** Replace literal white in UI kit  `todo`
      - depends on: P1.T11
      - files: `src/components/ui/bottom-nav.tsx`, `src/components/ui/button.tsx`, `src/components/ui/chips.tsx`, `src/components/ui/day-cell.tsx`, `src/components/ui/package-card.tsx`, `src/components/ui/provider-tile.tsx`, `src/components/ui/text-input.tsx`
      - done when: bg-white is replaced with bg-ground and text-white with text-on-accent. grep finds no bg-white or text-white under src/components/ui. Rendering in light mode is unchanged.
      - verify: `! grep -rnE 'bg-white|text-white' src/components/ui`, `pnpm typecheck`, `pnpm lint`
      - commit: `refactor(ui): kit components use theme tokens instead of white`
- [ ] **P1.T14** Replace literal white in app pages  `todo`
      - depends on: P1.T11
      - files: `src/app/(client)/book/[slug]/booking-form.tsx`, `src/app/(client)/p/[slug]/page.tsx`, `src/app/admin/kyc/[id]/page.tsx`, `src/app/admin/kyc/decision-form.tsx`, `src/app/admin/kyc/page.tsx`, `src/app/admin/kyc/queue.tsx`, `src/app/admin/layout.tsx`, `src/app/provider/kyc/upload-tile.tsx`, `src/app/provider/onboarding/onboarding-form.tsx`
      - done when: grep finds no bg-white or text-white anywhere under src/app. Token classes are used instead.
      - verify: `! grep -rnE 'bg-white|text-white' src/app`, `pnpm typecheck`, `pnpm lint`
      - commit: `refactor(app): pages use theme tokens instead of white`
- [ ] **P1.T15** Add appearance settings with theme toggle  `todo`
      - depends on: P1.T1, P1.T12
      - files: `src/server/settings.ts`, `src/server/settings.test.ts`, `src/app/settings/page.tsx`, `src/app/settings/actions.ts`, `src/components/ui/theme-toggle.tsx`
      - done when: setTheme(db, userId, raw) validates system|light|dark with zod and saves it to users.theme. The action also sets the saait_theme cookie. /settings (S1) shows a segmented System · Light · Dark control with the saved value selected. ThemeToggle (client component) changes data-theme at once, writes localStorage and the cookie, and calls the action when signed in. Tests cover a valid save and rejection of 'blue'.
      - verify: `pnpm test -- src/server/settings.test.ts`, `pnpm typecheck`, `pnpm lint`
      - commit: `feat(settings): appearance setting saved to the account`
- [ ] **P1.T16** Add business and crew route groups  `todo`
      - depends on: P1.T1
      - files: `src/server/auth/guards.ts`, `src/app/business/layout.tsx`, `src/app/business/page.tsx`, `src/app/crew/layout.tsx`, `src/app/crew/page.tsx`, `src/app/provider/page.tsx`
      - done when: requireProviderKind(kind, next) returns {user, profile} and calls notFound() for clients and for the other kind. /business (B1 Today) and /crew (F1 Today, showing the alias) are guarded by it. /provider redirects to /business or /crew by kind. Signed-out users go to /login?next=….
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(auth): role-guarded /business and /crew areas`
- [ ] **P1.T17** Add per-role web header  `todo`
      - depends on: P1.T15, P1.T16
      - files: `src/components/shell/web-header.tsx`, `src/components/ui/bottom-nav.tsx`, `src/components/client/client-header.tsx`, `src/app/(client)/layout.tsx`, `src/app/business/layout.tsx`, `src/app/crew/layout.tsx`
      - done when: WebHeader has Client, Business and Freelancer variants. Each has ThemeToggle before the right-hand cluster and optional creditPill and levelBadge slots that render nothing when not given. NAVS gains business and crew entries that link only to routes that exist. Phone widths use BottomNav and desktop uses the header. All three layouts render their variant.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(shell): per-role web header carrying the theme toggle`
- [ ] **P1.T18** Add Join end-to-end test  `todo`
      - depends on: P1.T6, P1.T9, P1.T16
      - files: `tests/e2e/join.spec.ts`, `tests/e2e/helpers.ts`
      - done when: On both projects, a new number joins as a freelancer, sees the agree button disabled until the box is ticked, accepts, gets a 'Crew …' name at onboarding, and lands on /crew. The test checks that an agreement_acceptances row exists, then that the freelancer's slug returns 404 at /p/<slug>. A second number joins as a business and lands on /business.
      - verify: `pnpm e2e -- tests/e2e/join.spec.ts`
      - commit: `test(e2e): join as freelancer or business through the agreement`
- [ ] **P1.T19** Add theme-switching end-to-end test  `todo`
      - depends on: P1.T15, P1.T17
      - files: `tests/e2e/theme.spec.ts`
      - done when: With colorScheme 'dark' emulated, html[data-theme] or the computed --color-ground is dark on first load. Choosing Light from the header sets data-theme='light', which survives a reload. Choosing System follows the emulated scheme.
      - verify: `pnpm e2e -- tests/e2e/theme.spec.ts`
      - commit: `test(e2e): theme follows the system and the header toggle`

## P2 — Venue as a point  (0/8)

Clients search from the venue's location instead of a city list. Results show who can reach that point and how far away each business is. The booking keeps only the venue pin.

**Exit criteria:** Home reads 'Shooting near Traffic Chowk, Butwal' with nearby-place chips and distances. Browser location or a typed place changes the point. The query string carries lat, lng and place. Every result card shows 'N km away', ordered by open slots, then rating, then distance, never price. A locked booking has venue_lat and venue_lng set. The booking e2e passes.

- [ ] **P2.T1** Add places table  `todo`
      - depends on: — (independent)
      - files: `src/server/db/schema.ts`, `drizzle/`, `src/server/db/schema.test.ts`
      - done when: The migration adds enum place_kind (district|municipality|ward|chowk|venue) and table places (id, slug unique, name, name_np, kind, lat, lng, district, city_id fk nullable, source text default 'seed', created_at), with an index on lower(name) and a CHECK keeping lat and lng inside Nepal's bounding box. cities is unchanged. A schema test rejects lat 40.
      - verify: `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:reset:test`, `pnpm test -- src/server/db/schema.test.ts`
      - commit: `feat(db): places table so the venue is a point, not a city`
- [ ] **P2.T2** Seed Rupandehi cluster places  `todo`
      - depends on: P2.T1
      - files: `src/server/db/seed-data.ts`, `src/server/db/seed.ts`
      - done when: PLACES holds at least 25 Rupandehi-cluster entries with English and Devanagari names: Traffic Chowk Butwal, Milan Chowk, Butwal Buspark, Bhairahawa (Siddharthanagar), Tilottama, Devdaha, Sainamaina, Lumbini, Manigram, plus several party palaces. The seed is idempotent by slug, so a second pnpm db:seed adds no rows.
      - verify: `pnpm db:seed`, `pnpm db:seed`, `pnpm db:reset:test`
      - commit: `feat(seed): Rupandehi places for venue search`
- [ ] **P2.T3** Add place search endpoint  `todo`
      - depends on: P2.T1, P2.T2
      - files: `src/server/places.ts`, `src/server/places.test.ts`, `src/app/api/places/route.ts`
      - done when: searchPlaces(db, {q}) matches name or name_np by prefix, then by substring, and returns at most 8 results. nearestPlaces(db, {lat, lng}, n) returns places with distanceKm in ascending order. A PlaceFallback interface (the Nominatim boundary) defaults to none. GET /api/places?q= or ?lat=&lng= is validated with zod and returns 400 on bad input. Tests: 'traf' finds Traffic Chowk, 'बुटवल' matches, and the nearest place to the Traffic Chowk coordinates is Traffic Chowk at 0 km.
      - verify: `pnpm test -- src/server/places.test.ts`, `pnpm typecheck`
      - commit: `feat(places): typed place search and nearest places`
- [ ] **P2.T4** Search from a lat/lng point  `todo`
      - depends on: — (independent)
      - files: `src/server/search.ts`, `src/server/search.test.ts`, `src/server/client/query.ts`, `src/server/client/query.test.ts`
      - done when: searchQuery replaces city with {lat, lng (coerced numbers inside Nepal bounds), radiusKm 5-100 default 30, place label optional}. The default is Traffic Chowk, Butwal. A provider is included when its distance to the point is at most radiusKm and at most max(serviceRadiusKm, MIN_REACH_KM). Every result carries distanceKm. compareResults orders by open slots, then rating, then distance, never price. When nothing matches, nearestBusinesses returns the three nearest listed businesses with distance. parseClientQuery and queryString round-trip lat, lng, place and radius. Tests are updated to match.
      - verify: `pnpm test -- src/server/search.test.ts`, `pnpm test -- src/server/client/query.test.ts`, `pnpm typecheck`
      - commit: `feat(search): search by venue point and reach radius`
- [ ] **P2.T5** Add place picker on home  `todo`
      - depends on: P2.T3, P2.T4
      - files: `src/components/client/place-picker.tsx`, `src/app/(client)/page.tsx`
      - done when: Home (C1) shows a pin and 'Shooting near <place>', then chips for 'Near me' and the four nearest places with distance ('Bhairahawa · 22 km'), then the one-line note that the position is not stored. 'Near me' asks for browser geolocation with the reason shown and, if refused, falls back to a typed place searched through /api/places. Choosing a point updates lat, lng and place in the URL. The position is never sent to a server action.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(home): pick the venue by location or typed place`
- [ ] **P2.T6** Show distance on results  `todo`
      - depends on: P2.T5
      - files: `src/app/(client)/results/page.tsx`, `src/components/ui/provider-tile.tsx`, `src/app/(client)/urgent/page.tsx`, `src/components/client/city-picker.tsx`
      - done when: The results reach chip reads 'Near <place> · within <r> km' and can widen or narrow r. Each ProviderTile shows 'N km away'. An empty result shows the three nearest businesses with distance and an urgent-broadcast link. /urgent uses PlacePicker. city-picker.tsx is deleted and nothing imports it.
      - verify: `! test -f src/components/client/city-picker.tsx`, `pnpm typecheck`, `pnpm lint`
      - commit: `feat(results): reach chip with distance on every card`
- [ ] **P2.T7** Store venue pin at lock  `todo`
      - depends on: — (independent)
      - files: `src/server/bookings.ts`, `src/server/bookings.test.ts`, `src/app/(client)/book/[slug]/booking-form.tsx`, `src/app/(client)/book/[slug]/actions.ts`, `src/app/(client)/book/[slug]/page.tsx`
      - done when: checkoutInput takes venueLat and venueLng, both required numbers inside Nepal bounds. checkout writes them to bookings.venue_lat and venue_lng. The form pre-fills them from the query point and lets the client confirm. Tests cover a booking row holding the pin and an out-of-bounds pin rejected with field 'venueLat'.
      - verify: `pnpm test -- src/server/bookings.test.ts`, `pnpm typecheck`
      - commit: `feat(booking): keep the venue pin with the locked booking`
- [ ] **P2.T8** Update booking end-to-end test for places  `todo`
      - depends on: P2.T5, P2.T6, P2.T7
      - files: `tests/e2e/booking.spec.ts`
      - done when: The journey starts from home showing 'Shooting near Traffic Chowk', picks a nearby chip, sees 'km away' on results and locks a date. It then checks that the booking row has non-null venue_lat and venue_lng. It passes on phone and desktop.
      - verify: `pnpm e2e -- tests/e2e/booking.spec.ts`
      - commit: `test(e2e): booking journey from a venue point`

## P3 — Secure chat, operator desk  (0/12)

Clients and businesses talk on Saait. The server checks every message for contact or payment details before delivery. Contact details are shown only on the booking page. The operator has queues for held messages and leakage signals.

**Exit criteria:** A client message containing a phone number shows 'Not sent' with its reason and never reaches the business. The appeal puts it on /admin/chat, and clearing it there delivers it and removes the held count. The third held message in 30 days pauses chat for 24 hours. The booking page shows phone numbers from 48 hours before the event and the provider's verified payout QR. /admin/signals lists calendar blocks after unbooked enquiries. tests/e2e/chat.spec.ts passes.

- [ ] **P3.T1** Add chat threads, held status and reports  `todo`
      - depends on: — (independent)
      - files: `src/server/db/schema.ts`, `drizzle/`, `src/server/db/schema.test.ts`
      - done when: The migration adds:
- enum message_status (held|delivered|cleared)
- chat_threads (id, kind client_business|business_crew, a_user_id, b_user_id, provider_id, booking_id nullable, day nullable, created_at, last_message_at), unique on (a, b, provider, day)
- messages columns thread_id fk, status default 'delivered', reason, held_layer smallint, attachment_key, appealed_at, reviewed_by_id, reviewed_at, review_outcome; enquiry_id becomes nullable, with CHECK that thread_id or enquiry_id is set
- users.chat_paused_until and users.points_frozen_until
- reports (id, reporter_id, subject_provider_id, thread_id, reason, status open|confirmed|dismissed, decided_by_id, created_at)
- contact_reveals (id, booking_id, viewer_id, revealed_at)
- availability_days.updated_at, if it is missing
      - verify: `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:reset:test`, `pnpm test -- src/server/db/schema.test.ts`
      - commit: `feat(db): chat threads, held messages, reports and contact reveals`
- [ ] **P3.T2** Build layered chat checker  `todo`
      - depends on: P1.T7
      - files: `src/server/chat/check.ts`, `src/server/chat/check.test.ts`
      - done when: check(body, context: string[] of up to the last 5 messages) returns {ok: true} or {ok: false, layer: 1|2|3|4, reason}. It runs normalise, then rules for Nepal mobiles (97 or 98 followed by 8 digits), landlines, +977, emails, URLs and shorteners, @handles, app names (WhatsApp, Viber, IMO, Telegram, Signal, Instagram, Facebook, TikTok, wa.me, 'DM me'), eSewa and Khalti mentions with numbers, and bank-account shapes. It then applies the same rules to the context joined with the body. An IntentClassifier adapter defaults to no-op. The reason is the plain sentence from proposal section 6. Tests pass for: '९८४१२३४५६७', 'nine eight four one two three four five six seven', 'nau aath …', '98 41' split over three messages, 'ping me on insta @x', 'send to my esewa 98…', 'abc@gmail.com', and they confirm '500 photos, 10 hours, Falgun 12' is delivered.
      - verify: `pnpm test -- src/server/chat/check.test.ts`
      - commit: `feat(chat): layered checker for contact and payment details`
- [ ] **P3.T3** Add server-side QR scanner  `todo`
      - depends on: — (independent)
      - files: `src/server/screening/qr.ts`, `src/server/screening/qr.test.ts`, `src/server/screening/fixtures/`, `package.json`, `pnpm-lock.yaml`
      - done when: containsQr(bytes, mime) decodes JPEG, PNG or WebP to RGBA (sharp) and runs jsQR. It returns {found: boolean, text?}. It is added with pnpm only. Tests: the fixture QR PNG is found, the fixture plain photo is not, and a corrupt buffer throws a typed error.
      - verify: `pnpm install --frozen-lockfile`, `pnpm test -- src/server/screening/qr.test.ts`
      - commit: `feat(screening): detect QR codes in uploaded images`
- [ ] **P3.T4** Add chat send service  `todo`
      - depends on: P3.T1, P3.T2, P3.T3
      - files: `src/server/chat/service.ts`, `src/server/chat/service.test.ts`
      - done when: The service provides openThread, sendMessage, sendImage, appeal and listThread, each taking a viewer.
- sendMessage stores held messages with reason and layer, visible only to the sender. It refuses while chat_paused_until is in the future.
- The 2nd held message in 30 days flags the thread for review.
- The 3rd sets chat_paused_until and points_frozen_until to now + 24h and writes an audit row.
- sendImage is refused before the booking deposit is paid; afterwards a QR in the image holds it.
- appeal sets appealed_at.
- listThread never returns another user's held messages.
Tests cover each of these rules.
      - verify: `pnpm test -- src/server/chat/service.test.ts`, `pnpm typecheck`
      - commit: `feat(chat): check every message before delivery, with held counts`
- [ ] **P3.T5** Add operator moderation service  `todo`
      - depends on: P3.T1
      - files: `src/server/chat/moderation.ts`, `src/server/chat/moderation.test.ts`
      - done when: heldQueue(db) lists appealed messages first, then flagged ones. clear(db, operator, id) marks the message cleared, delivers it, removes it from the 30-day count and lifts the pause when the count drops below 3. confirm(db, operator, id) keeps it held with review_outcome 'confirmed'. Both write audit rows and refuse non-operators. heldCount(db) feeds the sidebar badge. Tests cover clear, confirm, the role check and the audit rows.
      - verify: `pnpm test -- src/server/chat/moderation.test.ts`
      - commit: `feat(chat): operator clear and confirm for held messages`
- [ ] **P3.T6** Build chat screens  `todo`
      - depends on: P3.T4
      - files: `src/app/chat/page.tsx`, `src/app/chat/[id]/page.tsx`, `src/app/chat/[id]/actions.ts`, `src/components/chat/chat-bubble.tsx`, `src/components/chat/composer.tsx`, `src/app/(client)/p/[slug]/page.tsx`
      - done when: /chat lists the viewer's threads. /chat/[id] (C4/F2) is limited to participants and shows Incoming, Outgoing, Blocked and System bubbles. A held message is greyed and labelled 'Not sent' (the one Sindoor use), with its reason and a 'This isn't contact info' button that calls appeal. The send button is Ink. Image upload is disabled with an explanation before the deposit is paid. A paused chat shows the end time. /p/[slug] gains a 'Message' button that opens or creates the thread.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(chat): thread screens with Not sent state and appeal`
- [ ] **P3.T7** Reveal contact 48h before event  `todo`
      - depends on: P3.T1
      - files: `src/server/booking-contact.ts`, `src/server/booking-contact.test.ts`, `src/app/(client)/bookings/[code]/page.tsx`
      - done when: contactFor(db, booking, viewer, now) returns the other side's phone only when the booking is confirmed and now is within 48 hours of the event start (Nepal time). It writes a contact_reveals row the first time each viewer sees it. Before that it returns {revealAt}. The booking page (C6) shows either the number or 'Shown from <date>'. Tests use 49h and 47h boundaries and check a single reveal row.
      - verify: `pnpm test -- src/server/booking-contact.test.ts`, `pnpm typecheck`
      - commit: `feat(booking): reveal phone numbers 48 hours before the event`
- [ ] **P3.T8** Show verified payout QR  `todo`
      - depends on: P3.T7
      - files: `src/components/booking/payout-qr.tsx`, `src/app/(client)/bookings/[code]/page.tsx`, `package.json`, `pnpm-lock.yaml`
      - done when: When the provider's kyc_status is verified, the booking page shows an SVG QR, generated server-side with the qrcode package, of the KYC payout method, account name and account number. It is labelled 'Verified payout account · pay the balance only here'. Nothing is shown when the provider is unverified.
      - verify: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`
      - commit: `feat(booking): show the provider's verified payout QR`
- [ ] **P3.T9** Build operator held-message queue  `todo`
      - depends on: P3.T5
      - files: `src/app/admin/chat/page.tsx`, `src/app/admin/chat/actions.ts`, `src/app/admin/chat/flag-row.tsx`
      - done when: /admin/chat (O1) is limited to operators and admins. It lists held messages with sender, thread context (the last 5 messages), layer, reason and whether the message was appealed. Clear and Confirm actions call moderation, and Confirm is the one Sindoor use. The row leaves the queue after either action.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(admin): held-message queue with clear and confirm`
- [ ] **P3.T10** Add leakage signals view  `todo`
      - depends on: P3.T1
      - files: `src/server/signals.ts`, `src/server/signals.test.ts`, `src/app/admin/signals/page.tsx`
      - done when: calendarBlocksAfterEnquiry(db) lists threads where the provider blocked the thread's day after the thread opened and no booking exists for that client, provider and day. reportCounts(db) gives open reports per provider. /admin/signals (O2) is limited to operators and shows both. Tests cover a block after an enquiry (listed), a booking that exists (not listed) and a block made before the enquiry (not listed).
      - verify: `pnpm test -- src/server/signals.test.ts`, `pnpm typecheck`
      - commit: `feat(admin): leakage signals from calendar blocks and reports`
- [ ] **P3.T11** Add chat and signals to sidebar  `todo`
      - depends on: P3.T5, P3.T10
      - files: `src/app/admin/layout.tsx`
      - done when: The sidebar gains live entries 'Flagged messages' (/admin/chat, badge from heldCount) and 'Signals' (/admin/signals, badge from open report count). These replace the placeholder entries. aria-current follows the active path rather than being fixed on Verification.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(admin): sidebar links to flagged messages and signals`
- [ ] **P3.T12** Add held-message end-to-end test  `todo`
      - depends on: P3.T6, P3.T9, P3.T11
      - files: `tests/e2e/chat.spec.ts`, `tests/e2e/helpers.ts`
      - done when: The demo client opens a seeded business, messages '98 41 23 45 67' and sees 'Not sent' with the reason, then clicks 'This isn't contact info'. The test confirms the business does not see the message. An operator signs in, opens /admin/chat and clears it. The business then sees it delivered. It passes on phone and desktop.
      - verify: `pnpm e2e -- tests/e2e/chat.spec.ts`
      - commit: `test(e2e): held phone number is appealed and cleared`

## P4 — Rewards ledger  (0/11)

Staying on Saait is worth more than leaving. Clients earn non-cash credit that pays booking fees. Businesses and freelancers earn points that raise their level and buy plan months.

**Exit criteria:** reward_ledger rejects UPDATE and DELETE at the database level, and the ledger invariant tests pass. When a client confirms the balance paid, the booking is completed and the client gets 25% of the fee as credit while the provider gets +100 points. Checkout shows credit as its own line, never reduces the deposit and stays within the monthly 25% budget. /rewards shows the balance, level and plan redemption. Level badges show on results and profiles.

- [ ] **P4.T1** Add append-only reward ledger  `todo`
      - depends on: — (independent)
      - files: `src/server/db/schema.ts`, `drizzle/`, `src/server/db/schema.test.ts`
      - done when: The migration adds:
- enums reward_kind (credit|points) and reward_reason (booking_completed, on_time, review_left, five_star, referral, report_confirmed, urgent_completed, crew_job_completed, no_show, checkout_spend, plan_month, expiry, reset)
- reward_ledger (id, user_id, kind, amount bigint signed, reason, booking_id, review_id, crew_job_id, report_id, referral_id, expires_at, created_at), with unique (user_id, kind, reason, coalesce of refs) for idempotency
- a trigger, in a custom migration, raising on UPDATE or DELETE
- referrals (id, referrer_id, referee_id unique, created_at) and users.referral_code (unique)
- bookings.credit_applied money default 0, with CHECK credit_applied between 0 and booking_fee
Schema tests check that an UPDATE on reward_ledger fails.
      - verify: `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:reset:test`, `pnpm test -- src/server/db/schema.test.ts`
      - commit: `feat(db): append-only reward ledger, referrals and credit on bookings`
- [ ] **P4.T2** Apply credit in fee quote  `todo`
      - depends on: — (independent)
      - files: `src/lib/fees.ts`, `src/lib/fees.test.ts`
      - done when: quote() takes optional creditAvailable (Paisa) and returns creditApplied = min(creditAvailable, bookingFee) and feePayable = bookingFee - creditApplied. VAT is calculated inside the fee actually charged. depositAmount and balanceDue are unchanged. creditBudgetLeft(feeRevenueMonth, creditRedeemedMonth) returns 25% of revenue minus credit redeemed, with a floor of 0. Tests: total 73,000 with Rs 400 credit gives a fee of 2,920, Rs 400 applied, 2,520 payable and a deposit of 18,250; credit larger than the fee caps at the fee; a used-up budget gives 0.
      - verify: `pnpm test -- src/lib/fees.test.ts`
      - commit: `feat(fees): Saait credit as its own line on the booking fee`
- [ ] **P4.T3** Add ledger service with levels  `todo`
      - depends on: P4.T1
      - files: `src/server/rewards/ledger.ts`, `src/server/rewards/ledger.test.ts`, `src/lib/levels.ts`, `src/lib/levels.test.ts`
      - done when: post(db, entry) is idempotent on its reference and refuses points while points_frozen_until is in the future. creditBalance(db, userId, now) ignores grants past expires_at (12 months) and spends against the oldest grants first. pointsBalance and lifetimePoints are separate: lifetime excludes plan_month spends and includes penalties. levelFor(lifetime) maps thresholds New 0, Trusted 300, Proven 1,000, Top 2,500. levelsFor(db, userIds) works in bulk. Invariant tests: the balance is never negative, a double post adds one row, a 13-month-old grant cannot be spent, and spending does not lower the level.
      - verify: `pnpm test -- src/server/rewards/ledger.test.ts`, `pnpm test -- src/lib/levels.test.ts`
      - commit: `feat(rewards): ledger balances, credit expiry and levels`
- [ ] **P4.T4** Add reward earn events  `todo`
      - depends on: P4.T3, P3.T5
      - files: `src/server/rewards/earn.ts`, `src/server/rewards/earn.test.ts`, `src/server/chat/moderation.ts`
      - done when: earn.ts provides:
- onBookingCompleted: client credit of 25% of the fee paid; provider +100 points; Rs 300 credit to each side of a referral on the referee's first completed booking
- onReviewLeft: Rs 100 credit, for any rating
- onFiveStar: +20 points
- onReportConfirmed: Rs 200 credit
- onNoShow: -200 points
Each event is idempotent. moderation.ts gains confirmReport(db, operator, reportId), which calls onReportConfirmed and writes an audit row. Tests cover each event, a repeated event, and frozen points being refused.
      - verify: `pnpm test -- src/server/rewards/earn.test.ts`, `pnpm test -- src/server/chat/moderation.test.ts`
      - commit: `feat(rewards): earn credit and points on completed work`
- [ ] **P4.T5** Complete booking when balance confirmed  `todo`
      - depends on: P4.T4
      - files: `src/server/bookings.ts`, `src/server/bookings.test.ts`, `src/app/(client)/bookings/[code]/page.tsx`, `src/app/(client)/bookings/[code]/actions.ts`
      - done when: confirmBalancePaid(deps, client, code) sets balance_paid_client_confirmed_at. Once the event day has passed it sets status 'completed', increments the provider's completed_bookings and calls onBookingCompleted in the same transaction. The booking page shows 'I paid the balance' for confirmed bookings. Tests cover completion with credit posted, a second confirm doing nothing, and someone else's booking being refused.
      - verify: `pnpm test -- src/server/bookings.test.ts`, `pnpm typecheck`
      - commit: `feat(booking): client confirms balance paid, completing the booking`
- [ ] **P4.T6** Track referral codes  `todo`
      - depends on: P4.T1
      - files: `src/server/rewards/referrals.ts`, `src/server/rewards/referrals.test.ts`, `src/app/join/page.tsx`, `src/app/login/actions.ts`
      - done when: Every user gets a referral_code on first need. /join?ref=CODE carries the code through login. The first sign-in of a new user records a referrals row, except when the user refers themselves or a referral already exists. Tests cover a self-referral being rejected, a second referral being ignored and an unknown code being ignored.
      - verify: `pnpm test -- src/server/rewards/referrals.test.ts`, `pnpm typecheck`
      - commit: `feat(rewards): referral codes captured at sign-up`
- [ ] **P4.T7** Apply credit at checkout  `todo`
      - depends on: P4.T2, P4.T3, P4.T5
      - files: `src/server/bookings.ts`, `src/server/bookings.test.ts`, `src/app/(client)/book/[slug]/booking-form.tsx`, `src/app/(client)/book/[slug]/page.tsx`, `src/app/(client)/book/[slug]/actions.ts`
      - done when: checkout reads creditBalance and the monthly creditBudgetLeft. It passes min(balance, budget left) to quote, stores bookings.credit_applied, posts a checkout_spend debit in the same transaction, and charges the gateway the deposit plus feePayable. If payment fails or the hold expires, the spend is reversed. The lock screen (C5) shows 'Saait credit −Rs N' as its own Teal line. Tests cover a credit-reduced charge, an unchanged deposit, the budget cap and the refund when the hold expires.
      - verify: `pnpm test -- src/server/bookings.test.ts`, `pnpm typecheck`
      - commit: `feat(checkout): apply Saait credit automatically to the booking fee`
- [ ] **P4.T8** Redeem points for plan months  `todo`
      - depends on: P4.T3
      - files: `src/lib/plans.ts`, `src/server/rewards/redeem.ts`, `src/server/rewards/redeem.test.ts`
      - done when: PLANS maps the enum to labels: free 'Freelancer', pro 'Business' at Rs 1,500 a month, studio 'Studio' at Rs 4,000 a month including one featured date. redeemPlanMonth(db, provider) spends 1,500 points, inserts a one-month 'pro' subscription row at price 0 that starts the day after any current period, and sets provider.plan to 'pro'. It refuses when the balance is too low, when points are frozen, or when the provider is a freelancer. Tests cover each case.
      - verify: `pnpm test -- src/server/rewards/redeem.test.ts`
      - commit: `feat(rewards): spend 1,500 points on a Business plan month`
- [ ] **P4.T9** Build rewards page  `todo`
      - depends on: P4.T3, P4.T8
      - files: `src/app/rewards/page.tsx`, `src/app/rewards/actions.ts`
      - done when: /rewards requires sign-in. Clients (C7) see their credit balance, expiry dates, history and referral link. Businesses (B3) see points, level progress to the next threshold, the current plan and a 'Use 1,500 points for a month' action. Freelancers see points and level. Rewards use Teal, never Marigold.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(rewards): /rewards page for credit, points and plan months`
- [ ] **P4.T10** Show level badges on cards  `todo`
      - depends on: P4.T3
      - files: `src/components/ui/level-badge.tsx`, `src/components/ui/provider-tile.tsx`, `src/app/(client)/results/page.tsx`, `src/app/(client)/p/[slug]/page.tsx`
      - done when: LevelBadge renders New, Trusted, Proven or Top using tokens. Results load levels in one levelsFor call and every tile shows its badge. The business profile header shows the badge. Ordering is unchanged.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(ui): level badge on results and business profiles`
- [ ] **P4.T11** Add credit pill to headers  `todo`
      - depends on: P4.T3, P4.T10
      - files: `src/components/shell/web-header.tsx`, `src/components/ui/bottom-nav.tsx`, `src/app/(client)/layout.tsx`, `src/app/business/layout.tsx`, `src/app/crew/layout.tsx`
      - done when: The client header shows a credit pill ('Rs N credit', linking to /rewards) when the balance is above 0. Business and crew headers show their LevelBadge. Navs gain Chat (/chat) and Rewards (/rewards) entries.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(shell): credit pill, level badge and chat links in headers`

## P5 — Crew hiring, portfolios, reviews  (0/16)

Businesses hire verified private crew with no money passing through Saait. Every account shows screened portfolio work within its plan or level limit. Clients leave free reviews for completed bookings.

**Exit criteria:** A business finds a freelancer on /business/crew by alias and hires them. The freelancer accepts on /crew/jobs. The business then sees the real name and number, and completing the job gives both +100 points (tests/e2e/crew.spec.ts passes). Uploads over the limit are refused. A QR upload is held with a reason and other uploads wait in /admin/portfolio. The business profile shows approved work and reviews. A client of a completed booking can review it within 60 days and gets Rs 100 credit.

- [ ] **P5.T1** Add crew jobs and portfolio status  `todo`
      - depends on: — (independent)
      - files: `src/server/db/schema.ts`, `drizzle/`, `src/server/db/schema.test.ts`
      - done when: The migration adds:
- enum crew_job_status (offered|accepted|declined|completed|no_show)
- crew_jobs (id, business_id, freelancer_id, booking_id nullable, day, role, day_rate money, currency, status, accepted_at, completed_at, created_at), with CHECK day_rate >= 0, CHECK the freelancer is not the business, and unique (freelancer_id, day) where status is offered or accepted
- enums media_kind (photo|clip) and media_status (pending|approved|held)
- portfolio_items columns media_kind, storage_key, status default 'pending', reason, duration_seconds, bytes, with url made nullable
- reviews columns crew_job_id and reply_at, booking_id made nullable, and CHECK exactly one of booking_id or crew_job_id
      - verify: `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:reset:test`, `pnpm test -- src/server/db/schema.test.ts`
      - commit: `feat(db): crew jobs, screened portfolio items and crew reviews`
- [ ] **P5.T2** Add crew job service  `todo`
      - depends on: P5.T1, P4.T4
      - files: `src/server/crew/jobs.ts`, `src/server/crew/jobs.test.ts`
      - done when: The service provides findCrew, hire, respond, complete, markNoShow and crewContact.
- findCrew(db, business, {day, lat, lng, role}) returns verified freelancers who are free that day and reach the point. It returns only the alias, roles, level, reliability, day rate and distance. Ordering is reliability, then level, then distance, never day rate.
- hire creates an 'offered' job and writes an audit row.
- respond(accept|decline) is limited to the freelancer.
- complete posts crew_job_completed +100 to both sides.
- markNoShow posts -200 and lowers reliability_score.
- crewContact returns the name and phone only once the job is accepted, and writes a contact_reveals entry.
Tests cover no name before acceptance, the double-booking guard and points to both sides.
      - verify: `pnpm test -- src/server/crew/jobs.test.ts`, `pnpm typecheck`
      - commit: `feat(crew): hire, accept and complete crew jobs with no money through Saait`
- [ ] **P5.T3** Build find-crew page  `todo`
      - depends on: P5.T2
      - files: `src/app/business/crew/page.tsx`, `src/app/business/crew/actions.ts`, `src/app/business/crew/[alias]/page.tsx`, `src/components/crew/crew-card.tsx`
      - done when: /business/crew (B2) filters by date, role and venue point and lists CrewCards (alias avatar, level, reliability, day rate as 'Paid by you directly', distance). /business/crew/[alias] (P2) shows the private profile with no name or face and a Hire form (day, role, day rate). Hire calls jobs.hire and confirms 'Offer sent'.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(business): find crew by reach and reliability, then hire`
- [ ] **P5.T4** Build freelancer job offers page  `todo`
      - depends on: P5.T2
      - files: `src/app/crew/jobs/page.tsx`, `src/app/crew/jobs/actions.ts`, `src/app/crew/page.tsx`
      - done when: /crew/jobs lists offered and accepted jobs with business name, day, role and day rate, plus Accept and Decline. /crew (F1 Today) shows pending offers at the top. Accepting moves the job to 'accepted'.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(crew): job offers with accept and decline`
- [ ] **P5.T5** Build business crew jobs page  `todo`
      - depends on: P5.T2, P5.T12
      - files: `src/app/business/crew/jobs/page.tsx`, `src/app/business/crew/jobs/actions.ts`
      - done when: /business/crew/jobs lists hired jobs. Accepted jobs show the freelancer's name and phone. 'Completed' and 'Didn't show' actions call jobs.complete and markNoShow. A completed job offers a crew review form that calls reviews.reviewCrew.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(business): manage hired crew, including reviews`
- [ ] **P5.T6** Add crew hire end-to-end test  `todo`
      - depends on: P5.T3, P5.T4, P5.T5
      - files: `tests/e2e/crew.spec.ts`
      - done when: A seeded business signs in and hires a seeded freelancer by alias. The freelancer signs in, sees the offer on /crew/jobs and accepts. The business's jobs page then shows the real name and phone, which were absent before acceptance. It passes on phone and desktop.
      - verify: `pnpm e2e -- tests/e2e/crew.spec.ts`
      - commit: `test(e2e): business hires crew, crew accepts`
- [ ] **P5.T7** Define portfolio limits  `todo`
      - depends on: P4.T3
      - files: `src/lib/portfolio-limits.ts`, `src/lib/portfolio-limits.test.ts`
      - done when: limitsFor({kind, plan, level}) returns {photos, clips}: Business plan 20/15, Freelancer New 12/6, Trusted 16/10, Proven and Top 20/15. MAX_PHOTO_BYTES is 20 MB, MAX_CLIP_BYTES is 200 MB and MAX_CLIP_SECONDS is 60. Table-driven tests cover every row.
      - verify: `pnpm test -- src/lib/portfolio-limits.test.ts`
      - commit: `feat(portfolio): photo and clip limits by plan and level`
- [ ] **P5.T8** Screen portfolio uploads  `todo`
      - depends on: P5.T1, P5.T7, P3.T3
      - files: `src/server/screening/index.ts`, `src/server/screening/index.test.ts`, `src/server/portfolio.ts`, `src/server/portfolio.test.ts`, `src/server/storage/index.ts`
      - done when: The Screener interface returns approve, hold (with reason) or pending. The default screener holds an image containing a QR code. It uses an OCR adapter interface whose ManualOcr fallback returns pending for operator review, and clips are always pending. uploadPortfolioItem(deps, provider, file) checks the type with sniffType (plus mp4 and mov in a separate PORTFOLIO_TYPES list), the size limits, the mp4 duration from the mvhd header and the count limit. It stores the file through DocumentStore and records status and reason. approve and hold are operator-only and write audit rows. Tests cover the 13th photo for a New freelancer refused, a QR image held, a PDF refused and a clean photo left pending.
      - verify: `pnpm test -- src/server/screening/index.test.ts`, `pnpm test -- src/server/portfolio.test.ts`
      - commit: `feat(portfolio): screened uploads within the account's limit`
- [ ] **P5.T9** Add portfolio upload and media routes  `todo`
      - depends on: P5.T8
      - files: `src/app/api/portfolio/route.ts`, `src/app/media/[itemId]/route.ts`
      - done when: POST /api/portfolio (multipart, owner only) calls uploadPortfolioItem and returns 201 {id, status, reason}, 413 over size and 409 over the limit. GET /media/[itemId] streams approved items to anyone, lets the owner or an operator see pending and held items, and returns 404 otherwise.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(portfolio): upload endpoint and public media route`
- [ ] **P5.T10** Build operator portfolio queue  `todo`
      - depends on: P5.T8
      - files: `src/app/admin/portfolio/page.tsx`, `src/app/admin/portfolio/actions.ts`, `src/app/admin/layout.tsx`
      - done when: /admin/portfolio lists pending items with a preview and offers Approve, or Hold with a reason. The sidebar shows 'Portfolio' with a pending count. Each action writes an audit row.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(admin): manual review queue for portfolio uploads`
- [ ] **P5.T11** Build business profile editor  `todo`
      - depends on: P5.T9
      - files: `src/app/business/profile/page.tsx`, `src/app/business/profile/actions.ts`, `src/components/portfolio/portfolio-grid.tsx`, `src/components/portfolio/upload-slot.tsx`
      - done when: /business/profile (P1) edits the business name, bio and since-year. PortfolioGrid shows counters ('18 of 20 photos'), approved, pending and held tiles (held tiles show the reason), clip tiles with a play glyph and duration, and dashed slots for the remaining limit. UploadSlot posts to /api/portfolio and shows the screening result. At the limit, an item has to be removed before another can be added.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(business): profile and portfolio editor within plan limits`
- [ ] **P5.T12** Add review service  `todo`
      - depends on: P5.T1, P4.T4
      - files: `src/server/reviews.ts`, `src/server/reviews.test.ts`
      - done when: leaveReview(db, client, bookingCode, raw) uses zod (rating 1-5, body up to 1,000 characters). It is allowed only for the booking's client, when the booking is completed and within 60 days of the event, once per booking. It costs nothing, calls onReviewLeft (Rs 100 credit) and onFiveStar when the rating is 5, and recomputes rating_avg and rating_count. reply(db, provider, reviewId, body) is allowed once. reviewCrew(db, business, crewJobId, raw) is allowed only for a completed job. Tests cover day 61 refused, a second review refused, a second reply refused and credit posted for a 1-star review.
      - verify: `pnpm test -- src/server/reviews.test.ts`
      - commit: `feat(reviews): free reviews from completed bookings with one reply`
- [ ] **P5.T13** Show portfolio and reviews publicly  `todo`
      - depends on: P5.T9, P5.T12
      - files: `src/app/(client)/p/[slug]/page.tsx`, `src/components/reviews/review-list.tsx`, `src/app/(client)/bookings/[code]/page.tsx`, `src/app/(client)/bookings/[code]/review-form.tsx`, `src/app/(client)/bookings/[code]/actions.ts`
      - done when: /p/[slug] (C3) shows approved portfolio items through /media and a Reviews block (booking month, package, reply), headed 'Free to leave, never paid for'. A completed booking within 60 days shows a review form on its booking page. After submitting, the page shows 'Rs 100 credit added'.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(profile): business portfolio and reviews on the public page`
- [ ] **P5.T14** Build freelancer profile editor  `todo`
      - depends on: P5.T11, P1.T8
      - files: `src/app/crew/profile/page.tsx`, `src/app/crew/profile/actions.ts`
      - done when: /crew/profile (P3) edits the headline, roles and day rate. checkPrivateProfile runs on save and shows a field error, so 'Butwal Films' in the headline is rejected. PortfolioGrid uses limitsFor at the freelancer's level and shows how many more slots the next level unlocks. Copy says 'private crew profile' and never 'alias' or 'anonymous'.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(crew): private profile editor with limits that grow with level`
- [ ] **P5.T15** Build business review replies page  `todo`
      - depends on: P5.T12
      - files: `src/app/business/reviews/page.tsx`, `src/app/business/reviews/actions.ts`
      - done when: /business/reviews lists the business's reviews. Each review without a reply has a reply form, and a review that has a reply shows it read-only. Replying calls reviews.reply.
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(business): reply once to each review`
- [ ] **P5.T16** Link crew and profile pages  `todo`
      - depends on: P5.T3, P5.T4, P5.T11, P5.T14, P5.T15
      - files: `src/components/ui/bottom-nav.tsx`, `src/components/shell/web-header.tsx`
      - done when: Business navs gain Crew (/business/crew), Profile (/business/profile) and Reviews (/business/reviews). Crew navs gain Jobs (/crew/jobs) and Profile (/crew/profile). Every nav href resolves to an existing route.
      - verify: `pnpm typecheck`, `pnpm lint`, `pnpm e2e -- tests/e2e/crew.spec.ts`
      - commit: `feat(shell): navigation to crew, profile and review pages`

## Execution schedule

```
Execution schedule — each wave is conflict-free and may be run in parallel:

  wave 1  ┌ [ ] P1.T1   Add agreement, theme and alias columns    
          ├ [ ] P1.T10  Limit client search to businesses         
          ├ [ ] P1.T11  Move colour tokens to CSS variables       
          ├ [ ] P1.T2   Write the public terms source             
          ├ [ ] P1.T7   Add text normaliser for contact detectio  
          ├ [ ] P3.T3   Add server-side QR scanner                
          └ [ ] P4.T2   Apply credit in fee quote                 
          ∥ 7 tasks — no shared files, safe to fan out

  wave 2  ┌ [ ] P2.T1   Add places table                          
          ├ [ ] P2.T4   Search from a lat/lng point               
          └ [ ] P2.T7   Store venue pin at lock                   
          ∥ 3 tasks — no shared files, safe to fan out

  wave 3  ─ [ ] P3.T1   Add chat threads, held status and report  

  wave 4  ─ [ ] P4.T1   Add append-only reward ledger             

  wave 5  ─ [ ] P5.T1   Add crew jobs and portfolio status        

  wave 6  ┌ [ ] P1.T12  Apply theme before first paint              ← P1.T11
          ├ [ ] P1.T13  Replace literal white in UI kit             ← P1.T11
          ├ [ ] P1.T14  Replace literal white in app pages          ← P1.T11
          ├ [ ] P1.T16  Add business and crew route groups          ← P1.T1
          ├ [ ] P1.T3   Parse terms markdown into rules             ← P1.T2
          ├ [ ] P1.T8   Generate crew aliases and check profiles    ← P1.T7
          ├ [ ] P2.T2   Seed Rupandehi cluster places               ← P2.T1
          ├ [ ] P3.T10  Add leakage signals view                    ← P3.T1
          ├ [ ] P3.T2   Build layered chat checker                  ← P1.T7
          ├ [ ] P3.T5   Add operator moderation service             ← P3.T1
          ├ [ ] P3.T7   Reveal contact 48h before event             ← P3.T1
          ├ [ ] P4.T3   Add ledger service with levels              ← P4.T1
          └ [ ] P4.T6   Track referral codes                        ← P4.T1
          ∥ 13 tasks — no shared files, safe to fan out

  wave 7  ┌ [ ] P1.T15  Add appearance settings with theme toggl    ← P1.T1, P1.T12
          ├ [ ] P1.T4   Render the /terms page                      ← P1.T3
          ├ [ ] P1.T5   Record agreement acceptance server-side     ← P1.T1, P1.T3
          ├ [ ] P2.T3   Add place search endpoint                   ← P2.T1, P2.T2
          ├ [ ] P3.T11  Add chat and signals to sidebar             ← P3.T10, P3.T5
          ├ [ ] P3.T4   Add chat send service                       ← P3.T1, P3.T2, P3.T3
          ├ [ ] P3.T8   Show verified payout QR                     ← P3.T7
          ├ [ ] P3.T9   Build operator held-message queue           ← P3.T5
          ├ [ ] P4.T10  Show level badges on cards                  ← P4.T3
          ├ [ ] P4.T4   Add reward earn events                      ← P3.T5, P4.T3
          ├ [ ] P4.T8   Redeem points for plan months               ← P4.T3
          └ [ ] P5.T7   Define portfolio limits                     ← P4.T3
          ∥ 12 tasks — no shared files, safe to fan out

  wave 8  ┌ [ ] P1.T17  Add per-role web header                     ← P1.T15, P1.T16
          ├ [ ] P1.T6   Build Join and agreement screens            ← P1.T4, P1.T5
          ├ [ ] P1.T9   Make onboarding kind-aware                  ← P1.T1, P1.T5, P1.T8
          ├ [ ] P2.T5   Add place picker on home                    ← P2.T3, P2.T4
          ├ [ ] P3.T6   Build chat screens                          ← P3.T4
          ├ [ ] P4.T5   Complete booking when balance confirmed     ← P4.T4
          ├ [ ] P4.T9   Build rewards page                          ← P4.T3, P4.T8
          ├ [ ] P5.T12  Add review service                          ← P4.T4, P5.T1
          ├ [ ] P5.T2   Add crew job service                        ← P4.T4, P5.T1
          └ [ ] P5.T8   Screen portfolio uploads                    ← P3.T3, P5.T1, P5.T7
          ∥ 10 tasks — no shared files, safe to fan out

  wave 9  ─ [ ] P4.T11  Add credit pill to headers                  ← P4.T10, P4.T3

  wave 10 ┌ [ ] P1.T18  Add Join end-to-end test                    ← P1.T16, P1.T6, P1.T9
          ├ [ ] P1.T19  Add theme-switching end-to-end test         ← P1.T15, P1.T17
          ├ [ ] P2.T6   Show distance on results                    ← P2.T5
          ├ [ ] P4.T7   Apply credit at checkout                    ← P4.T2, P4.T3, P4.T5
          ├ [ ] P5.T10  Build operator portfolio queue              ← P5.T8
          ├ [ ] P5.T15  Build business review replies page          ← P5.T12
          ├ [ ] P5.T3   Build find-crew page                        ← P5.T2
          ├ [ ] P5.T4   Build freelancer job offers page            ← P5.T2
          ├ [ ] P5.T5   Build business crew jobs page               ← P5.T12, P5.T2
          └ [ ] P5.T9   Add portfolio upload and media routes       ← P5.T8
          ∥ 10 tasks — no shared files, safe to fan out

  wave 11 ─ [ ] P3.T12  Add held-message end-to-end test            ← P3.T11, P3.T6, P3.T9

  wave 12 ┌ [ ] P2.T8   Update booking end-to-end test for place    ← P2.T5, P2.T6, P2.T7
          ├ [ ] P5.T11  Build business profile editor               ← P5.T9
          ├ [ ] P5.T13  Show portfolio and reviews publicly         ← P5.T12, P5.T9
          └ [ ] P5.T6   Add crew hire end-to-end test               ← P5.T3, P5.T4, P5.T5
          ∥ 4 tasks — no shared files, safe to fan out

  wave 13 ─ [ ] P5.T14  Build freelancer profile editor             ← P1.T8, P5.T11

  wave 14 ─ [ ] P5.T16  Link crew and profile pages                 ← P5.T11, P5.T14, P5.T15, P5.T3, P5.T4

Serialised by blast radius (independent in the DAG, but share files):
  P1.T1 ✕ P2.T1  →  drizzle, src/server/db/schema.test.ts, src/server/db/schema.ts
  P1.T1 ✕ P3.T1  →  drizzle, src/server/db/schema.test.ts, src/server/db/schema.ts
  P1.T1 ✕ P4.T1  →  drizzle, src/server/db/schema.test.ts, src/server/db/schema.ts
  P1.T1 ✕ P5.T1  →  drizzle, src/server/db/schema.test.ts, src/server/db/schema.ts
  P1.T10 ✕ P2.T4  →  src/server/search.test.ts, src/server/search.ts
  P1.T10 ✕ P2.T7  →  src/server/bookings.test.ts, src/server/bookings.ts
  P2.T1 ✕ P3.T1  →  drizzle, src/server/db/schema.test.ts, src/server/db/schema.ts
  P2.T1 ✕ P4.T1  →  drizzle, src/server/db/schema.test.ts, src/server/db/schema.ts
  P2.T1 ✕ P5.T1  →  drizzle, src/server/db/schema.test.ts, src/server/db/schema.ts
  P3.T1 ✕ P4.T1  →  drizzle, src/server/db/schema.test.ts, src/server/db/schema.ts
  P3.T1 ✕ P5.T1  →  drizzle, src/server/db/schema.test.ts, src/server/db/schema.ts
  P4.T1 ✕ P5.T1  →  drizzle, src/server/db/schema.test.ts, src/server/db/schema.ts
  P1.T17 ✕ P4.T11  →  src/app/(client)/layout.tsx, src/app/business/layout.tsx, src/app/crew/layout.tsx, src/components/shell/web-header.tsx, src/components/ui/bottom-nav.tsx
  P1.T18 ✕ P3.T12  →  tests/e2e/helpers.ts
```

## Decisions

- **Plan approved on the user's standing instruction, not by a review of this draft** — User wrote mid-session: 'once the designs are done just continue with developing product, i will review it morning and make the UI/UX changes while our core system stays as planned'. The plan follows docs/system-plan.md sections 9-10 and the user's Task 3 brief verbatim; the user is away overnight and asked for no stop. Alternative rejected: block on AskUserQuestion until morning, which would idle the night the user asked to use.  _2026-11-08T02:53:14+05:45_
- **Plan document committed at docs/plans/saait-phase-1.md** — Repo had no plan doc; user away so could not choose. Committed doc is durable and reversible; scratchpad-only would be lost if the session ends.  _2026-11-08T02:53:14+05:45_
- **Anita Gurung is seeded as verified** — Results.dc.html shows her bookable and verified; AdminKYC.dc.html reuses her name as a pending submission. The client screens are the stronger signal; the admin queue uses the other four names. Recorded in docs/design/figma.md for the morning UI review.  _2026-11-08T03:13:47+05:45_
- **Providers in reverification_due are hidden from search until re-verified** — Section 15 gates public listing on Verified; a payout or name change means identity is no longer confirmed, and the 7-day payout hold only protects money, not the client's trust in who arrives. Revisit with a grace period when yearly re-verification lands, so providers do not vanish on their anniversary.  _2026-11-08T03:19:26+05:45_
- **Confirmation SMS carries the Gregorian date in brackets** — DesignSystem.dc.html says dates show Nepali first with the Gregorian date where it matters, naming confirmations and SMS; its own urgent SMS sample reads 'Falgun 13 (Feb 25)'. The confirmation sample omits it, so the explicit rule wins over the one sample.  _2026-11-08T03:30:52+05:45_
- **Lock button and See all link follow the once-per-screen Sindoor rule over the mockups** — Main.dc.html colours 'See all' Sindoor while the active nav tab is also Sindoor; CLAUDE.md caps Sindoor at once per screen. 'See all' is now ink and underlined. Lock shows the chosen package price via CSS :has so it works without JavaScript.  _2026-11-08T03:30:52+05:45_

## Overrides (guardrails bypassed)

- `plan` — README run instructions and refreshed plan document after Phase 1 shipped; docs only, no code  _2026-11-08T03:56:24+05:45_
- `plan` — docs-only: record the Figma Web screens page captured from the running site  _2026-11-08T14:35:47+05:45_

<!-- harness:end 7ca902e8-9a21-4aa4-969f-bf1715d73be1 -->
