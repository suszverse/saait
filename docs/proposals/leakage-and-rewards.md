# Proposal: keeping bookings on Saait (two tiers, rewards, leakage signals)

Status: proposal, not approved. Nothing here is built. Written 2026-11-09 from the founder's idea of anonymous freelancers, business subscriptions and a reward system.

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

- **Hide contact details until the deposit is paid.** Chat masks phone numbers, emails and social handles until a booking is locked. It is easy to get around, but it stops the lazy first swap, which is where the 18% comes from.
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

## Decisions needed from the founder

1. Can clients ever reach a freelancer directly, for example only through the urgent flow or as a backup, or is the freelancer side business-only?
2. Does crew money go through Saait? If it does, withholding applies to it, and that brings back the provider-side leak.
3. Do Free and Pro become "Freelancer" and "Business", replacing the current three plans?
4. What share of fee revenue may rewards cost? 20% is a starting suggestion.

## Must be checked by others before launch

- **Lawyer:** whether non-cash platform credits count as stored value or e-money under Nepal Rastra Bank rules; whether anonymous freelancer profiles meet the E-Commerce Act listing and disclosure duties.
- **Accountant:** VAT on discounted fees and on fees paid with credits; whether withholding can be reduced for providers with tax clearance.
