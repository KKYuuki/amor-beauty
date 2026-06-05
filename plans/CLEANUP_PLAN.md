# Database & Code Cleanup Plan

## Overview
Remove duplicate columns, Supabase dependencies, and client-related code. Consolidate to a staff-only system.

## Phase 1: Schema Cleanup

### 1.1 Remove Duplicate/Redundant Columns from `user` table
**Current:**
- `role` (better-auth native)
- `userRole` (custom duplicate)
- `isStaff` (redundant boolean)

**New:**
- `role` only (better-auth native)
- Remove `userRole` column
- Remove `isStaff` column
- Remove default 'CLIENT' (no clients in system)

### 1.2 Update Schema Files
- `/server/db/schema/auth.ts` - Remove userRole, isStaff columns and indexes
- Update all foreign key references

## Phase 2: Type System Cleanup

### 2.1 Update User Types
- `/utils/types/auth.ts` - Remove `is_staff`, consolidate to `role` only
- Remove 'CLIENT' from UserRoleType
- Update UserProfile interface

## Phase 3: Code Updates

### 3.1 Update Auth Configuration
- `/server/auth.ts` - Remove isStaff and userRole from hook

### 3.2 Update Permissions System
- `/utils/auth/permissions.ts` - Remove isStaff check, use role only
- Remove isClient function (no clients)

### 3.3 Update API Actions
- `/app/api/actions/profile.ts` - Remove userRole, isStaff references
- Update all other action files

### 3.4 Update Components
- Remove CLIENT role checks from all components
- Update sidebar, appointments, accounts pages

## Phase 4: Supabase Removal

### 4.1 Remove Dependencies
- Uninstall @supabase/supabase-js
- Remove utils/supabase/ directory

### 4.2 Clean Environment
- Remove Supabase env vars from .env files
- Update .env.example

### 4.3 Remove Legacy Code
- Delete stub files with "Supabase disabled" warnings
- Remove all console.warn statements about Supabase

## Phase 5: Database Migration

### 5.1 Create Migration Script
- Migrate existing data: copy userRole to role where needed
- Drop userRole and isStaff columns
- Update all users to have valid roles (no CLIENT)

## Execution Order
1. Update schema
2. Update types
3. Update auth config
4. Update permissions
5. Update API actions
6. Update components
7. Remove Supabase
8. Run database migration
