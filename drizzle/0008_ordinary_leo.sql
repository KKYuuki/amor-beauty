ALTER TABLE "services" ALTER COLUMN "service_type" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "service_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "service_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_request" ADD COLUMN "total_net_amount" numeric(12, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "payroll_request" ADD COLUMN "total_tax_amount" numeric(12, 2) DEFAULT '0';