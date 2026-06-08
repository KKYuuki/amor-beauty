ALTER TABLE "push_subscriptions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "push_subscriptions" CASCADE;--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_appointment_id_appointments_id_fk";
--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_appointment_id_appointments_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_reservations" DROP CONSTRAINT "stock_reservations_appointment_id_appointments_id_fk";
--> statement-breakpoint
DROP INDEX "idx_stock_reservations_appointment_id";--> statement-breakpoint
DROP INDEX "idx_transactions_appointment_id";--> statement-breakpoint
ALTER TABLE "ratings" DROP COLUMN "appointment_id";--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN "appointment_id";--> statement-breakpoint
ALTER TABLE "stock_reservations" DROP COLUMN "appointment_id";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "appointment_id";