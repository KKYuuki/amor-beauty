ALTER TABLE "payroll_entry" ADD COLUMN "service_type" varchar(50);--> statement-breakpoint
CREATE INDEX "idx_payroll_entry_service_type" ON "payroll_entry" USING btree ("service_type");