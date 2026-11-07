# Plan

<!-- harness:begin 7ca902e8-9a21-4aa4-969f-bf1715d73be1 -->
### Ship Saait Phase 1: schema, client booking flow, provider onboarding with KYC, operator verification desk

`saait-phase-1` · session `7ca902e8-9a21-4aa4-969f-bf1715d73be1` · status **approved** · approved 2026-11-08T02:53:14+05:45

**14/14** tasks closed (0 verified, 14 shipped).

## P1 — Foundations and domain  (6/6)

A running Next.js app on the Saait tokens, with the money rules, schema, auth and UI kit everything else builds on

**Exit criteria:** pnpm typecheck, pnpm test and pnpm build pass; pnpm db:migrate applies 0000 to an empty Postgres 16 database; pnpm db:seed loads Butwal providers

- [x] **P1.T1** Scaffold Next.js with Saait tokens and tooling  `shipped`
      - depends on: — (independent)
      - files: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `.gitignore`, `src/env.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `next-env.d.ts`
      - done when: pnpm install, pnpm typecheck, pnpm lint and pnpm build succeed; globals.css defines every Saait colour, radius and spacing token as a CSS variable mapped into Tailwind v4 @theme; Mukta loads via next/font; env is parsed by zod
      - verify: `pnpm typecheck`, `pnpm lint`, `pnpm build`
      - commit: `chore(app): scaffold Next.js with Saait tokens, zod env and test tooling`
      - evidence: pass · `pnpm install --frozen-lockfile; rm -rf .next; pnpm typecheck; pnpm lint; pnpm build; grep compiled .next/static/chunks/*.css for 38 token declarations; pnpm tsx envtest.mts` · 2026-11-08T03:00:46+05:45
- [x] **P1.T2** Money, fees and Nepali dates  `shipped`
      - depends on: P1.T1
      - files: `src/lib/money.ts`, `src/lib/money.test.ts`, `src/lib/fees.ts`, `src/lib/fees.test.ts`, `src/lib/nepali-date.ts`, `src/lib/nepali-date.test.ts`
      - done when: Integer paisa arithmetic; booking fee 4% floor Rs 500 cap Rs 3,000; deposit 25% of agreed total; VAT 13% on the fee; withholding 15% non-VAT or 1.5% VAT applied to the released deposit only; urgent surcharge Rs 1,000 split 60/40; BS date formatting for Falgun 2083; all covered by vitest including the Booking screen example (total 73,000 gives deposit 18,250, fee 2,920, balance 54,750)
      - verify: `pnpm test -- src/lib`
      - commit: `feat(domain): money, booking fee, deposit, withholding and BS date rules`
      - evidence: pass · `pnpm test (exit 0, 4 files, 44/44 pass); pnpm typecheck (exit 0); tsx adversarial probe + full BS round-trip sweep` · 2026-11-08T03:03:26+05:45
- [x] **P1.T3** Drizzle schema and first migration  `shipped`
      - depends on: P1.T1
      - files: `drizzle.config.ts`, `src/server/db/schema.ts`, `src/server/db/index.ts`, `src/server/db/schema.test.ts`, `drizzle/0000_initial.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0000_snapshot.json`
      - done when: Section 10 core tables exist with money as bigint minor units plus a currency column; unique citizenship number and PAN across provider profiles; booking urgency enum present as a Phase 2 hook; migration applies cleanly to an empty database
      - verify: `pnpm db:reset:test`, `pnpm test -- src/server/db`
      - commit: `feat(db): core schema for providers, packages, availability, holds and bookings`
      - evidence: pass · `pnpm db:reset:test; pnpm exec vitest run src/server/db; createdb saait_verify_tmp + psql -v ON_ERROR_STOP=1 -f drizzle/0000_initial.sql + SQL probes + dropdb; pnpm drizzle-kit generate --name probe` · 2026-11-08T03:08:45+05:45
- [x] **P1.T4** Seed cities, categories, dates, providers  `shipped`
      - depends on: P1.T2, P1.T3
      - files: `src/server/db/seed.ts`, `src/server/db/seed-data.ts`
      - done when: pnpm db:seed is idempotent and loads Butwal cluster cities, the nine categories, Falgun 2083 auspicious dates and the design-round providers with their fixed packages
      - verify: `pnpm db:seed`, `pnpm db:seed`
      - commit: `feat(db): seed Butwal cluster, categories, wedding dates and providers`
      - evidence: pass · `saait_test only: pnpm db:reset:test; DATABASE_URL=postgres://localhost:5432/saait_test pnpm exec tsx src/server/db/seed.ts x2 + md5 snapshot diff; mutate seeded rows and reseed; planted PAN clash to force a late failure; clean reseed content checks` · 2026-11-08T03:14:35+05:45
- [x] **P1.T5** Session auth with phone OTP adapter  `shipped`
      - depends on: P1.T3
      - files: `src/server/auth/session.ts`, `src/server/auth/otp.ts`, `src/server/auth/otp.test.ts`, `src/server/sms/index.ts`, `src/server/sms/console.ts`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/server/auth/guards.ts`
      - done when: iron-session cookie; OTP issued and checked through an OtpSender adapter whose dev implementation logs the code; codes hashed, expire in 5 minutes and lock after 5 attempts; roles client, provider, operator, admin; zod on every action input
      - verify: `pnpm test -- src/server/auth`
      - commit: `feat(auth): phone OTP sign-in behind an SMS adapter with iron-session`
      - evidence: pass · `pnpm exec vitest run src/server/auth; tsx scratchpad/race.mts against saait_test; pnpm build && pnpm start -p 3210 + Playwright e2e.mjs and e2e2.mjs (tampered next)` · 2026-11-08T03:15:39+05:45
- [x] **P1.T6** UI kit from the design system  `shipped`
      - depends on: P1.T1
      - files: `src/components/ui/button.tsx`, `src/components/ui/chips.tsx`, `src/components/ui/day-cell.tsx`, `src/components/ui/text-input.tsx`, `src/components/ui/package-card.tsx`, `src/components/ui/provider-tile.tsx`, `src/components/ui/bottom-nav.tsx`, `src/components/ui/icons.tsx`, `src/components/ui/index.ts`
      - done when: Every Figma component exists as a React component using only token classes: Button (primary, secondary, urgent, tertiary, disabled), Filter chip, Status chip, Day cell, Text input with label/helper/error, Package card regular and compact, Provider tile 4:5, Bottom nav client and provider
      - verify: `pnpm typecheck`, `pnpm lint`
      - commit: `feat(ui): Saait component kit matching the Figma design system`
      - evidence: pass · `harness verify run P1.T6 (pnpm typecheck, pnpm lint); pnpm build; grep -rnE '\[[0-9#]' src/components/ui; emitted-CSS check; spec comparison against design/canvas/project/*.dc.html` · 2026-11-08T03:15:26+05:45

## P2 — Client booking flow  (4/4)

A client can pick a date, see who is free, open a provider and lock the date with a deposit

**Exit criteria:** Playwright walks home, results, provider and booking to a confirmed booking with a held deposit

- [x] **P2.T1** Availability search and provider queries  `shipped`
      - depends on: P1.T4
      - files: `src/server/search.ts`, `src/server/search.test.ts`, `src/server/providers.ts`
      - done when: Only verified providers free on the date appear; sort is availability, then rating, then distance, never price; budget band groups without ranking by price inside a band
      - verify: `pnpm test -- src/server/search`
      - commit: `feat(search): free-on-date search that never ranks by price`
      - evidence: pass · `Re-check after coordinator fixes: DATABASE_URL_TEST=DATABASE_URL=postgres://localhost:5432/saait_verify_a_test pnpm exec vitest run src/server/search ; plus scratch probe (11 tests) via vitest --root scratchpad/probe` · 2026-11-08T03:20:07+05:45
- [x] **P2.T2** Home, results and provider pages  `shipped`
      - depends on: P1.T6, P2.T1
      - files: `src/app/(client)/layout.tsx`, `src/app/(client)/page.tsx`, `src/app/(client)/results/page.tsx`, `src/app/(client)/p/[slug]/page.tsx`, `src/components/client/date-strip.tsx`, `src/components/client/category-chips.tsx`, `src/components/client/package-picker.tsx`, `src/app/page.tsx`
      - done when: Pages render from the database at 390 px matching the Figma screens 1 to 3, with query state in the URL validated by zod
      - verify: `pnpm build`
      - commit: `feat(client): home, free-on-date results and provider pages`
      - evidence: pass · `re-seed saait_verify_c_test; vitest run src/server/client/query.test.ts src/server/search.test.ts (11 passed); pnpm build; pnpm start -p 3230; Playwright chromium 390x844 + 1280x900 on /, /results, /p/shrestha-studio, /urgent; curl hostile/boundary queries` · 2026-11-08T03:32:24+05:45
- [x] **P2.T3** Date hold, booking and deposit payment  `shipped`
      - depends on: P2.T1, P1.T5
      - files: `src/server/bookings.ts`, `src/server/bookings.test.ts`, `src/server/payments/index.ts`, `src/server/payments/manual.ts`, `src/app/(client)/book/[slug]/page.tsx`, `src/app/(client)/book/[slug]/actions.ts`, `src/app/(client)/bookings/[code]/page.tsx`, `src/app/api/payments/[provider]/webhook/route.ts`
      - done when: Checkout places a 24 hour hold that respects per-day capacity; payment runs through a PaymentGateway adapter with a manual dev implementation and idempotent records; confirming marks the day booked and sends SMS through the adapter; only deposit plus fee is charged
      - verify: `pnpm test -- src/server/bookings`
      - commit: `feat(booking): date hold, deposit checkout and confirmation behind a payment adapter`
      - evidence: pass · `DATABASE_URL_TEST=...saait_verify_a_test pnpm exec vitest run src/server/bookings src/env (exit 0, 15/15); tsx scratchpad/attack2.mts + stress.mts (exit 0); pnpm build (exit 0) + fresh pnpm start -p 3240 + curl webhooks; pnpm jobs:tick (exit 0)` · 2026-11-08T03:35:22+05:45
- [x] **P2.T4** End-to-end client booking test  `shipped`
      - depends on: P2.T2, P2.T3
      - files: `tests/e2e/booking.spec.ts`, `tests/e2e/helpers.ts`
      - done when: Playwright books Shrestha Studio Standard on Falgun 12 and sees Rs 21,170 due now and booking code on the confirmation page
      - verify: `pnpm e2e -- booking`
      - commit: `test(e2e): client books and locks a wedding date`
      - evidence: pass · `pnpm e2e (2 consecutive runs, after waiting for no concurrent next build) + review of updated tests/e2e/booking.spec.ts` · 2026-11-08T03:41:45+05:45

## P3 — Provider KYC and operator desk  (4/4)

Providers onboard and upload KYC documents; nothing goes public until an operator verifies them

**Exit criteria:** Playwright: a new provider submits KYC, is absent from search, an operator approves with all six checks, the provider appears in search

- [x] **P3.T1** KYC records, encrypted storage, audit log  `shipped`
      - depends on: P1.T5
      - files: `src/server/kyc.ts`, `src/server/kyc.test.ts`, `src/server/storage/index.ts`, `src/server/storage/local-encrypted.ts`, `src/server/audit.ts`
      - done when: Documents stored AES-256-GCM encrypted behind a storage adapter and readable only by operator and admin; submit, approve and reject follow section 15 including one resubmission, 90-day lock on second rejection, duplicate detection, and an audit entry for every decision
      - verify: `pnpm test -- src/server/kyc`
      - commit: `feat(kyc): encrypted document capture, review decisions and audit log`
      - evidence: pass · `pnpm exec vitest run src/server/kyc (22/22, exit 0); harness verify run P3.T1; attack suite scratchpad/attack.test.ts rounds 1-3 (29 cases, 30-iteration edit/startReview race)` · 2026-11-08T03:24:44+05:45
- [x] **P3.T2** Provider onboarding and KYC capture  `shipped`
      - depends on: P1.T6, P3.T1
      - files: `src/app/provider/layout.tsx`, `src/app/provider/page.tsx`, `src/app/provider/onboarding/page.tsx`, `src/app/provider/kyc/page.tsx`, `src/app/provider/kyc/actions.ts`, `src/app/provider/kyc/upload-tile.tsx`
      - done when: Provider signs in, picks categories and city, then completes phone, ID, PAN and payout steps matching Figma screen 7; files validated for type and size
      - verify: `pnpm build`
      - commit: `feat(provider): onboarding and KYC document capture`
      - evidence: pass · `re-seed saait_verify_d_test; pnpm build (exit 0, BUILD_ID o_gi08ZKGykXcMET2vV91 unchanged for the whole run); pnpm start -p 3250; Playwright chromium scratch v2_provider.mjs, mkprov3.mjs, v2_op.mjs (provider parts)` · 2026-11-08T03:55:04+05:45
- [x] **P3.T3** Operator verification desk  `shipped`
      - depends on: P1.T6, P3.T1
      - files: `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/kyc/page.tsx`, `src/app/admin/kyc/[id]/page.tsx`, `src/app/admin/kyc/actions.ts`, `src/app/admin/kyc/document/[docId]/route.ts`
      - done when: Operator-only queue and review page matching Figma screen 8; approve requires all six checklist items; reject requires a note; decisions audited
      - verify: `pnpm build`
      - commit: `feat(admin): operator KYC verification desk`
      - evidence: pass · `re-seed saait_verify_d_test; pnpm build (exit 0); pnpm start -p 3250; v2_op.mjs: fetch probes with anon, client, provider and forged iron-session cookies (role operator/admin sealed for a client, a provider and a nonexistent user), plus RSC partial headers; Playwright operator desk at 1280 and 390; replayed decideAction POSTs` · 2026-11-08T03:55:04+05:45
- [x] **P3.T4** End-to-end KYC gate test  `shipped`
      - depends on: P3.T2, P3.T3, P2.T2
      - files: `tests/e2e/kyc.spec.ts`
      - done when: Playwright proves an unverified provider is invisible to clients and appears after operator approval
      - verify: `pnpm e2e -- kyc`
      - commit: `test(e2e): KYC gate keeps unverified providers out of search`
      - evidence: pass · `pnpm e2e (2 consecutive runs) after the full-name onboarding field, admin role checks and src/proxy.ts` · 2026-11-08T03:55:56+05:45

## Decisions

- **Plan approved on the user's standing instruction, not by a review of this draft** — User wrote mid-session: 'once the designs are done just continue with developing product, i will review it morning and make the UI/UX changes while our core system stays as planned'. The plan follows docs/system-plan.md sections 9-10 and the user's Task 3 brief verbatim; the user is away overnight and asked for no stop. Alternative rejected: block on AskUserQuestion until morning, which would idle the night the user asked to use.  _2026-11-08T02:53:14+05:45_
- **Plan document committed at docs/plans/saait-phase-1.md** — Repo had no plan doc; user away so could not choose. Committed doc is durable and reversible; scratchpad-only would be lost if the session ends.  _2026-11-08T02:53:14+05:45_
- **Anita Gurung is seeded as verified** — Results.dc.html shows her bookable and verified; AdminKYC.dc.html reuses her name as a pending submission. The client screens are the stronger signal; the admin queue uses the other four names. Recorded in docs/design/figma.md for the morning UI review.  _2026-11-08T03:13:47+05:45_
- **Providers in reverification_due are hidden from search until re-verified** — Section 15 gates public listing on Verified; a payout or name change means identity is no longer confirmed, and the 7-day payout hold only protects money, not the client's trust in who arrives. Revisit with a grace period when yearly re-verification lands, so providers do not vanish on their anniversary.  _2026-11-08T03:19:26+05:45_
- **Confirmation SMS carries the Gregorian date in brackets** — DesignSystem.dc.html says dates show Nepali first with the Gregorian date where it matters, naming confirmations and SMS; its own urgent SMS sample reads 'Falgun 13 (Feb 25)'. The confirmation sample omits it, so the explicit rule wins over the one sample.  _2026-11-08T03:30:52+05:45_
- **Lock button and See all link follow the once-per-screen Sindoor rule over the mockups** — Main.dc.html colours 'See all' Sindoor while the active nav tab is also Sindoor; CLAUDE.md caps Sindoor at once per screen. 'See all' is now ink and underlined. Lock shows the chosen package price via CSS :has so it works without JavaScript.  _2026-11-08T03:30:52+05:45_

<!-- harness:end 7ca902e8-9a21-4aa4-969f-bf1715d73be1 -->
