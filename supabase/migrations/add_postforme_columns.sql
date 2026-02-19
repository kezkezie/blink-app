-- Post for Me API Integration — Database Migration
-- Run this against your Supabase instance (SQL Editor)
-- This adds the Post for Me ID columns alongside existing Blotato ones.

-- Add postforme_account_id to social_accounts
ALTER TABLE social_accounts
ADD COLUMN IF NOT EXISTS postforme_account_id TEXT DEFAULT NULL;

-- Add postforme_post_id to content_schedule
ALTER TABLE content_schedule
ADD COLUMN IF NOT EXISTS postforme_post_id TEXT DEFAULT NULL;

-- Create an index for faster lookup by postforme_account_id
CREATE INDEX IF NOT EXISTS idx_social_accounts_postforme_id 
ON social_accounts (postforme_account_id) 
WHERE postforme_account_id IS NOT NULL;

-- Create an index for faster lookup by postforme_post_id
CREATE INDEX IF NOT EXISTS idx_content_schedule_postforme_post_id 
ON content_schedule (postforme_post_id) 
WHERE postforme_post_id IS NOT NULL;
