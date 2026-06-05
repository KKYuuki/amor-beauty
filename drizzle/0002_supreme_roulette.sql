ALTER TABLE "qr_sessions" ADD COLUMN "is_single_use" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "qr_sessions" ADD COLUMN "times_used" integer DEFAULT 0 NOT NULL;