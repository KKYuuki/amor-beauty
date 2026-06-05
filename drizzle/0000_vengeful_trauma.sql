CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"id_token" text
);
--> statement-breakpoint
CREATE TABLE "accounting_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"inventory_id" uuid NOT NULL,
	"quantity" numeric NOT NULL,
	"fluid_quantity" numeric
);
--> statement-breakpoint
CREATE TABLE "appointment_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"price" numeric
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"client_id" text,
	"staff_id" text,
	"time_start" timestamp NOT NULL,
	"time_end" timestamp NOT NULL,
	"actual_time_start" timestamp,
	"actual_time_end" timestamp,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"type" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_walkin" boolean DEFAULT false NOT NULL,
	"client_name" text,
	"client_phone" text,
	"client_email" text,
	"created_by" text,
	"updated_at" timestamp,
	"updated_by" text,
	"branch_id" uuid
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"city" text NOT NULL,
	"address" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "branches_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "general_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"entry_date" timestamp NOT NULL,
	"entry_type" varchar(50) NOT NULL,
	"category" varchar(255),
	"description" text NOT NULL,
	"reference" varchar(255),
	"debit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"category_id" uuid,
	"source_type" varchar(50),
	"source_id" uuid,
	"created_by" text NOT NULL,
	"updated_at" timestamp,
	"updated_by" text,
	"proof_url" varchar(512),
	"is_voided" boolean DEFAULT false NOT NULL,
	"voided_at" timestamp,
	"voided_by" text,
	"void_reason" text,
	"branch_id" uuid
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar(255) NOT NULL,
	"item_code" varchar(100),
	"description" text,
	"external_link" text,
	"item_type" varchar(50) NOT NULL,
	"item_category" varchar(50) NOT NULL,
	"current_stock" numeric(10, 2) DEFAULT '0' NOT NULL,
	"stock_warning_threshold" numeric(10, 2),
	"last_restocked" timestamp,
	"unit_price" numeric(12, 2),
	"selling_price" numeric(12, 2),
	"fluid_unit_size" numeric(10, 2),
	"fluid_remaining" numeric(10, 2),
	"fluid_unit_of_measure" varchar(50),
	"is_perishable" boolean DEFAULT false NOT NULL,
	"expiration_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"show_in_sales" boolean DEFAULT true NOT NULL,
	"branch_id" uuid,
	"is_shared" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" varchar(50) DEFAULT 'staff' NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_by" text,
	CONSTRAINT "invitations_email_unique" UNIQUE("email"),
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer DEFAULT 0,
	"device_type" text,
	"backed_up" boolean DEFAULT false,
	"transports" text,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "payment_method" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"user_id" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"provider" varchar(100),
	"account_name" varchar(255),
	"account_number" varchar(100),
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_deductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"amount" integer NOT NULL,
	"reason" text,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deducted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "payroll_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"staff_id" text NOT NULL,
	"transaction_id" uuid,
	"appointment_id" uuid,
	"service_date" timestamp DEFAULT now() NOT NULL,
	"service_description" text,
	"client_type" varchar(50),
	"gross_amount" numeric(12, 2) NOT NULL,
	"shop_cut" numeric(12, 2) NOT NULL,
	"artist_cut" numeric(12, 2) NOT NULL,
	"rate_id" uuid,
	"tax_rate" integer,
	"tax_amount" numeric(12, 2),
	"net_amount" numeric(12, 2),
	"tax_bracket" text,
	"payment_status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"payroll_request_id" uuid,
	"paid_at" timestamp,
	"artist_rate_snapshot" jsonb,
	"shop_rate_snapshot" jsonb,
	"rate_version" integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "payroll_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"staff_id" text NOT NULL,
	"period_type" varchar(50) NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"total_gross" numeric(12, 2) NOT NULL,
	"total_shop_cut" numeric(12, 2) NOT NULL,
	"total_artist_cut" numeric(12, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'REQUESTED' NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"confirmed_by" text,
	"confirmed_at" timestamp,
	"payment_method" varchar(50),
	"completed_by" text,
	"completed_at" timestamp,
	"cancelled_by" text,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "payroll_staff_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"rate_name" varchar(255) NOT NULL,
	"service_type" varchar(50) NOT NULL,
	"client_type" varchar(50) NOT NULL,
	"artist_level" varchar(50) NOT NULL,
	"shop_percentage" numeric(5, 2) NOT NULL,
	"artist_percentage" numeric(5, 2) NOT NULL,
	"payment_mode" varchar(50) DEFAULT 'PERCENTAGE' NOT NULL,
	"fixed_amount" numeric(12, 2) DEFAULT '0',
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "piercing_details" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"piercing_location" text NOT NULL,
	"jewelry_material" text NOT NULL,
	"jewelry_style" text DEFAULT 'STUD' NOT NULL,
	"previous_piercing_issues" boolean DEFAULT false NOT NULL,
	"aftercare_instructions" text
);
--> statement-breakpoint
CREATE TABLE "qr_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"branch_id" uuid NOT NULL,
	"valid_date" timestamp NOT NULL,
	"qr_code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"generated_by" text,
	CONSTRAINT "qr_sessions_qr_code_unique" UNIQUE("qr_code")
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" uuid,
	"customer_id" text,
	"staff_id" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restock_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"cost" numeric(12, 2),
	"invoice_no" varchar(255),
	"proof_link" text,
	"restocked_at" timestamp,
	"supplier_name" varchar(255),
	"order_reference" varchar(255),
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" uuid,
	"author_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"is_public" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"service_id" uuid NOT NULL,
	"inventory_id" uuid NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"fluid_quantity" numeric(10, 2)
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"title" varchar(255) NOT NULL,
	"price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"pricing_type" varchar(50) DEFAULT 'FIXED' NOT NULL,
	"hourly_rate" numeric(12, 2) DEFAULT '0',
	"is_active" boolean DEFAULT true NOT NULL,
	"branch_id" uuid,
	"is_shared" boolean DEFAULT true NOT NULL,
	"service_type" varchar(50) DEFAULT 'TATTOO'
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "shoe_details" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"shoe_name" text NOT NULL,
	"quantity" numeric NOT NULL,
	"drop_off_date" timestamp,
	"pick_up_date" timestamp,
	"cleaning_service" text DEFAULT 'STANDARD' NOT NULL,
	"add_on_rush" boolean DEFAULT false NOT NULL,
	"add_on_replacement" boolean DEFAULT false NOT NULL,
	"add_on_water_repellent" boolean DEFAULT false NOT NULL,
	"sole_whitening" text DEFAULT 'NONE' NOT NULL,
	"reglue_service" text DEFAULT 'NONE' NOT NULL,
	"total_cost" numeric DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"staff_id" text NOT NULL,
	"day_of_week" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inventory_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp,
	"confirmed_at" timestamp,
	"released_at" timestamp,
	"converted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "storage_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"public_url" text,
	"size" integer,
	"mime_type" text,
	"bucket" text,
	"key" text,
	"is_public" boolean DEFAULT false,
	"uploaded_by" text
);
--> statement-breakpoint
CREATE TABLE "system_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"level" varchar(20) NOT NULL,
	"type" varchar(50) NOT NULL,
	"user_id" text,
	"branch_id" uuid,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"updated_by" text,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "tattoo_details" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"design_concept" text NOT NULL,
	"body_placement" text NOT NULL,
	"size_estimate" numeric,
	"is_color" boolean DEFAULT false NOT NULL,
	"artist_prep_time" numeric DEFAULT '0' NOT NULL,
	"reference_image_id" uuid,
	"final_image_id" uuid
);
--> statement-breakpoint
CREATE TABLE "time_clock_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"staff_id" text NOT NULL,
	"clock_in" timestamp NOT NULL,
	"clock_out" timestamp,
	"notes" text,
	"branch_id" uuid,
	"qr_session_id" uuid,
	"clock_in_device" text,
	"clock_out_device" text
);
--> statement-breakpoint
CREATE TABLE "transaction_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"inventory_id" uuid,
	"service_id" uuid,
	"item_name" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"line_total" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"payment_method" text NOT NULL,
	"reference_number" text,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"buyer_id" uuid,
	"buyer_name" text,
	"customer_phone" text,
	"customer_email" text,
	"staff_id" text,
	"branch_id" uuid,
	"subtotal" numeric(10, 2) NOT NULL,
	"tax_amount" numeric(10, 2) NOT NULL,
	"discount_amount" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"amount_paid" numeric(10, 2) NOT NULL,
	"balance_due" numeric(10, 2) NOT NULL,
	"payment_method" text NOT NULL,
	"cash_received" numeric(10, 2),
	"change_given" numeric(10, 2),
	"reference_number" text,
	"transaction_number" text NOT NULL,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"appointment_id" uuid,
	"notes" text,
	"client_type" text,
	"voided_at" timestamp,
	"voided_by" text,
	"void_reason" text,
	"created_by" text,
	CONSTRAINT "transactions_transaction_number_unique" UNIQUE("transaction_number")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"email" varchar(255) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" varchar(255),
	"image" text,
	"role" varchar(50),
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"two_factor_enabled" boolean DEFAULT false,
	"full_name" varchar(255),
	"phone_number" varchar(50),
	"instagram_handle" varchar(100),
	"avatar_url" text,
	"access_flags" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"last_login_method" varchar(50),
	"login_count" integer DEFAULT 0,
	"failed_login_attempts" integer DEFAULT 0,
	"last_failed_login_at" timestamp,
	"artist_level" varchar(50),
	"payout_period" varchar(50) DEFAULT 'WEEKLY',
	"branch_ids" jsonb DEFAULT '[]'::jsonb,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_ledger" ADD CONSTRAINT "general_ledger_category_id_accounting_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."accounting_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_ledger" ADD CONSTRAINT "general_ledger_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_ledger" ADD CONSTRAINT "general_ledger_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_ledger" ADD CONSTRAINT "general_ledger_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_ledger" ADD CONSTRAINT "general_ledger_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method" ADD CONSTRAINT "payment_method_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_deductions" ADD CONSTRAINT "payroll_deductions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entry" ADD CONSTRAINT "payroll_entry_staff_id_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entry" ADD CONSTRAINT "payroll_entry_rate_id_payroll_staff_rate_id_fk" FOREIGN KEY ("rate_id") REFERENCES "public"."payroll_staff_rate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_request" ADD CONSTRAINT "payroll_request_staff_id_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_request" ADD CONSTRAINT "payroll_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_request" ADD CONSTRAINT "payroll_request_confirmed_by_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_request" ADD CONSTRAINT "payroll_request_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_request" ADD CONSTRAINT "payroll_request_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_staff_rate" ADD CONSTRAINT "payroll_staff_rate_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piercing_details" ADD CONSTRAINT "piercing_details_id_appointments_id_fk" FOREIGN KEY ("id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_sessions" ADD CONSTRAINT "qr_sessions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_sessions" ADD CONSTRAINT "qr_sessions_generated_by_user_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_staff_id_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_log" ADD CONSTRAINT "restock_log_item_id_inventory_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_log" ADD CONSTRAINT "restock_log_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_inventory_id_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_impersonated_by_user_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoe_details" ADD CONSTRAINT "shoe_details_id_appointments_id_fk" FOREIGN KEY ("id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_staff_id_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_inventory_id_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_files" ADD CONSTRAINT "storage_files_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tattoo_details" ADD CONSTRAINT "tattoo_details_id_appointments_id_fk" FOREIGN KEY ("id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_clock_entries" ADD CONSTRAINT "time_clock_entries_staff_id_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_clock_entries" ADD CONSTRAINT "time_clock_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_clock_entries" ADD CONSTRAINT "time_clock_entries_qr_session_id_qr_sessions_id_fk" FOREIGN KEY ("qr_session_id") REFERENCES "public"."qr_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_payments" ADD CONSTRAINT "transaction_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_payments" ADD CONSTRAINT "transaction_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_staff_id_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_account_user_id" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_account_provider" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "idx_accounting_category_type" ON "accounting_category" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_accounting_category_is_active" ON "accounting_category" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_appointment_items_appointment_id" ON "appointment_items" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "idx_appointment_items_inventory_id" ON "appointment_items" USING btree ("inventory_id");--> statement-breakpoint
CREATE INDEX "idx_appointment_services_appointment_id" ON "appointment_services" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "idx_appointment_services_service_id" ON "appointment_services" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "idx_appointments_status" ON "appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_appointments_type" ON "appointments" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_appointments_is_active" ON "appointments" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_appointments_is_walkin" ON "appointments" USING btree ("is_walkin");--> statement-breakpoint
CREATE INDEX "idx_appointments_time_start" ON "appointments" USING btree ("time_start");--> statement-breakpoint
CREATE INDEX "idx_appointments_client_id" ON "appointments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_appointments_staff_id" ON "appointments" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_appointments_branch_id" ON "appointments" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_appointments_created_at" ON "appointments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_branches_code" ON "branches" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_branches_city" ON "branches" USING btree ("city");--> statement-breakpoint
CREATE INDEX "idx_branches_is_active" ON "branches" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_gl_entry_date" ON "general_ledger" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "idx_gl_entry_type" ON "general_ledger" USING btree ("entry_type");--> statement-breakpoint
CREATE INDEX "idx_gl_category" ON "general_ledger" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_gl_source" ON "general_ledger" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_gl_created_at" ON "general_ledger" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_gl_is_voided" ON "general_ledger" USING btree ("is_voided");--> statement-breakpoint
CREATE INDEX "idx_gl_branch_id" ON "general_ledger" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_item_type" ON "inventory" USING btree ("item_type");--> statement-breakpoint
CREATE INDEX "idx_inventory_item_category" ON "inventory" USING btree ("item_category");--> statement-breakpoint
CREATE INDEX "idx_inventory_is_active" ON "inventory" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_inventory_name" ON "inventory" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_inventory_branch_id" ON "inventory" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_item_code" ON "inventory" USING btree ("item_code");--> statement-breakpoint
CREATE INDEX "idx_inventory_is_shared" ON "inventory" USING btree ("is_shared");--> statement-breakpoint
CREATE INDEX "idx_invitations_email" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_invitations_token" ON "invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_invitations_expires_at" ON "invitations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_passkey_user_id" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_passkey_credential_id" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "idx_payment_method_user_id" ON "payment_method" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_payment_method_type" ON "payment_method" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_payment_method_is_default" ON "payment_method" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "idx_payroll_deductions_user_id" ON "payroll_deductions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_payroll_deductions_status" ON "payroll_deductions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payroll_deductions_type" ON "payroll_deductions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_payroll_entry_staff_id" ON "payroll_entry" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_payroll_entry_payment_status" ON "payroll_entry" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "idx_payroll_entry_service_date" ON "payroll_entry" USING btree ("service_date");--> statement-breakpoint
CREATE INDEX "idx_payroll_entry_request_id" ON "payroll_entry" USING btree ("payroll_request_id");--> statement-breakpoint
CREATE INDEX "idx_payroll_entry_transaction_id" ON "payroll_entry" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_payroll_request_staff_id" ON "payroll_request" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_payroll_request_status" ON "payroll_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payroll_request_period" ON "payroll_request" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "idx_payroll_request_created_at" ON "payroll_request" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_payroll_request_requested_by" ON "payroll_request" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "idx_payroll_rate_service_type" ON "payroll_staff_rate" USING btree ("service_type");--> statement-breakpoint
CREATE INDEX "idx_payroll_rate_client_type" ON "payroll_staff_rate" USING btree ("client_type");--> statement-breakpoint
CREATE INDEX "idx_payroll_rate_artist_level" ON "payroll_staff_rate" USING btree ("artist_level");--> statement-breakpoint
CREATE INDEX "idx_payroll_rate_is_active" ON "payroll_staff_rate" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_payroll_rate_unique" ON "payroll_staff_rate" USING btree ("service_type","client_type","artist_level");--> statement-breakpoint
CREATE INDEX "idx_qr_sessions_branch_date" ON "qr_sessions" USING btree ("branch_id","valid_date");--> statement-breakpoint
CREATE INDEX "idx_qr_sessions_qr_code" ON "qr_sessions" USING btree ("qr_code");--> statement-breakpoint
CREATE INDEX "idx_restock_log_item_id" ON "restock_log" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_restock_log_created_at" ON "restock_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_restock_log_invoice_no" ON "restock_log" USING btree ("invoice_no");--> statement-breakpoint
CREATE INDEX "idx_restock_log_restocked_at" ON "restock_log" USING btree ("restocked_at");--> statement-breakpoint
CREATE INDEX "idx_service_items_service_id" ON "service_items" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "idx_service_items_inventory_id" ON "service_items" USING btree ("inventory_id");--> statement-breakpoint
CREATE INDEX "idx_services_is_active" ON "services" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_services_service_type" ON "services" USING btree ("service_type");--> statement-breakpoint
CREATE INDEX "idx_services_pricing_type" ON "services" USING btree ("pricing_type");--> statement-breakpoint
CREATE INDEX "idx_services_branch_id" ON "services" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_services_is_shared" ON "services" USING btree ("is_shared");--> statement-breakpoint
CREATE INDEX "idx_session_user_id" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_session_token" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_session_expires_at" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_staff_schedules_staff_id" ON "staff_schedules" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_stock_reservations_inventory_id" ON "stock_reservations" USING btree ("inventory_id");--> statement-breakpoint
CREATE INDEX "idx_stock_reservations_appointment_id" ON "stock_reservations" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "idx_stock_reservations_status" ON "stock_reservations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_stock_reservations_created_at" ON "stock_reservations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_stock_reservations_expires_at" ON "stock_reservations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_storage_uploaded_by" ON "storage_files" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "idx_storage_is_public" ON "storage_files" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "idx_system_logs_level" ON "system_logs" USING btree ("level");--> statement-breakpoint
CREATE INDEX "idx_system_logs_type" ON "system_logs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_system_logs_created_at" ON "system_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_system_logs_user_id" ON "system_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_system_logs_branch_id" ON "system_logs" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_system_settings_key" ON "system_settings" USING btree ("key");--> statement-breakpoint
CREATE INDEX "idx_system_settings_category" ON "system_settings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_time_clock_staff_id" ON "time_clock_entries" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_time_clock_clock_in" ON "time_clock_entries" USING btree ("clock_in");--> statement-breakpoint
CREATE INDEX "idx_transactions_number" ON "transactions" USING btree ("transaction_number");--> statement-breakpoint
CREATE INDEX "idx_transactions_staff" ON "transactions" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_created_at" ON "transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_transactions_status" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_transactions_branch_id" ON "transactions" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_appointment_id" ON "transactions" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "idx_two_factor_user_id" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_email" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_user_role" ON "user" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_user_artist_level" ON "user" USING btree ("artist_level");--> statement-breakpoint
CREATE INDEX "idx_verification_identifier" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "idx_verification_expires_at" ON "verification" USING btree ("expires_at");