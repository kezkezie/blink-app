-- ========================================================
-- MULTI-BRAND WORKSPACE ISOLATION MIGRATION
-- Adds brand_id to social_accounts and content tables
-- ========================================================

-- 1. Add brand_id column to social_accounts
ALTER TABLE social_accounts
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brand_profiles(id) ON DELETE SET NULL;

-- 2. Add brand_id column to content
ALTER TABLE content
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brand_profiles(id) ON DELETE SET NULL;

-- 3. Auto-populate brand_id for existing rows in social_accounts
-- Maps each row to the first brand_profile for its client_id (sorted by created_at)
UPDATE social_accounts sa
SET brand_id = sub.first_brand_id
FROM (
  SELECT DISTINCT ON (client_id)
    client_id,
    id AS first_brand_id
  FROM brand_profiles
  ORDER BY client_id, created_at ASC
) sub
WHERE sa.client_id = sub.client_id
  AND sa.brand_id IS NULL;

-- 4. Auto-populate brand_id for existing rows in content
UPDATE content c
SET brand_id = sub.first_brand_id
FROM (
  SELECT DISTINCT ON (client_id)
    client_id,
    id AS first_brand_id
  FROM brand_profiles
  ORDER BY client_id, created_at ASC
) sub
WHERE c.client_id = sub.client_id
  AND c.brand_id IS NULL;

-- 5. (Optional) Create indexes for faster brand-scoped queries
CREATE INDEX IF NOT EXISTS idx_social_accounts_brand_id ON social_accounts(brand_id);
CREATE INDEX IF NOT EXISTS idx_content_brand_id ON content(brand_id);
