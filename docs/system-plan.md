# System plan: fixed-package photographer marketplace for Nepal

Revised after the validation report. Bidding is gone. Photographers publish fixed packages; clients browse, compare and book; the two sides may negotiate freely, but the date is locked only through the platform, and the lock is the product.

## 1. What the platform is, in one paragraph

A location-based booking layer for photographers, videographers and content creators in Nepal. Each provider has a verified profile with a portfolio, a calendar, and fixed packages (price, hours, deliverables, delivery time). A client picks a city, a date and a service type, sees who is actually free that day with real prices, and locks the date with a deposit. The platform guarantees the booking: if the provider cancels or no-shows, a vetted backup from the pool steps in or the deposit is refunded. Negotiation is allowed through in-app chat with a "custom offer" that turns the agreed price into a normal booking. The family studio is the first provider, the vetting team and the backup of last resort.

## 2. Design principles carried over from the validation

1. **Floors, not auctions.** Providers set their own package prices. The platform never ranks by lowest price by default and never shows "cheapest first" as the primary sort. Default sort is availability, then rating, then distance.
2. **Monetise the lock, not the match.** Discovery leaks to Messenger. A guaranteed date, deposit protection and a backup pool do not. Fees sit on the booking confirmation and on provider subscriptions, with any commission at or below 10 percent.
3. **Peak-date overflow first.** The measurable excess demand is on the roughly 41 auspicious wedding dates. The calendar and backup pool are built for those days; everything else is a smoothing line.
4. **Clients pay the balance directly.** Only the deposit flows through the platform, so the 15 percent withholding on payouts to non-VAT providers touches 20 to 30 percent of the package, not all of it. Confirm with a chartered accountant before launch.
5. **Nepal only, by design.** No India, no "global" supply. Foreign clients may book Nepali providers and Nepali editing work later, paid via Khalti-Stripe.

## 3. Users and roles

| Role | Who | What they need |
| --- | --- | --- |
| Client | Couples, families, event planners, small businesses, media houses | See who is free on a date, compare real prices and work, lock the date safely, get the photos |
| Provider | Studios, freelance photographers, videographers, editors, content creators | Fill the calendar, especially off-peak; look credible; get paid without chasing; avoid price wars |
| Studio operator (you) | Family studio team | Vet providers, run the backup pool, resolve disputes, approve payouts |
| Admin | Same team, elevated | Categories, cities, fees, subscriptions, content moderation, compliance records |

## 4. Core objects

- **Provider profile**: display name, business name, PAN and VAT status (drives withholding rate), citizenship or company registration on file, home city, service radius and travel fee zones, portfolio (images, reels, YouTube links), years active, gear summary, languages, verification badge, response-time stat, completed-bookings count.
- **Service category**: wedding photography, wedding video and cinematic, engagement and pre-wedding, event and corporate, portrait and studio (passport, family), product and food, social content (reels, UGC), drone, editing only. Categories are admin-managed.
- **Package**: belongs to a provider and a category. Fixed price in NPR, coverage hours, number of shooters, deliverables (edited photo count, highlight film length, raw files yes or no, album), delivery time in days, what is excluded, deposit percentage (default 25 percent), peak-date surcharge (optional, shown upfront), add-ons (second shooter, drone, same-day edit, extra hour, album upgrade) each with a fixed price.
- **Availability**: provider calendar with open, held, booked and blocked days; optional per-day capacity (a studio can take three events on a date, a freelancer one). Auspicious wedding dates are pre-loaded as a layer so providers can price them and clients can see demand.
- **Enquiry and chat**: thread between client and provider around a package and date. Provider can send a **custom offer** (adjusted price, scope, deposit) that the client accepts into a booking. Chat is where negotiation happens; the platform does not control the price, it records the outcome.
- **Date hold**: a free, time-limited soft hold (24 to 48 hours) created when a client starts checkout or a provider sends an offer. Expires automatically.
- **Booking**: package or custom offer, date, venue address and location pin, agreed total, deposit amount, balance due, cancellation policy snapshot, **urgency flag** (standard, or urgent when the event is within 72 hours), status (held, confirmed, in progress, delivered, completed, cancelled, disputed).
- **Urgent request**: a broadcast created when a client needs a provider within 72 hours. Holds category, city, date and time window, budget band, venue pin, expiry (default 2 hours), and the list of providers notified with each one's channel and response. The first provider to accept wins; the client confirms by paying the deposit.
- **KYC record**: per provider. Citizenship or passport front and back, PAN certificate, company registration if a studio, bank account or wallet ownership proof, selfie matched against the ID by the operator, status (submitted, under review, verified, rejected, re-verification due), reviewer, timestamps, rejection reason. No provider receives enquiries, appears in search or gets urgent broadcasts until verified.
- **Notification preferences**: per provider. Channels (SMS, email, push later), quiet hours, categories and cities to be alerted for, urgent-alert opt-in, and plan-derived eligibility (see section 14).
- **Payment**: deposit via eSewa, Khalti, Fonepay QR or card (Khalti-Stripe for foreign cards); platform booking fee; payout record to provider with withholding amount and TDS certificate reference; balance marked as paid directly (provider confirms, client confirms, or proof uploaded).
- **Review**: only from completed bookings, both directions, with photos allowed; provider reply.
- **Dispute**: opened by either side within a window after the event date; evidence, timeline, operator decision, refund or release outcome. Required by the Electronic Commerce Act's complaint-handling duty.
- **Subscription**: provider plan (Free, Pro, Studio) with billing records.
- **Backup pool membership**: providers who opt in to cover cancellations in a city and category, with a standby fee and response SLA.

## 5. Key flows

### Client books a date
1. Choose city or drop a pin, date, category. Optional budget tier filter (Basic, Standard, Premium) that groups by price band but never ranks within a band by price.
2. See providers free that day with their matching packages, starting price, rating, distance and verified badge. Peak-date surcharge shown inline, never at checkout.
3. Open a profile, view portfolio and packages, optionally message. Provider may send a custom offer.
4. Tap Book: choose add-ons, enter venue and contact, see total, deposit, balance due and cancellation terms. A 24-hour hold is placed.
5. Pay deposit plus booking fee by wallet or card. Booking is confirmed, provider and client both get SMS and in-app confirmation, the date turns booked on the public calendar.
6. Before the event: reminder, venue confirmation, shot-list upload. Day of event: provider marks arrival; client can mark no-show, which triggers the backup pool.
7. After the event: provider marks delivered with a gallery link; client confirms; balance recorded as paid directly to the provider; deposit released to the provider minus withholding; both review.

### Provider onboards
1. Sign up with phone OTP, pick categories and cities.
2. Upload citizenship or company registration and PAN; choose VAT status. Operator reviews within two working days, with a portfolio quality check.
3. Build packages from templates seeded by category (the studio's own packages are the first templates). Set availability and peak-date surcharges.
4. Go live on Free plan. Upgrade to Pro for more packages, featured placement and chat-first access to enquiries.

### No-show or cancellation
- Provider cancels more than 14 days out: client offered three alternatives from the pool at equal or lower price, or full refund. Provider's reliability score drops.
- Provider cancels inside 14 days or no-shows: operator dispatches from the backup pool, platform covers any price difference up to a cap from the provider's forfeited payouts and the guarantee reserve, client refunded if nobody can be found. Repeat offenders are removed.
- Client cancels: deposit refund schedule follows the policy snapshot (for example full refund more than 30 days out, 50 percent at 15 to 30 days, none inside 14 days). Booking fee is non-refundable.

### Negotiation off the platform
Allowed and expected. The platform's answer is to make the lock cheaper than the risk: the client gets the guarantee, the provider gets a confirmed deposit and a public booked date, and the booking fee is small. The platform tracks the enquiry-to-booking ratio per provider; providers who consistently convert off-platform lose featured placement rather than being penalised outright.

## 6. Monetisation

| Line | Who pays | Amount (starting point, adjust after concierge data) | Rationale |
| --- | --- | --- | --- |
| Booking fee | Client | 4 percent of agreed total, floor NPR 500, cap NPR 3,000 | Paid for the guarantee and the lock; survives leakage; VAT at 13 percent on this fee |
| Provider subscription | Provider | Free: 2 packages, 1 city. Pro: NPR 1,500 per month or NPR 12,000 per year, 10 packages, featured, analytics. Studio: NPR 4,000 per month, multi-shooter capacity, team accounts | Mirrors WedMeGood's revenue mix; predictable in off-season |
| Peak-date featured slot | Provider | NPR 2,000 to 5,000 per auspicious date, limited slots | Monetises the 41 dates where demand exceeds supply |
| Backup-pool standby | Platform to provider | Platform pays a standby fee out of the guarantee reserve | Cost line, not revenue; makes the guarantee real |
| Urgent booking surcharge | Client | NPR 1,000 flat on top of the booking fee for requests inside 72 hours; 60 percent passed to the provider as an urgency bonus, 40 percent retained | Pays providers for dropping plans at short notice and pays for SMS broadcast costs |
| Commission | None at launch | 0 percent, revisit only if booking fee data supports moving to a shared fee | Pathao and inDrive history caps tolerance at about 10 percent |

Illustrative month at steady state in one city cluster: 120 confirmed bookings at an average NPR 40,000 yields about NPR 1.6 lakh in booking fees, plus 80 Pro subscribers at NPR 1,500 yields NPR 1.2 lakh, plus peak-date slots. That is a small, durable regional business, consistent with the validation's conclusion.

## 7. Money handling and tax, as designed

- Client pays deposit plus booking fee into the company's merchant account via eSewa, Khalti or Fonepay (fees about 1 to 3.5 percent). Funds are held as company liabilities under "release on delivery" terms, since there is no escrow licence category in Nepal.
- Booking fee is recognised as platform revenue with VAT.
- Deposit is released to the provider after the client confirms delivery or the dispute window closes. Withholding of 15 percent (non-VAT provider) or 1.5 percent (VAT-registered) is applied to the released deposit only, with an e-TDS filing and certificate so the provider can claim credit.
- Balance is paid client to provider directly. Both sides confirm in-app; the platform never touches it, so no withholding applies.
- Foreign clients pay via Khalti-Stripe at about 2 percent, settled in NPR.
- A guarantee reserve of 2 percent of booking fees is set aside for backup-pool price differences and goodwill refunds.
- Apply to the NRB Regulatory Sandbox for a segregated client-money account once volume justifies it.

## 8. Trust and quality controls

- Identity and PAN on file for every provider; verified badge only after operator portfolio review.
- Reviews only from completed bookings, never from enquiries.
- Reliability score from on-time arrival, delivery within promised days, cancellations.
- Capacity caps per date per provider, enforced by the calendar, so nobody sells six weddings they cannot shoot.
- Delivery deadline tracking with automatic nudges and an escalation to the operator after the promised delivery date passes.
- Dispute process with evidence upload and a published policy, satisfying the Electronic Commerce Act complaint-handling duty.

## 9. Phased build

### Phase 0: concierge, no code (4 to 8 weeks, one wedding season start)
Facebook page, WhatsApp number, a Google Form for enquiries, a shared sheet of 15 to 20 vetted providers with their packages and calendars, eSewa deposits into the company account, manual confirmations by SMS. Target 20 to 30 bookings. Measure deposit conversion, average package, enquiry-to-booking ratio, no-show count, how often clients negotiate and by how much. Incorporate the company and complete the Department of Commerce listing in parallel.

### Phase 1: MVP web app (8 to 12 weeks)
Mobile-first web app, Nepali and English. Provider profiles, packages, calendar with peak-date layer, search by city, date and category, booking with hold, eSewa and Khalti deposit, SMS notifications, operator dashboard for verification, bookings and payouts, basic disputes. One city cluster. No chat yet; enquiries go to a WhatsApp deep link with the booking reference, and custom offers are entered by the operator.

### Phase 2: marketplace loops (next 3 months)
In-app chat with custom offers, reviews, provider subscriptions with billing, featured peak-date slots, backup pool with dispatch flow, reliability scores, Fonepay QR and card payments, e-TDS export for the accountant.

### Phase 3: expansion (6 to 12 months)
Second and third city clusters (Pokhara or Kathmandu valley), business content packages for off-season, editing-only category marketed to foreign studios with Khalti-Stripe checkout, PWA install prompts, sandbox application for segregated client money.

## 10. Technical architecture

The Suzziz stack transfers directly: Next.js App Router, TypeScript, Tailwind, Postgres with Drizzle, zod at every boundary, iron-session for auth, vitest and Playwright. Replace the catalog with providers and packages, and the cart with holds and bookings.

- **Auth**: phone OTP via a Nepali SMS gateway (Sparrow SMS or Aakash SMS), roles client, provider, operator, admin.
- **Core tables**: users, provider_profiles, provider_documents, cities, service_categories, packages, package_addons, availability_days, date_holds, enquiries, messages, offers, bookings, payments, payouts, withholding_records, reviews, disputes, subscriptions, backup_pool_members, auspicious_dates.
- **Money**: integer minor units in NPR with currency alongside, exactly as the Suzziz convention. Format only at the edge.
- **Payments**: adapter interface with eSewa and Khalti implementations first, Fonepay and Khalti-Stripe later; webhook verification; idempotent payment records.
- **Search**: Postgres with PostGIS or a simple haversine on city centroids and provider pins; filter by date availability, category, budget band; sort by availability, rating, distance.
- **Media**: object storage (S3-compatible) with image resizing; video via YouTube or Vimeo embeds to keep bandwidth cheap.
- **Notifications**: SMS for every booking state change, since SMS reaches everyone; in-app and email secondary.
- **Admin**: server actions behind operator role for verification, disputes, payouts and TDS exports.
- **Data protection**: store only what is needed for verification, encrypt document blobs, deletion on request, consistent with the Privacy Act 2075 and Electronic Transactions Act.

## 11. Metrics that decide each phase

| Metric | Phase 0 target to proceed | Why |
| --- | --- | --- |
| Deposit conversion from qualified enquiry | at least 25 percent | Proves clients will prepay a platform, not just a studio |
| Average agreed price vs listed package | within 15 percent | Shows fixed packages anchor the negotiation |
| Enquiries that book elsewhere after platform intro | under 50 percent | Leakage proxy |
| Provider acceptance of Pro at NPR 1,500 per month | at least 1 in 3 interviewed | Subscription viability |
| No-shows handled by backup pool | 100 percent of incidents | The guarantee must hold or the model fails |
| Peak-date fill rate across the pool | above 80 percent | Confirms overflow is the real demand |

## 12. Compliance checklist before first paid booking

- Private limited company registered at the Office of Company Registrar; PAN; voluntary VAT registration.
- Department of Commerce e-commerce listing number, PAN and complaint contact displayed in the footer.
- Terms of service framing the platform as agent and booking facilitator, with cancellation, refund and dispute policy published.
- eSewa, Khalti and Fonepay merchant agreements; Khalti-Stripe for foreign cards.
- Monthly e-TDS filing process agreed with a chartered accountant; confirmation that withholding applies to released deposits only.
- Provider agreement covering verification, cancellation penalties, backup-pool duties and copyright (providers keep copyright; clients get a usage licence; the platform gets portfolio display rights only).
- Privacy notice and data retention schedule.

## 13. Open questions to settle with data from Phase 0

- Deposit percentage: 20, 25 or 30 percent. Higher deposits strengthen the guarantee but lower conversion.
- Booking fee on the client versus a split with the provider once providers see value.
- Whether to allow public price display for all packages or "from NPR X" with full detail after sign-in, as a leakage control.
- Which second city cluster has enough supply density to make the backup pool credible.
- Whether passport and studio portrait work belongs on the platform at all, or stays a walk-in business.

## 14. Urgent booking

Clients sometimes need a photographer tomorrow: a provider pulled out, a corporate event was confirmed late, a family function was moved. This is also where the backup pool earns its keep, so urgent booking and the backup pool share one dispatch engine.

### Client flow
1. Client picks a date inside 72 hours; the search switches to Urgent mode and shows only providers who are verified, opted in to urgent alerts, and free that day.
2. If the client finds someone directly, they book as normal and pay the booking fee plus the urgent surcharge.
3. If nobody suitable is visible, or the client prefers not to browse, they post an **Urgent request**: category, time window, venue pin, budget band, a few lines of context. They pre-authorise the deposit so an accepting provider is guaranteed a real booking.
4. The request is broadcast in waves (below). The client sees accepting providers in real time with their package nearest the budget band, portfolio and rating, and picks one. Deposit is captured, the booking confirms, SMS goes to both.
5. If the request expires with no acceptance, the operator is paged and may place the job from the family studio or the backup pool by hand. The pre-authorisation is released if nothing is found.

### Provider side
- Providers opt in to urgent alerts per city and category and set quiet hours. Opt-in requires verified KYC and a reliability score above the threshold, because an urgent client cannot absorb a no-show.
- Alerts carry the essentials in one SMS: date, time window, area, budget band, link. One tap to accept with a chosen package or a custom price inside the band.
- Accepting then cancelling an urgent job is the heaviest reliability penalty on the platform and removes urgent eligibility for a season.

### Notification waves by plan and profile
| Wave | Who is alerted | Delay |
| --- | --- | --- |
| 1 | Studio and Pro subscribers in the city and category, reliability score high, free on the date | Immediately, SMS and email, push later |
| 2 | Remaining verified Pro and Free providers in the city and category who opted in | After 15 minutes if fewer than 3 acceptances |
| 3 | Verified providers in neighbouring cities within the travel radius | After 45 minutes |
| Operator | Family studio and backup pool coordinator | At 60 minutes, or immediately if the event is within 24 hours |

Subscribers get first look; that is a concrete, sellable Pro benefit that does not touch pricing. Free providers are never excluded, only sequenced.

### Notification channels
- **SMS** is primary because it reaches every provider in Nepal. Sparrow SMS or Aakash SMS, with sender ID registered. Budget roughly NPR 1 to 2 per message; the urgent surcharge covers it.
- **Email** is secondary for providers who set one; it carries the full brief and portfolio-ready link.
- **In-app** feed and, in Phase 2, web push for installed PWAs.
- All booking state changes (hold placed, confirmed, reminder at 48 and 24 hours, delivery due, review request) use the same channel rules, with SMS always on for confirmations and day-of changes.

## 15. Provider KYC and fraud controls

KYC is a gate, not a form. The goal is that every provider a client can see has a real identity, a traceable payout account and a reviewed portfolio.

### Tiers
| Tier | Requirements | Unlocks |
| --- | --- | --- |
| Registered | Phone OTP, name, city | Draft profile only, nothing public |
| Verified | Citizenship or passport (front and back), selfie matched by operator, PAN certificate, bank account or wallet in the same name, portfolio review passed | Public listing, enquiries, standard bookings |
| Verified Studio | Verified plus company registration, VAT certificate if registered, authorised signatory letter | Multi-shooter capacity, team accounts, Studio plan |
| Urgent-eligible | Verified plus at least 3 completed bookings or operator waiver, reliability above threshold | Urgent broadcasts and backup pool |

### Process
1. Provider uploads documents in-app; files are encrypted at rest and visible only to operator and admin roles.
2. Operator checklist: ID legible and unexpired, selfie matches ID, PAN name matches ID, payout account name matches ID or company, portfolio is original (reverse-image spot check on 3 images, EXIF where available), no duplicate phone, ID or account across other provider profiles.
3. Decision within two working days. Rejections carry a reason and allow one resubmission; a second rejection locks the phone number for 90 days.
4. Re-verification yearly, or on any change of payout account, name or phone.

### Fraud and abuse controls
- One provider profile per citizenship number and per PAN, enforced at the database level.
- Payouts only to the verified account; changing it triggers re-verification and a 7-day payout hold.
- Deposit release only after client confirmation or dispute-window expiry, never on provider self-report alone.
- Client-side: phone OTP, deposit by traceable wallet or card, cancellation history; repeat no-pay or no-show clients lose urgent access.
- Rate limits on enquiries and urgent requests per client per day.
- Operator audit log on every KYC decision, payout and dispute outcome.
- Data retention: KYC documents kept for the legal minimum and deleted on account closure, consistent with the Privacy Act 2075.

### Phase placement
KYC document capture and operator review ship in Phase 1, since nothing goes public without it. Urgent requests, wave broadcasts and provider urgent opt-in ship in Phase 2 together with the backup pool, since they share the dispatch engine. SMS confirmations ship in Phase 1.
