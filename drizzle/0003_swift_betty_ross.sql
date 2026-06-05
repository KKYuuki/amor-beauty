CREATE TABLE "payroll_disbursement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"request_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"reference_number" varchar(255),
	"proof_url" varchar(512),
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"completed_at" timestamp,
	"completed_by" text,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "general_ledger" ADD COLUMN "payment_method" varchar(50);--> statement-breakpoint
ALTER TABLE "payroll_deductions" ADD COLUMN "scheduled_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "payroll_deductions" ADD COLUMN "disbursement_type" varchar(50) DEFAULT 'FULL';--> statement-breakpoint
ALTER TABLE "payroll_deductions" ADD COLUMN "recurrence_rule" jsonb;--> statement-breakpoint
ALTER TABLE "payroll_request" ADD COLUMN "reference_number" varchar(255);--> statement-breakpoint
ALTER TABLE "payroll_request" ADD COLUMN "proof_url" varchar(512);--> statement-breakpoint
ALTER TABLE "payroll_disbursement" ADD CONSTRAINT "payroll_disbursement_request_id_payroll_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."payroll_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_disbursement" ADD CONSTRAINT "payroll_disbursement_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_disbursement_request_id" ON "payroll_disbursement" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_disbursement_status" ON "payroll_disbursement" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_gl_payment_method" ON "general_ledger" USING btree ("payment_method");