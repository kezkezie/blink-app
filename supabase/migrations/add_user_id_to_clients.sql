-- Multi-Tenant SaaS: Link clients to auth users
-- Run this in your Supabase SQL Editor

-- 1. Add user_id column to clients, referencing auth.users
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. Create a unique index so each auth user maps to exactly one client
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_user_id
ON clients (user_id)
WHERE user_id IS NOT NULL;
