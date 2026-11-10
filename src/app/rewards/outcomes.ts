/** Outcome codes the rewards page turns into inline copy. Only codes travel in the URL, never free text. */
export const REDEEM_OUTCOMES = ["ok", "not_found", "not_a_business", "insufficient_points", "points_frozen"] as const;
export type RedeemOutcome = (typeof REDEEM_OUTCOMES)[number];
