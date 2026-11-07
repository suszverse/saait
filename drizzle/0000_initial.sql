CREATE TYPE "public"."booking_status" AS ENUM('held', 'confirmed', 'in_progress', 'delivered', 'completed', 'cancelled', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."day_status" AS ENUM('open', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('open', 'decided');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('id_front', 'id_back', 'selfie', 'pan_certificate', 'company_registration', 'vat_certificate', 'signatory_letter', 'payout_proof');--> statement-breakpoint
CREATE TYPE "public"."hold_status" AS ENUM('active', 'converted', 'expired', 'released');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('registered', 'submitted', 'under_review', 'verified', 'rejected', 'reverification_due');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('sent', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('deposit_and_fee', 'refund');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('scheduled', 'held', 'paid');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'pro', 'studio');--> statement-breakpoint
CREATE TYPE "public"."provider_kind" AS ENUM('freelancer', 'studio');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('client', 'provider', 'operator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."urgency" AS ENUM('standard', 'urgent');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auspicious_dates" (
	"day" date PRIMARY KEY NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_days" (
	"provider_id" uuid NOT NULL,
	"day" date NOT NULL,
	"status" "day_status" DEFAULT 'open' NOT NULL,
	"capacity" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_days_provider_id_day_pk" PRIMARY KEY("provider_id","day")
);
--> statement-breakpoint
CREATE TABLE "backup_pool_members" (
	"provider_id" uuid NOT NULL,
	"city_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"standby_fee" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'NPR' NOT NULL,
	"response_sla_minutes" integer DEFAULT 60 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backup_pool_members_provider_id_city_id_category_id_pk" PRIMARY KEY("provider_id","city_id","category_id"),
	CONSTRAINT "standby_money" CHECK ("backup_pool_members"."standby_fee" >= 0 and "backup_pool_members"."currency" = 'NPR')
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"client_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"package_id" uuid,
	"offer_id" uuid,
	"hold_id" uuid,
	"day" date NOT NULL,
	"urgency" "urgency" DEFAULT 'standard' NOT NULL,
	"status" "booking_status" DEFAULT 'held' NOT NULL,
	"venue" text NOT NULL,
	"venue_lat" double precision,
	"venue_lng" double precision,
	"contact_phone" text NOT NULL,
	"package_name" text NOT NULL,
	"package_price" bigint NOT NULL,
	"peak_surcharge" bigint DEFAULT 0 NOT NULL,
	"addons_total" bigint DEFAULT 0 NOT NULL,
	"addons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"agreed_total" bigint NOT NULL,
	"deposit_amount" bigint NOT NULL,
	"booking_fee" bigint NOT NULL,
	"booking_fee_vat" bigint DEFAULT 0 NOT NULL,
	"urgent_surcharge" bigint DEFAULT 0 NOT NULL,
	"balance_due" bigint NOT NULL,
	"currency" text DEFAULT 'NPR' NOT NULL,
	"cancellation_policy" jsonb NOT NULL,
	"balance_paid_provider_confirmed_at" timestamp with time zone,
	"balance_paid_client_confirmed_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"gallery_url" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_code_unique" UNIQUE("code"),
	CONSTRAINT "booking_money_non_negative" CHECK ("bookings"."package_price" >= 0 and "bookings"."peak_surcharge" >= 0 and "bookings"."agreed_total" >= 0 and "bookings"."balance_due" >= 0 and "bookings"."deposit_amount" <= "bookings"."agreed_total" and "bookings"."addons_total" >= 0 and "bookings"."deposit_amount" >= 0 and "bookings"."booking_fee" >= 0 and "bookings"."booking_fee_vat" >= 0 and "bookings"."urgent_surcharge" >= 0 and "bookings"."currency" = 'NPR'),
	CONSTRAINT "booking_money_consistent" CHECK ("bookings"."agreed_total" = "bookings"."package_price" + "bookings"."peak_surcharge" + "bookings"."addons_total" and "bookings"."balance_due" = "bookings"."agreed_total" - "bookings"."deposit_amount")
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"name_np" text,
	"cluster" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "date_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"package_id" uuid,
	"offer_id" uuid,
	"client_id" uuid NOT NULL,
	"day" date NOT NULL,
	"status" "hold_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hold_has_source" CHECK (num_nonnulls("date_holds"."package_id", "date_holds"."offer_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"opened_by_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"decision" text,
	"refund_amount" bigint,
	"currency" text DEFAULT 'NPR' NOT NULL,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispute_money" CHECK (("disputes"."refund_amount" is null or "disputes"."refund_amount" >= 0) and "disputes"."currency" = 'NPR')
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"package_id" uuid,
	"day" date,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"checklist" jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enquiry_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"provider_id" uuid PRIMARY KEY NOT NULL,
	"sms" boolean DEFAULT true NOT NULL,
	"email" text,
	"quiet_from" smallint,
	"quiet_to" smallint,
	"city_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"category_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"urgent_alerts" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enquiry_id" uuid,
	"provider_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"day" date NOT NULL,
	"description" text NOT NULL,
	"price" bigint NOT NULL,
	"currency" text DEFAULT 'NPR' NOT NULL,
	"deposit_percent" smallint DEFAULT 25 NOT NULL,
	"status" "offer_status" DEFAULT 'sent' NOT NULL,
	"created_by_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_money" CHECK ("offers"."price" > 0 and "offers"."deposit_percent" between 10 and 50 and "offers"."currency" = 'NPR')
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" bigint NOT NULL,
	"currency" text DEFAULT 'NPR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "addon_price_positive" CHECK ("package_addons"."price" > 0 and "package_addons"."currency" = 'NPR')
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"summary" text NOT NULL,
	"price" bigint NOT NULL,
	"currency" text DEFAULT 'NPR' NOT NULL,
	"coverage_hours" smallint NOT NULL,
	"shooters" smallint DEFAULT 1 NOT NULL,
	"edited_photos" integer,
	"highlight_film_minutes" smallint,
	"raw_files" boolean DEFAULT false NOT NULL,
	"album" boolean DEFAULT false NOT NULL,
	"delivery_days" smallint NOT NULL,
	"inclusions" text[] DEFAULT '{}'::text[] NOT NULL,
	"exclusions" text,
	"deposit_percent" smallint DEFAULT 25 NOT NULL,
	"peak_surcharge" bigint DEFAULT 0 NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_positive" CHECK ("packages"."price" > 0 and "packages"."peak_surcharge" >= 0),
	CONSTRAINT "packages_currency" CHECK ("packages"."currency" = 'NPR'),
	CONSTRAINT "deposit_percent_range" CHECK ("packages"."deposit_percent" between 10 and 50)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"kind" "payment_kind" DEFAULT 'deposit_and_fee' NOT NULL,
	"gateway" text NOT NULL,
	"method" text NOT NULL,
	"gateway_ref" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'NPR' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"raw" jsonb,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0 and "payments"."currency" = 'NPR')
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"gross_deposit" bigint NOT NULL,
	"withheld" bigint NOT NULL,
	"net_amount" bigint NOT NULL,
	"currency" text DEFAULT 'NPR' NOT NULL,
	"status" "payout_status" DEFAULT 'scheduled' NOT NULL,
	"paid_at" timestamp with time zone,
	"approved_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "payout_consistent" CHECK ("payouts"."gross_deposit" >= 0 and "payouts"."withheld" >= 0 and "payouts"."withheld" <= "payouts"."gross_deposit" and "payouts"."net_amount" = "payouts"."gross_deposit" - "payouts"."withheld" and "payouts"."currency" = 'NPR')
);
--> statement-breakpoint
CREATE TABLE "portfolio_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"caption" text,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_categories" (
	"provider_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "provider_categories_provider_id_category_id_pk" PRIMARY KEY("provider_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "provider_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"business_name" text,
	"kind" "provider_kind" DEFAULT 'freelancer' NOT NULL,
	"home_city_id" uuid,
	"service_radius_km" integer DEFAULT 25 NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"bio" text,
	"since_year" smallint,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"daily_capacity" smallint DEFAULT 1 NOT NULL,
	"kyc_status" "kyc_status" DEFAULT 'registered' NOT NULL,
	"kyc_rejections" smallint DEFAULT 0 NOT NULL,
	"verified_at" timestamp with time zone,
	"reverify_by" date,
	"citizenship_number" text,
	"citizenship_key" text GENERATED ALWAYS AS (nullif(regexp_replace(translate(citizenship_number, '०१२३४५६७८९', '0123456789'), '[^0-9]', '', 'g'), '')) STORED,
	"passport_number" text,
	"passport_key" text GENERATED ALWAYS AS (nullif(upper(regexp_replace(passport_number, '[^0-9A-Za-z]', '', 'g')), '')) STORED,
	"pan_number" text,
	"vat_registered" boolean DEFAULT false NOT NULL,
	"payout_method" text,
	"payout_account_name" text,
	"payout_account_number" text,
	"payout_hold_until" date,
	"gear_summary" text,
	"travel_fee_zones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rating_avg" double precision,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"completed_bookings" integer DEFAULT 0 NOT NULL,
	"response_minutes" integer,
	"reliability_score" smallint DEFAULT 100 NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"portfolio_tones" text[] DEFAULT '{}'::text[] NOT NULL,
	"photo_count" integer DEFAULT 0 NOT NULL,
	"urgent_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "provider_profiles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "citizenship_has_digits" CHECK ("provider_profiles"."citizenship_number" is null or "provider_profiles"."citizenship_key" is not null),
	CONSTRAINT "passport_has_characters" CHECK ("provider_profiles"."passport_number" is null or "provider_profiles"."passport_key" is not null),
	CONSTRAINT "pan_nine_digits" CHECK ("provider_profiles"."pan_number" is null or "provider_profiles"."pan_number" ~ '^[0-9]{9}$'),
	CONSTRAINT "capacity_positive" CHECK ("provider_profiles"."daily_capacity" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"body" text,
	"photos" text[] DEFAULT '{}'::text[] NOT NULL,
	"reply" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_range" CHECK ("reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sms_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to" text NOT NULL,
	"body" text NOT NULL,
	"provider" text NOT NULL,
	"purpose" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"plan" "plan" NOT NULL,
	"price" bigint NOT NULL,
	"currency" text DEFAULT 'NPR' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_money" CHECK ("subscriptions"."price" >= 0 and "subscriptions"."currency" = 'NPR' and "subscriptions"."period_end" > "subscriptions"."period_start")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"role" "role" DEFAULT 'client' NOT NULL,
	"phone_locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withholding_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid NOT NULL,
	"provider_pan" text NOT NULL,
	"rate_bp" integer NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'NPR' NOT NULL,
	"tds_certificate_ref" text,
	"filed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "withholding_records_payout_id_unique" UNIQUE("payout_id"),
	CONSTRAINT "withholding_money" CHECK ("withholding_records"."amount" >= 0 and "withholding_records"."rate_bp" between 0 and 10000 and "withholding_records"."currency" = 'NPR')
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_days" ADD CONSTRAINT "availability_days_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_pool_members" ADD CONSTRAINT "backup_pool_members_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_pool_members" ADD CONSTRAINT "backup_pool_members_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_pool_members" ADD CONSTRAINT "backup_pool_members_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_hold_id_date_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."date_holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_holds" ADD CONSTRAINT "date_holds_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_holds" ADD CONSTRAINT "date_holds_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_holds" ADD CONSTRAINT "date_holds_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_holds" ADD CONSTRAINT "date_holds_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_id_users_id_fk" FOREIGN KEY ("opened_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_reviews" ADD CONSTRAINT "kyc_reviews_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_reviews" ADD CONSTRAINT "kyc_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_addons" ADD CONSTRAINT "package_addons_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_categories" ADD CONSTRAINT "provider_categories_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_categories" ADD CONSTRAINT "provider_categories_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_documents" ADD CONSTRAINT "provider_documents_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_home_city_id_cities_id_fk" FOREIGN KEY ("home_city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_subject_id_users_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withholding_records" ADD CONSTRAINT "withholding_records_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_subject_idx" ON "audit_log" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "bookings_provider_day_idx" ON "bookings" USING btree ("provider_id","day","status");--> statement-breakpoint
CREATE INDEX "bookings_client_idx" ON "bookings" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "date_holds_day_idx" ON "date_holds" USING btree ("provider_id","day","status");--> statement-breakpoint
CREATE INDEX "otp_codes_phone_idx" ON "otp_codes" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "packages_provider_idx" ON "packages" USING btree ("provider_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gateway_ref_uq" ON "payments" USING btree ("gateway","gateway_ref");--> statement-breakpoint
CREATE INDEX "provider_documents_provider_idx" ON "provider_documents" USING btree ("provider_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_citizenship_uq" ON "provider_profiles" USING btree ("citizenship_key");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_passport_uq" ON "provider_profiles" USING btree ("passport_key");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_pan_uq" ON "provider_profiles" USING btree ("pan_number") WHERE "provider_profiles"."pan_number" is not null;--> statement-breakpoint
CREATE INDEX "provider_kyc_idx" ON "provider_profiles" USING btree ("kyc_status");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_one_per_side_uq" ON "reviews" USING btree ("booking_id","author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone");