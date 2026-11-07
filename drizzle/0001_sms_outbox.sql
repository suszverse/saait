CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sending', 'sent');--> statement-breakpoint
CREATE TABLE "sms_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"purpose" text NOT NULL,
	"to" text NOT NULL,
	"body" text NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sms_outbox" ADD CONSTRAINT "sms_outbox_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sms_outbox_once_uq" ON "sms_outbox" USING btree ("booking_id","purpose","to");--> statement-breakpoint
CREATE INDEX "sms_outbox_pending_idx" ON "sms_outbox" USING btree ("status","created_at");