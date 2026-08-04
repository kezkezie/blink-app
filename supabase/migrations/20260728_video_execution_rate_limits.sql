-- V1 — Video execution security boundary: durable rate limits for video routes.
--
-- Widens the shared fixed-window limiter shipped for Assisted Creation
-- (`20260715_assisted_creation_rate_limits.sql`) so it also covers the
-- authenticated video execution operations (suggest / storyboard / suggest-frame
-- / tts / director / video_job). This is ADDITIVE and BACKWARD COMPATIBLE:
-- the existing 'concepts' and 'direction' operations keep working unchanged,
-- and no data is moved. A single shared backend is reused rather than creating
-- a parallel video limiter.
--
-- The hard-coded operation IN-list is generalized to a bounded lower_snake_case
-- format so future slices (e.g. V3 durable video jobs) need no further limiter
-- migration.
--
-- NOT YET APPLIED to any live environment. The live video rate-limit gate stays
-- open until this is applied under authorization (manually via the Dashboard SQL
-- editor on the production project, like the Slice 1 limiter) AND the app runs
-- with VIDEO_EXECUTION_RATE_LIMITS=1.

ALTER TABLE public.assisted_creation_rate_limits
  DROP CONSTRAINT IF EXISTS assisted_creation_rate_limits_operation_check;

ALTER TABLE public.assisted_creation_rate_limits
  ADD CONSTRAINT assisted_creation_rate_limits_operation_check
  CHECK (operation ~ '^[a-z][a-z0-9_]{1,63}$');

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
    OR p_operation !~ '^[a-z][a-z0-9_]{1,63}$'
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
