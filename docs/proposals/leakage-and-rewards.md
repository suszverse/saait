# Proposal: keeping bookings on Saait (two tiers, rewards, leakage signals)

Status: proposal. Founder asked on 2026-11-09 for rewards on both sides and a chat that blocks contact details and payment QR codes; screens are redesigned in Figma (page "Redesign v2 · web"). Nothing here is built in code yet.

## The starting assumption

People will swap numbers. A blocker only stops the first contact; after one job together, the phone number is known and the next job can happen on WhatsApp or Messenger. The validation report puts leakage on service marketplaces at up to about 90% of matched jobs, and wedding work is the worst case because it is high-trust, high-value and full of conversation. Blocking one channel cut leakage by about 18% in the only controlled study, which is useful but nowhere near enough.

So the goal is not "make leaving impossible". It is: **make leaving save nothing and cost something.** Every rule below serves one of those two halves.

## Who has a reason to leave today

| Who | What they save by going direct | How big |
|---|---|---|
| Client | The booking fee (4%, Rs 500 to 3,000) | Rs 1,600 on a Rs 40,000 package |
| Provider | The 15% withholding on the released deposit (non-VAT providers), and the 7-day wait for payout | Rs 2,738 held on an Rs 18,250 deposit. It is a tax credit, not a loss, but most freelancers feel it as a loss |
| Business hiring a freelancer (new tier) | Any per-hire fee we charge | Whatever we set |

The provider row is the dangerous one. The provider is the person who suggests "just pay me on eSewa", and today the platform gives them a reason to.

## The answer in one sentence

Charge the people who stay for being visible, not for each job, and pay them back in things that only exist on the platform.

## 1. Remove the money that leaking saves

- **Businesses pay a subscription, not per hire.** The Studio plan includes unlimited crew hires through the platform with no per-hire fee. A subscription is paid whether or not a job leaks, so leaking saves the business nothing. This is the strongest single control, and it is the founder's own model.
- **Freelancers stay free and anonymous.** They pay nothing, so they have no fee to avoid.
- **Repeat clients pay a smaller booking fee.** The fee drops for a second booking with the same provider (for example, the engagement shoot after the wedding) and for every member of the same family booking. Fewer rupees saved by going direct means fewer reasons to.
- **Withholding needs an accountant's answer.** Ask whether a provider who supplies a VAT invoice or tax clearance can be withheld at 1.5% instead of 15%, and whether we can show the TDS certificate as "money you get back at tax time" in the app. This is a framing and compliance question, not a design one, and it is the biggest provider-side leak.

## 2. Make staying worth more than leaving (the reward system)

This section sets the principle. Exact amounts and levels are in section 7, which wins where the two differ.

Rewards are credits, not cash. They can only be spent on Saait fees and plans, cannot be withdrawn, and cannot be transferred. Holding cash-like balances for users risks being treated as e-money by Nepal Rastra Bank, which would need a licence. Credits that only reduce our own fees avoid that. Confirm with the lawyer before launch.

### Freelancers (anonymous crew)

| They do | They get |
|---|---|
| Complete a job booked through Saait, rated by the business | Points, plus a step up in reliability score |
| Keep a high reliability score | Earlier urgent alerts, and a place in the paid backup pool |
| Reach a points level | Higher placement in "find crew" search, a "Saait-verified crew" badge, then an option to open a public business profile at a discount |

The last row is the ladder: an anonymous freelancer who proves reliable on the platform earns their way to a public profile. That gives freelancers a reason to build their record here instead of in someone else's phone book.

### Businesses (public, subscribed)

| They do | They get |
|---|---|
| Complete client bookings through Saait | Points that pay for months of the plan or featured peak-date slots |
| Hire crew through Saait | Access to the backup guarantee: if the freelancer no-shows, the operator replaces them from the pool |
| Keep the on-platform completion rate high | Higher placement on wedding dates, and the "Guaranteed by Saait" badge on their profile |

### Clients

Clients book rarely, so long-term points mean little to them. Their reward must be immediate and protective:

- The deposit is refunded or a replacement turns up if the provider fails. This only applies to bookings made through Saait, and the booking page says so plainly.
- A credit off the next booking fee after a completed, reviewed booking. Weddings come in clusters (engagement, mehendi, reception, then pasni or bratabandha years later), so the next booking is real.
- A referral credit when a friend completes a booking.

### Budget

Rewards are paid from booking-fee revenue. Cap the total at a fixed share of the month's fees, for example 20%, and review it monthly. Points are integers in a ledger like money, never a balance overwritten in place.

## 3. Make leaving cost something (soft enforcement)

Hard bans for leaking are hard to prove and push people away. Use quiet consequences that cost the leaker rewards and ranking.

- **Block contact details and payment QR codes in chat.** Section 6 has the full rules. It is never airtight, but it stops the easy swap, and every attempt is recorded.
- **Watch for signals.** Each one raises a flag for the operator, never an automatic penalty:
  - a provider blocks a date in their calendar shortly after an enquiry for that date that never booked;
  - a business repeatedly views or shortlists a freelancer and then hires no one;
  - a review mentions an event that has no booking.
- **Consequences are rewards and ranking, not bans.** A confirmed leak resets reward level and drops placement for a season. Repeated leaks remove the business from the urgent broadcast and the backup pool.
- **Let clients report.** "Asked to pay outside Saait? Tell us and get a credit." Clients are protected only on platform, so this protects them too.

## 4. What changes in the product

| Change | Where it lands | Phase |
|---|---|---|
| Account type: freelancer (anonymous) or business (public) | Sign-up, `provider_profiles`, KYC | Next |
| Client search shows businesses only | `src/server/search.ts` | Next |
| Freelancer alias profile: no name, phone or handles; portfolio checked for watermarks | Provider onboarding, operator desk | Next |
| "Find crew" flow for businesses, with hire, rate and backup | New | Next |
| Plans: Free freelancer, paid Business, with per-hire fee removed | `subscriptions`, fees | Next |
| Points ledger, earn and spend rules, monthly cap | New `reward_ledger` table, `src/server/rewards.ts` | After chat |
| Contact masking in chat, seven-layer checker (section 6) | Chat (already Phase 2) | With chat |
| Venue as a point: geolocation, `places` search, nearby chips, distance on results (section 9) | `src/server/search.ts`, home and results pages | Next |
| Leakage signals on the operator desk | Admin | After chat |
| Repeat-client and family fee discount | `src/lib/fees.ts` | Next |

Booking, deposit, verification and SMS stay as built.

## 5. How we know it works

The plan already tracks enquiries that book elsewhere (target under 50%). Add:

- repeat hires of the same freelancer by the same business that stay on Saait;
- calendar blocks within 72 hours of an unbooked enquiry for that date;
- reward cost as a share of fee revenue.

Run the concierge test from the validation report first: on half the early jobs take the deposit through Saait, on the other half just introduce the parties, and count how many of the second half come back.

## 6. Secure chat

Chat exists so clients can ask questions and businesses can brief crew without leaving Saait. Every message is checked on the server **before it is delivered**. A message that breaks a rule is never shown to the other person.

### What is blocked

| Kind | Examples the checker catches |
|---|---|
| Phone numbers | 98XXXXXXXX, +977 98..., numbers split by spaces, dots or dashes, Devanagari digits (९८...), numbers written out in English or romanised Nepali ("nine eight", "nau aath") |
| Payment details | Any image containing a QR code or barcode, eSewa or Khalti IDs (they are phone numbers), bank account numbers, "send to my esewa" |
| Other channels | Email addresses, links, @handles, and the words WhatsApp, Viber, IMO, Telegram, Signal, Instagram, Facebook, TikTok, "wa.me", "DM me" |
| Images before a booking | No image uploads in chat until a deposit is paid. Portfolio images live on the profile. After the booking, images are allowed but scanned for QR codes and for numbers in the picture |

### The checker's stack

"Monitored" has to mean more than a regular expression. The check runs in layers, cheapest first, and every message goes through all of them before delivery.

| Layer | What it does | Catches |
|---|---|---|
| 1. Normalise | Unicode NFKC, Devanagari and other digit scripts to ASCII, homoglyphs (o for 0, l for 1), zero-width characters and separators stripped, number words in English, Nepali and romanised Nepali ("nau aath", "नौ आठ") converted to digits, leetspeak undone | "९८ ४१ ..." , "nine-eight-four...", "9 8 4 1" |
| 2. Rules | Patterns for Nepal mobiles (97 or 98 plus eight digits), landlines, +977, emails, URLs including shorteners, @handles, app names, eSewa and Khalti IDs, bank account shapes | The direct swaps, in under a millisecond |
| 3. Thread context | Layers 1 and 2 run over the last five messages joined, not one message at a time | A number sent two or three digits per message |
| 4. Intent classifier | A multilingual model fine-tuned on our own labelled messages (an LLM call with a strict JSON schema until there is enough data) scores each message for intent to move the deal off Saait | "my number is in my bio", "call me the usual way", "let's talk on the other app", romanised Nepali variants |
| 5. Images | QR and barcode decoding (ZXing), OCR for digits and handles (Tesseract, or a cloud vision API), a vision model asked "is this a payment screen or a contact card", and a perceptual hash of every blocked image so a crop or re-screenshot of it is caught | eSewa and Khalti QR codes, bank screenshots, a business card photo, a handwritten number |
| 6. Voice notes | Transcribed (Whisper or a cloud equivalent) and run through layers 1 to 4; voice notes are off until a deposit is paid | A number spoken aloud |
| 7. Behaviour | Three blocked attempts in a day, edit-and-resend after a block, an enquiry followed by a calendar block for that date, a thread that goes quiet right after an unblocked message asking for "the number" | The people who worked around the filter |

Decisions by score: a rule hit or a high classifier score blocks; a middle score delivers the message but puts it on the operator's queue; a low score delivers. The text layers answer in under 300 ms so chat feels instant; images and voice show a short "checking" state and are delivered or blocked when the scan returns.

Every appeal outcome and every operator decision becomes a labelled example, and the classifier is retrained monthly on them. The target is under 2% of blocked messages overturned on appeal; above that, the thresholds move.

Privacy: the terms say messages are screened by software before delivery; messages are encrypted at rest; operators read only what the checker flags; chat is kept for 12 months after the event and then deleted. No operator reads a thread that was never flagged.

### What the sender sees

The message stays in their own thread, greyed, marked **"Not sent"**, with one plain reason: "Phone numbers and payment QR codes can't be shared on Saait. Your deposit is protected only when you pay here." Next to it is **"This isn't contact info"**, which sends the message to the operator for a second look. That protects real messages such as "500 photos, 10 hours, Falgun 12".

### Strikes

| Within 30 days | What happens |
|---|---|
| 1st blocked message | The "Not sent" notice only |
| 2nd | Notice plus a flag on the operator's moderation queue |
| 3rd | Chat paused for 24 hours, reward points frozen, operator reviews the account |
| Confirmed deliberate leak | Reward level reset and lower placement for a season; repeated leaks remove the account from urgent jobs and the backup pool |

A message the operator clears as a false positive removes the strike and is delivered.

### Contact after the booking

People do need to call each other on the wedding day. So:

- Phone numbers are revealed **48 hours before the event**, inside the booking page, for that booking only. The reveal is logged.
- The **balance** is still paid directly, as the plan says, but never by a QR code sent in chat. The booking page shows the provider's verified payout QR, taken from the account checked during KYC. A QR sent in chat stays blocked at every stage, so a scammer cannot send a fake one.
- Clients mark the balance paid in the app, and that completes the booking and releases rewards on both sides.

### Honest limits

No filter catches everything. Someone can write "my number is in my Facebook bio". The checker is there to stop the easy swaps and to leave a record. Rewards and ranking are what make staying worth it. Messages are stored and checked by software; operators read only flagged messages. The terms of use must say so.

## 7. Rewards for both sides

Two currencies, both non-cash and both stored as integers in an append-only ledger:

- **Clients earn Saait credit**, in rupees, spent only on booking fees. It expires after 12 months.
- **Businesses and freelancers earn points**, which raise their level and can be spent on plan months and featured slots.

### Clients

| They do | They get |
|---|---|
| Complete a booking and confirm the balance was paid | Credit worth 25% of the booking fee they paid (Rs 400 on a Rs 1,600 fee) |
| Leave a review | Rs 100 credit |
| A friend they invited completes a booking | Rs 300 for each of them |
| Report a provider who asked to be paid outside Saait, and the operator confirms it | Rs 200 credit |

Credit is applied automatically at checkout, and the checkout shows it as its own line.

### Businesses and freelancers

| They do | Points |
|---|---|
| Complete a booking or crew job through Saait | +100 |
| Deliver on time | +30 |
| Get a 5-star review | +20 |
| Accept and complete an urgent job | +50 |
| 90 days with no chat strikes | +50 |
| No-show | −200 |
| Confirmed off-platform deal | Level reset to New |

| Level | Points | What it unlocks |
|---|---|---|
| New | 0 | Listed, chat, bookings |
| Trusted | 300 | "Trusted" badge, first look at urgent jobs in their tier |
| Proven | 1,000 | Higher placement on wedding dates, backup pool (freelancers), 10% off the plan (businesses) |
| Top | 2,500 | Featured slot each month, freelancers can open a public business profile at half price |

Points can be spent: 1,500 points buy one month of the Business plan, and 3,000 buy a featured wedding-date slot. Spending points does not lower the level, which counts lifetime points minus penalties.

### Budget

Client credit is capped at 25% of booking-fee revenue for the month. Points cost the plan revenue they replace. Review both monthly.

## 8. Screens (redesigned in Figma)

Figma page "Redesign v2 · web", desktop at 1440 wide. The phone versions follow when the app is built.

| Who | Screens |
|---|---|
| Everyone | Join: choose business or freelancer; Agree to how Saait works (the seven rules, J2); Terms, privacy and chat rules page (J3) |
| Client | Home, Results (businesses only), Business profile, Chat with a blocked message, Lock the date with credit applied, Booking after lock (verified balance QR, contact reveal), Rewards and credit |
| Business | Today (level, inbox, bookings), Find crew (anonymous freelancers), Rewards and plan |
| Freelancer | Today (alias, job offers, level ladder), Chat with a business where a payment QR is blocked |
| Operator | Moderation queue for flagged messages, Leakage signals |

## 9. Location: near you, not a city list

The site today offers four cities in a dropdown. Nepal has 753 local units and most weddings happen at a party palace or a home, not in a city centre, so a list never fits. The venue is a point, not a city.

**Where the point comes from, in order:**

1. The phone or browser location, asked for once with the reason shown ("to find businesses who can reach your venue"). Used for the query and never stored.
2. A typed place: a `places` table of districts, municipalities, wards, well-known chowks and party palaces, with name and Nepali name, searched as the client types. OpenStreetMap Nominatim is the fallback for anything not in the table, and every Nominatim hit is added to the table for next time.
3. If both are refused, a weak default from the IP address, labelled "Butwal area" so the client knows to correct it.

**What the client sees.** The home screen says "Shooting near Traffic Chowk, Butwal" with a pin, and under it four or five chips: "Near me" plus the nearest places with their distance ("Bhairahawa · 22 km"). Results list the businesses whose service radius reaches the point, each with its distance ("3 km away"). The order stays open slots, then rating, with distance as the tiebreaker, and never price. The reach chip on results reads "Near Traffic Chowk · within 30 km" and opens to widen or narrow it.

**When nobody reaches the point.** Show the three nearest businesses with their distance and travel charge, and offer the urgent broadcast widened to the next cluster rather than an empty page.

**Code.** `searchFreeOnDate` takes `{ lat, lng, radiusKm }` instead of a city slug; the haversine and service-radius filter already exist. A `places` table replaces `cities` as the thing clients pick; `cities` stays as the provider's home cluster and the seed grouping. The booking already stores the venue pin at lock time; nothing else about position is kept. Provider onboarding already asks for a pin and a service radius.

## 10. Terms and the sign-up agreement

The founder's decision on 2026-11-09: every rule above is written into the terms, the privacy policy and the chat rules, and accepted at sign-up. `docs/legal/terms-draft.md` holds the plain-language draft for the lawyer. Sign-up shows the seven rules in full (J2) with one checkbox; the terms page (J3) uses the same sentences. Changes are announced in the app 30 days ahead. The lawyer's open questions are at the end of the draft.

## Decisions needed from the founder

1. Can clients ever reach a freelancer directly, for example only through the urgent flow or as a backup, or is the freelancer side business-only?
2. Does crew money go through Saait? If it does, withholding applies to it, and that brings back the provider-side leak. The screens assume it does not: businesses pay crew directly, and Saait records the job.
3. Do Free and Pro become "Freelancer" and "Business", replacing the current three plans?
4. What share of fee revenue may rewards cost? 20% is a starting suggestion.

## Must be checked by others before launch

- **Lawyer:** whether non-cash platform credits count as stored value or e-money under Nepal Rastra Bank rules; whether anonymous freelancer profiles meet the E-Commerce Act listing and disclosure duties.
- **Accountant:** VAT on discounted fees and on fees paid with credits; whether withholding can be reduced for providers with tax clearance.
