ALTER TABLE "payroll_entry" ADD COLUMN "payment_method" varchar(50);--> statement-breakpoint
CREATE INDEX "idx_payroll_entry_payment_method" ON "payroll_entry" USING btree ("payment_method");