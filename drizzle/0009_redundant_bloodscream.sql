CREATE TABLE "downpayments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"downpayment_type" varchar(20) NOT NULL,
	"percentage_rate" numeric(5, 2),
	"estimated_total" numeric(10, 2),
	"is_settled" boolean DEFAULT false NOT NULL,
	"staff_id" text,
	"assigned_at" timestamp with time zone,
	"payroll_split_mode" varchar(20) DEFAULT 'PER_PAYMENT' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "rate_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by" text,
	CONSTRAINT "rate_levels_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "payroll_entry" RENAME COLUMN "artist_cut" TO "staff_cut";--> statement-breakpoint
ALTER TABLE "payroll_entry" RENAME COLUMN "artist_rate_snapshot" TO "staff_rate_snapshot";--> statement-breakpoint
ALTER TABLE "payroll_request" RENAME COLUMN "total_artist_cut" TO "total_staff_cut";--> statement-breakpoint
ALTER TABLE "payroll_staff_rate" RENAME COLUMN "artist_level" TO "rate_level_id";--> statement-breakpoint
ALTER TABLE "payroll_staff_rate" RENAME COLUMN "artist_percentage" TO "staff_percentage";--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "artist_level" TO "rate_level_id";--> statement-breakpoint
DROP INDEX "idx_payroll_rate_artist_level";--> statement-breakpoint
DROP INDEX "idx_payroll_rate_unique";--> statement-breakpoint
DROP INDEX "idx_user_artist_level";--> statement-breakpoint
ALTER TABLE "downpayments" ADD CONSTRAINT "downpayments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downpayments" ADD CONSTRAINT "downpayments_staff_id_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downpayments" ADD CONSTRAINT "downpayments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_staff_rate" ADD CONSTRAINT "payroll_staff_rate_rate_level_id_rate_levels_id_fk" FOREIGN KEY ("rate_level_id") REFERENCES "public"."rate_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_rate_level_id_rate_levels_id_fk" FOREIGN KEY ("rate_level_id") REFERENCES "public"."rate_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_payroll_rate_rate_level" ON "payroll_staff_rate" USING btree ("rate_level_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_payroll_rate_level_service_client" ON "payroll_staff_rate" USING btree ("service_type","client_type","rate_level_id");--> statement-breakpoint
CREATE INDEX "idx_user_rate_level" ON "user" USING btree ("rate_level_id");