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
| Contact masking in chat | Chat (already Phase 2) | With chat |
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
| Everyone | Join: choose business or freelancer |
| Client | Home, Results (businesses only), Business profile, Chat with a blocked message, Lock the date with credit applied, Booking after lock (verified balance QR, contact reveal), Rewards and credit |
| Business | Today (level, inbox, bookings), Find crew (anonymous freelancers), Rewards and plan |
| Freelancer | Today (alias, job offers, level ladder), Chat with a business where a payment QR is blocked |
| Operator | Moderation queue for flagged messages, Leakage signals |

## Decisions needed from the founder

1. Can clients ever reach a freelancer directly, for example only through the urgent flow or as a backup, or is the freelancer side business-only?
2. Does crew money go through Saait? If it does, withholding applies to it, and that brings back the provider-side leak. The screens assume it does not: businesses pay crew directly, and Saait records the job.
3. Do Free and Pro become "Freelancer" and "Business", replacing the current three plans?
4. What share of fee revenue may rewards cost? 20% is a starting suggestion.

## Must be checked by others before launch

- **Lawyer:** whether non-cash platform credits count as stored value or e-money under Nepal Rastra Bank rules; whether anonymous freelancer profiles meet the E-Commerce Act listing and disclosure duties.
- **Accountant:** VAT on discounted fees and on fees paid with credits; whether withholding can be reduced for providers with tax clearance.
