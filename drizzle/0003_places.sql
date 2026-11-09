CREATE TYPE "public"."place_kind" AS ENUM('district', 'municipality', 'ward', 'chowk', 'venue');--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"name_np" text,
	"kind" "place_kind" NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"district" text NOT NULL,
	"city_id" uuid,
	"source" text DEFAULT 'seed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_slug_unique" UNIQUE("slug"),
	CONSTRAINT "places_in_nepal" CHECK ("places"."lat" between 26.3 and 30.5 and "places"."lng" between 80.0 and 88.3)
);
--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "places_name_lower_idx" ON "places" USING btree (lower("name"));