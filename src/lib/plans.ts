/**
 * Business plans. A freelancer is anonymous crew and pays nothing; a studio
 * needs Business or Studio to be listed. Prices are NPR paisa per month and
 * are what the subscriptions table snapshots. Points buy a Business month or
 * one featured date. Pure; no I/O.
 */

export type Plan = "free" | "pro" | "studio";

export const PLANS = {
  free: { label: "Freelancer", monthlyPaisa: 0 },
  pro: { label: "Business", monthlyPaisa: 150000 },
  studio: { label: "Studio", monthlyPaisa: 400000, featuredDatesPerMonth: 1 },
} as const satisfies Record<Plan, { label: string; monthlyPaisa: number; featuredDatesPerMonth?: number }>;

/** Points spent for one month of Business, posted as a `plan_month` ledger row. */
export const PLAN_MONTH_POINTS = 1500;
/** Points spent to feature one date. */
export const FEATURED_DATE_POINTS = 3000;

export function planLabel(plan: Plan): string {
  return PLANS[plan].label;
}
