CREATE TYPE "public"."theme_pref" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TABLE "agreement_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "alias" text;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "crew_headline" text;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "crew_roles" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "day_rate" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme" "theme_pref" DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_acceptances_user_version_uq" ON "agreement_acceptances" USING btree ("user_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_alias_uq" ON "provider_profiles" USING btree ("alias") WHERE "provider_profiles"."alias" is not null;--> statement-breakpoint
-- Hand-written: existing freelancers get a unique "Crew A3-417" style alias before the CHECK below lands.
UPDATE "provider_profiles" p
SET "alias" = 'Crew ' || chr(65 + ((n.rn / 10000) % 26)::int) || ((n.rn / 1000) % 10)::text || '-' || lpad((n.rn % 1000)::text, 3, '0')
FROM (
	SELECT "id", row_number() OVER (ORDER BY "created_at", "id") - 1 AS rn
	FROM "provider_profiles"
	WHERE "kind" = 'freelancer' AND "alias" IS NULL
) n
WHERE p."id" = n."id";--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD CONSTRAINT "freelancer_has_alias" CHECK ("provider_profiles"."kind" <> 'freelancer' or "provider_profiles"."alias" is not null);--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD CONSTRAINT "day_rate_non_negative" CHECK ("provider_profiles"."day_rate" is null or "provider_profiles"."day_rate" >= 0);