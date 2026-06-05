ALTER TABLE "payroll_staff_rate" DROP CONSTRAINT "payroll_staff_rate_rate_level_id_rate_levels_id_fk";
--> statement-breakpoint
ALTER TABLE "payroll_staff_rate" ADD CONSTRAINT "payroll_staff_rate_rate_level_id_rate_levels_id_fk" FOREIGN KEY ("rate_level_id") REFERENCES "public"."rate_levels"("id") ON DELETE set null ON UPDATE no action;