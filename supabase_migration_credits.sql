-- ═══════════════════════════════════════════════════════════════
-- Blinkspot: Credit System Tables
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════

-- 1. credit_balances — one row per client (1:1 with clients)
CREATE TABLE IF NOT EXISTS public.credit_balances (
  client_id    UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  balance      INTEGER NOT NULL DEFAULT 0,
  lifetime_earned INTEGER NOT NULL DEFAULT 0,
  lifetime_spent  INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. credit_transactions — audit log of every credit movement
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount       INTEGER NOT NULL,              -- positive = credit-in, negative = deduction
  balance_after INTEGER NOT NULL,
  operation    TEXT NOT NULL,                  -- e.g. 'top_up', 'generation', 'refund', 'monthly_grant'
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_client
  ON public.credit_transactions(client_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can read their OWN balance
CREATE POLICY "Users can view own credit balance"
  ON public.credit_balances FOR SELECT
  USING (client_id = auth.uid());

-- Users can read their OWN transaction history
CREATE POLICY "Users can view own credit transactions"
  ON public.credit_transactions FOR SELECT
  USING (client_id = auth.uid());

-- service_role (backend RPCs, webhooks) can do everything
-- By default service_role bypasses RLS, but we add explicit
-- policies in case you switch to per-role mode later.
CREATE POLICY "Service role full access to credit_balances"
  ON public.credit_balances FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to credit_transactions"
  ON public.credit_transactions FOR ALL
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- Atomic RPC: deduct_credits
-- Call:  SELECT * FROM deduct_credits('uuid', 500, 'generation', 'Video gen #123');
-- Returns the new balance, or raises an exception if insufficient.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_client_id UUID,
  p_amount    INTEGER,
  p_operation TEXT DEFAULT 'generation',
  p_description TEXT DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  -- Upsert a row if one doesn't exist yet (new user, 0 balance)
  INSERT INTO public.credit_balances (client_id)
  VALUES (p_client_id)
  ON CONFLICT (client_id) DO NOTHING;

  -- Atomic update with balance check
  UPDATE public.credit_balances
  SET balance = balance - p_amount,
      lifetime_spent = lifetime_spent + p_amount,
      updated_at = now()
  WHERE client_id = p_client_id
    AND balance >= p_amount
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  -- Audit log
  INSERT INTO public.credit_transactions (client_id, amount, balance_after, operation, description)
  VALUES (p_client_id, -p_amount, v_new_balance, p_operation, p_description);

  RETURN v_new_balance;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- Atomic RPC: refund_credits
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.refund_credits(
  p_client_id UUID,
  p_amount    INTEGER,
  p_operation TEXT DEFAULT 'refund',
  p_description TEXT DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  INSERT INTO public.credit_balances (client_id)
  VALUES (p_client_id)
  ON CONFLICT (client_id) DO NOTHING;

  UPDATE public.credit_balances
  SET balance = balance + p_amount,
      lifetime_earned = lifetime_earned + p_amount,
      updated_at = now()
  WHERE client_id = p_client_id
  RETURNING balance INTO v_new_balance;

  INSERT INTO public.credit_transactions (client_id, amount, balance_after, operation, description)
  VALUES (p_client_id, p_amount, v_new_balance, p_operation, p_description);

  RETURN v_new_balance;
END;
$$;
