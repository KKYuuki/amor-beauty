ALTER TABLE "push_subscriptions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "push_subscriptions" CASCADE;--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT IF EXISTS "ratings_appointment_id_appointments_id_fk";
--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_appointment_id_appointments_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_reservations" DROP CONSTRAINT IF EXISTS "stock_reservations_appointment_id_appointments_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_stock_reservations_appointment_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_transactions_appointment_id";--> statement-breakpoint
ALTER TABLE "ratings" DROP COLUMN IF EXISTS "appointment_id";--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN IF EXISTS "appointment_id";--> statement-breakpoint
ALTER TABLE "stock_reservations" DROP COLUMN IF EXISTS "appointment_id";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "appointment_id";