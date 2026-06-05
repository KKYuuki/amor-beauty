ALTER TABLE "transaction_items" ADD COLUMN "item_label" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "sales_description" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "sales_labels" jsonb DEFAULT '[]';