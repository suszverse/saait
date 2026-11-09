CREATE TYPE "public"."reward_kind" AS ENUM('credit', 'points');--> statement-breakpoint
CREATE TYPE "public"."reward_reason" AS ENUM('booking_completed', 'on_time', 'review_left', 'five_star', 'referral', 'report_confirmed', 'urgent_completed', 'crew_job_completed', 'no_show', 'checkout_spend', 'plan_month', 'expiry', 'reset');--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_id" uuid NOT NULL,
	"referee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_referee_id_unique" UNIQUE("referee_id"),
	CONSTRAINT "referral_two_people" CHECK ("referrals"."referrer_id" <> "referrals"."referee_id")
);
--> statement-breakpoint
CREATE TABLE "reward_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "reward_kind" NOT NULL,
	"amount" bigint NOT NULL,
	"reason" "reward_reason" NOT NULL,
	"booking_id" uuid,
	"review_id" uuid,
	"crew_job_id" uuid,
	"report_id" uuid,
	"referral_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_amount_nonzero" CHECK ("reward_ledger"."amount" <> 0)
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "credit_applied" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_users_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_ledger" ADD CONSTRAINT "reward_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_ledger" ADD CONSTRAINT "reward_ledger_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_ledger" ADD CONSTRAINT "reward_ledger_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_ledger" ADD CONSTRAINT "reward_ledger_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_ledger" ADD CONSTRAINT "reward_ledger_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reward_ledger_user_idx" ON "reward_ledger" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_ledger_once_uq" ON "reward_ledger" USING btree ("user_id","kind","reason",coalesce("booking_id", '00000000-0000-0000-0000-000000000000'::uuid),coalesce("review_id", '00000000-0000-0000-0000-000000000000'::uuid),coalesce("crew_job_id", '00000000-0000-0000-0000-000000000000'::uuid),coalesce("report_id", '00000000-0000-0000-0000-000000000000'::uuid),coalesce("referral_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "reward_ledger"."reason" not in ('checkout_spend', 'expiry', 'plan_month');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "booking_credit_within_fee" CHECK ("bookings"."credit_applied" >= 0 and "bookings"."credit_applied" <= "bookings"."booking_fee");--> statement-breakpoint
CREATE FUNCTION reward_ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'reward_ledger is append-only: % not allowed, write a correcting row instead', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER reward_ledger_append_only BEFORE UPDATE OR DELETE ON "reward_ledger"
  FOR EACH ROW EXECUTE FUNCTION reward_ledger_append_only();
