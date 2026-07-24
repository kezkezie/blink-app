-- Image Studio Completion Plan — Slice 4: minimum durable image-generation job
-- and metadata envelope. Additive columns on the existing `content` placeholder.
--
-- These fields give an Image Studio generation attempt a durable server-side
-- identity, tenant-scoped idempotency, retry lineage, and the three distinct
-- state dimensions from Slice 3 (generation / billing / retry) BEFORE any
-- provider execution. This migration never executes generation and never
-- overloads the editorial `content.status` lifecycle field.
--
-- All column adds are IF NOT EXISTS so the migration is safe whether or not a
-- given column already exists in the live database (e.g. `generation_status_text`
-- is already referenced by existing code). Existing rows are untouched: every
-- new column is nullable with no default, so no table rewrite/backfill occurs.
--
-- Billing note: Slice 3 (§7.1) made `billing_state` the single authoritative
-- billing dimension (it already encodes charge + refund status). It supersedes
-- the older §7.2 `credit_refund_status`, which is intentionally NOT added here to
-- avoid two overlapping billing representations that could drift. `credit_cost`
-- remains for the amount, populated by a later execution/billing slice.

ALTER TABLE public.content
  -- Slice 3 state contract, persisted as three distinct dimensions.
  ADD COLUMN IF NOT EXISTS generation_state TEXT
    CHECK (generation_state IN (
      'idle', 'preparing', 'queued', 'generating', 'saving',
      'succeeded', 'failed', 'timed_out'
    )),
  ADD COLUMN IF NOT EXISTS billing_state TEXT
    CHECK (billing_state IN (
      'not_charged', 'charged', 'refund_pending', 'refunded', 'refund_failed'
    )),
  ADD COLUMN IF NOT EXISTS retry_state TEXT
    CHECK (retry_state IN ('none', 'retry_available', 'retrying')),

  -- Human-facing status + stable error code (execution-time fields stay NULL
  -- until a later slice runs the job).
  ADD COLUMN IF NOT EXISTS generation_status_text TEXT,
  ADD COLUMN IF NOT EXISTS generation_error_code TEXT,
  ADD COLUMN IF NOT EXISTS provider_task_id TEXT,

  -- Billing amount (state lives in billing_state above).
  ADD COLUMN IF NOT EXISTS credit_cost INTEGER
    CHECK (credit_cost IS NULL OR credit_cost >= 0),

  -- Tenant-scoped idempotency token + attempt lineage.
  ADD COLUMN IF NOT EXISTS generation_idempotency_key TEXT
    CHECK (generation_idempotency_key IS NULL OR char_length(generation_idempotency_key) BETWEEN 8 AND 128),
  ADD COLUMN IF NOT EXISTS generation_attempt INTEGER
    CHECK (generation_attempt IS NULL OR generation_attempt >= 1),
  ADD COLUMN IF NOT EXISTS retry_of_content_id UUID
    REFERENCES public.content(id) ON DELETE SET NULL,

  -- Minimum creation metadata; extended compatibly by later slices.
  ADD COLUMN IF NOT EXISTS creation_metadata_version INTEGER
    CHECK (creation_metadata_version IS NULL OR creation_metadata_version >= 1),
  ADD COLUMN IF NOT EXISTS creation_metadata JSONB,

  ADD COLUMN IF NOT EXISTS generation_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS generation_completed_at TIMESTAMPTZ;

-- Durable idempotency: a client cannot create two placeholders with the same
-- key. NULLs are distinct in Postgres, so existing/non-job rows (NULL key) are
-- unaffected and unlimited. Different clients may reuse the same textual key
-- independently because the client_id is part of the uniqueness scope.
CREATE UNIQUE INDEX IF NOT EXISTS content_client_idempotency_key_uidx
  ON public.content (client_id, generation_idempotency_key)
  WHERE generation_idempotency_key IS NOT NULL;

-- Lookup index for retry lineage traversal.
CREATE INDEX IF NOT EXISTS content_retry_of_content_id_idx
  ON public.content (retry_of_content_id)
  WHERE retry_of_content_id IS NOT NULL;

COMMENT ON COLUMN public.content.generation_state IS
  'Slice 3 generation dimension: idle|preparing|queued|generating|saving|succeeded|failed|timed_out.';
COMMENT ON COLUMN public.content.billing_state IS
  'Slice 3 billing dimension (authoritative; supersedes credit_refund_status): not_charged|charged|refund_pending|refunded|refund_failed.';
COMMENT ON COLUMN public.content.retry_state IS
  'Slice 3 retry dimension: none|retry_available|retrying.';
COMMENT ON COLUMN public.content.generation_idempotency_key IS
  'Client-generated creation token; unique per (client_id, key). Not shared across brands or retries.';
COMMENT ON COLUMN public.content.retry_of_content_id IS
  'Parent placeholder this attempt retries; must share the same client and brand.';
