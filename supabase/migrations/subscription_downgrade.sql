-- ═══════════════════════════════════════════════════════════════
-- BlinkSpot: Subscription Expiry & Downgrade System
-- Run via: supabase db push  (or paste into Supabase SQL Editor)
-- ═══════════════════════════════════════════════════════════════

-- 1. Add current_period_end to clients
--    Tracks when the current paid billing period expires.
--    NULL means the client has never had a paid subscription.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.clients.current_period_end IS
  'Timestamp when the current paid subscription period expires. '
  'Set by Paystack webhook on each successful charge. '
  'NULL = no active paid subscription.';

-- ═══════════════════════════════════════════════════════════════
-- 2. RPC: downgrade_expired_subscriptions()
--    Called nightly by n8n (Midnight Subscription Downgrader workflow).
--    Finds all paid clients whose period has expired and resets them
--    to the free tier.
--
--    Returns: integer — the number of clients downgraded.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.downgrade_expired_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.clients
  SET
    plan_tier  = 'free',
    updated_at = now()
  WHERE
    current_period_end IS NOT NULL
    AND current_period_end < now()
    AND plan_tier != 'free';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

-- Grant execute to service_role only (called from n8n via service key)
REVOKE EXECUTE ON FUNCTION public.downgrade_expired_subscriptions() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.downgrade_expired_subscriptions() TO service_role;
