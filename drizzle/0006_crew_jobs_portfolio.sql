CREATE TYPE "public"."crew_job_status" AS ENUM('offered', 'accepted', 'declined', 'completed', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('photo', 'clip');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('pending', 'approved', 'held');--> statement-breakpoint
CREATE TABLE "crew_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"freelancer_id" uuid NOT NULL,
	"booking_id" uuid,
	"day" date NOT NULL,
	"role" text NOT NULL,
	"day_rate" bigint NOT NULL,
	"currency" text DEFAULT 'NPR' NOT NULL,
	"status" "crew_job_status" DEFAULT 'offered' NOT NULL,
	"accepted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_job_money" CHECK ("crew_jobs"."day_rate" >= 0 and "crew_jobs"."currency" = 'NPR'),
	CONSTRAINT "crew_job_two_parties" CHECK ("crew_jobs"."business_id" <> "crew_jobs"."freelancer_id")
);
--> statement-breakpoint
ALTER TABLE "portfolio_items" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "booking_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD COLUMN "media_kind" "media_kind" DEFAULT 'photo' NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD COLUMN "status" "media_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD COLUMN "bytes" bigint;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "crew_job_id" uuid;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "reply_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crew_jobs" ADD CONSTRAINT "crew_jobs_business_id_provider_profiles_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."provider_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_jobs" ADD CONSTRAINT "crew_jobs_freelancer_id_provider_profiles_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."provider_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_jobs" ADD CONSTRAINT "crew_jobs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crew_jobs_freelancer_day_live_uq" ON "crew_jobs" USING btree ("freelancer_id","day") WHERE "crew_jobs"."status" in ('offered', 'accepted');--> statement-breakpoint
CREATE INDEX "crew_jobs_business_day_idx" ON "crew_jobs" USING btree ("business_id","day");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_crew_job_id_crew_jobs_id_fk" FOREIGN KEY ("crew_job_id") REFERENCES "public"."crew_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_ledger" ADD CONSTRAINT "reward_ledger_crew_job_id_crew_jobs_id_fk" FOREIGN KEY ("crew_job_id") REFERENCES "public"."crew_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_has_media" CHECK ("portfolio_items"."url" is not null or "portfolio_items"."storage_key" is not null);--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "review_has_subject" CHECK (num_nonnulls("reviews"."booking_id", "reviews"."crew_job_id") = 1);