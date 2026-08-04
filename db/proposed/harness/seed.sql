-- Local-Postgres harness seed for the proposed billing RPCs (rev-4).
-- Minimal, throwaway schema — NOT the production schema. Recreates just enough of
-- clients / credit_balances / credit_transactions / content (+ envelope columns)
-- and the Supabase roles so the migration's grants and RLS can be exercised.

-- Supabase-style roles the migration GRANTs to / REVOKEs from.
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.clients (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid
);

CREATE TABLE public.credit_balances (
  client_id       uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  balance         integer NOT NULL DEFAULT 0,
  lifetime_earned integer NOT NULL DEFAULT 0,
  lifetime_spent  integer NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.credit_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount        integer NOT NULL,
  balance_after integer NOT NULL,
  operation     text NOT NULL,
  description   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- content with the Slice-4 durable envelope columns the RPCs read/write.
CREATE TABLE public.content (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                 uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  brand_id                  uuid,
  content_type              text,
  status                    text,
  image_urls                jsonb DEFAULT '[]'::jsonb,
  generation_state          text,
  billing_state             text,
  retry_state               text,
  generation_status_text    text,
  generation_error_code     text,
  credit_cost               integer,
  generation_idempotency_key text,
  generation_attempt        integer,
  generation_started_at     timestamptz,
  generation_completed_at   timestamptz,
  updated_at                timestamptz NOT NULL DEFAULT now()
);
