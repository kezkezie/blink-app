-- Durable, authenticated-user-scoped fixed-window limits for Assisted Creation.
-- The application calls the RPC only after cookie authentication and strict
-- request validation. Direct table access is intentionally unavailable.

CREATE TABLE IF NOT EXISTS public.assisted_creation_rate_limits (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('concepts', 'direction')),
  window_seconds INTEGER NOT NULL CHECK (window_seconds BETWEEN 60 AND 604800),
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (user_id, operation, window_seconds, window_started_at)
);

ALTER TABLE public.assisted_creation_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.assisted_creation_rate_limits FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_assisted_creation_rate_limit(
  p_user_id UUID,
  p_operation TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_window_started_at TIMESTAMPTZ;
  v_request_count INTEGER;
  v_allowed BOOLEAN;
BEGIN
  IF p_user_id IS NULL
    OR p_operation NOT IN ('concepts', 'direction')
    OR p_limit < 1 OR p_limit > 10000
    OR p_window_seconds < 60 OR p_window_seconds > 604800
  THEN
    RAISE EXCEPTION 'Invalid rate-limit arguments';
  END IF;

  v_window_started_at := to_timestamp(
    floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds
  );

  -- Bound per-user retention without requiring a separate scheduled cleanup.
  DELETE FROM public.assisted_creation_rate_limits
  WHERE user_id = p_user_id
    AND window_started_at < v_now - interval '7 days';

  INSERT INTO public.assisted_creation_rate_limits (
    user_id,
    operation,
    window_seconds,
    window_started_at,
    request_count
  )
  VALUES (p_user_id, p_operation, p_window_seconds, v_window_started_at, 1)
  ON CONFLICT (user_id, operation, window_seconds, window_started_at)
  DO UPDATE
    SET request_count = public.assisted_creation_rate_limits.request_count + 1
  WHERE public.assisted_creation_rate_limits.request_count < p_limit
  RETURNING request_count INTO v_request_count;

  v_allowed := FOUND;

  IF NOT v_allowed THEN
    SELECT rate_limit.request_count
    INTO v_request_count
    FROM public.assisted_creation_rate_limits AS rate_limit
    WHERE rate_limit.user_id = p_user_id
      AND rate_limit.operation = p_operation
      AND rate_limit.window_seconds = p_window_seconds
      AND rate_limit.window_started_at = v_window_started_at;
  END IF;

  RETURN QUERY
  SELECT
    v_allowed,
    greatest(p_limit - coalesce(v_request_count, p_limit), 0),
    v_window_started_at + make_interval(secs => p_window_seconds);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_assisted_creation_rate_limit(UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_assisted_creation_rate_limit(UUID, TEXT, INTEGER, INTEGER)
  TO service_role;

COMMENT ON TABLE public.assisted_creation_rate_limits IS
  'Private fixed-window counters for authenticated Assisted Creation operations.';
COMMENT ON FUNCTION public.consume_assisted_creation_rate_limit(UUID, TEXT, INTEGER, INTEGER) IS
  'Atomically consumes an authenticated-user Assisted Creation operation quota.';
