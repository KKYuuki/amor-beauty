-- WARNING: This will delete ALL data in the database!
-- Use with extreme caution

-- Drop all tables in public schema
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Disable foreign key checks temporarily
    SET session_replication_role = 'replica';
    
    -- Drop all tables
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
    
    -- Re-enable foreign key checks
    SET session_replication_role = 'origin';
END $$;

-- Drop custom types if needed
-- DROP TYPE IF EXISTS appointment_status;
-- DROP TYPE IF EXISTS user_role;
