CREATE TABLE IF NOT EXISTS public.visit_sessions (
    id TEXT PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    user_id TEXT REFERENCES public.users(id),
    campaign_code TEXT,
    referral_code TEXT,
    source_type TEXT NOT NULL DEFAULT 'direct'
      CHECK (source_type IN ('campaign', 'referral', 'organic', 'direct', 'unknown')),
    source_platform TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    referrer_url TEXT,
    referrer_host TEXT,
    landing_path TEXT,
    landing_query TEXT,
    locale TEXT,
    user_agent TEXT,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visit_sessions_first_seen_at
  ON public.visit_sessions(first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_visit_sessions_visitor_id
  ON public.visit_sessions(visitor_id, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_visit_sessions_user_id
  ON public.visit_sessions(user_id, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_visit_sessions_source
  ON public.visit_sessions(source_type, source_platform, campaign_code);

CREATE TABLE IF NOT EXISTS public.growth_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT REFERENCES public.visit_sessions(id) ON DELETE SET NULL,
    visitor_id TEXT,
    user_id TEXT REFERENCES public.users(id),
    event_name TEXT NOT NULL,
    page_path TEXT,
    campaign_code TEXT,
    referral_code TEXT,
    source_type TEXT
      CHECK (source_type IN ('campaign', 'referral', 'organic', 'direct', 'unknown')),
    source_platform TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_growth_events_created_at
  ON public.growth_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_events_event_name
  ON public.growth_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_events_session_id
  ON public.growth_events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_events_user_id
  ON public.growth_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_attribution (
    user_id TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    first_session_id TEXT REFERENCES public.visit_sessions(id),
    first_campaign_code TEXT,
    first_referral_code TEXT,
    first_source_type TEXT
      CHECK (first_source_type IN ('campaign', 'referral', 'organic', 'direct', 'unknown')),
    first_source_platform TEXT,
    last_session_id TEXT REFERENCES public.visit_sessions(id),
    last_campaign_code TEXT,
    last_referral_code TEXT,
    last_source_type TEXT
      CHECK (last_source_type IN ('campaign', 'referral', 'organic', 'direct', 'unknown')),
    last_source_platform TEXT,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    first_analysis_record_id UUID REFERENCES public.analysis_records(id),
    first_analysis_at TIMESTAMPTZ,
    first_paid_order_id UUID REFERENCES public.billing_orders(id),
    first_paid_at TIMESTAMPTZ,
    approved_order_count INTEGER NOT NULL DEFAULT 0,
    approved_order_revenue_tokens NUMERIC(20, 6) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_attribution_registered_at
  ON public.user_attribution(registered_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_attribution_first_analysis_at
  ON public.user_attribution(first_analysis_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_attribution_first_paid_at
  ON public.user_attribution(first_paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_attribution_source
  ON public.user_attribution(first_source_type, first_source_platform, first_campaign_code);

DO $$ BEGIN
    ALTER TABLE public.analysis_records
      ADD COLUMN attribution_session_id TEXT REFERENCES public.visit_sessions(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.analysis_records
      ADD COLUMN attribution_campaign_code TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.analysis_records
      ADD COLUMN attribution_referral_code TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.analysis_records
      ADD COLUMN attribution_source_type TEXT
        CHECK (attribution_source_type IN ('campaign', 'referral', 'organic', 'direct', 'unknown'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.analysis_records
      ADD COLUMN attribution_source_platform TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_analysis_records_attribution_source
  ON public.analysis_records(attribution_source_type, attribution_source_platform, attribution_campaign_code);

DO $$ BEGIN
    ALTER TABLE public.billing_orders
      ADD COLUMN attribution_session_id TEXT REFERENCES public.visit_sessions(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.billing_orders
      ADD COLUMN attribution_campaign_code TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.billing_orders
      ADD COLUMN attribution_referral_code TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.billing_orders
      ADD COLUMN attribution_source_type TEXT
        CHECK (attribution_source_type IN ('campaign', 'referral', 'organic', 'direct', 'unknown'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.billing_orders
      ADD COLUMN attribution_source_platform TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_billing_orders_attribution_source
  ON public.billing_orders(attribution_source_type, attribution_source_platform, attribution_campaign_code);

ALTER TABLE public.visit_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_attribution ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.visit_sessions FROM anon, authenticated;
REVOKE ALL ON public.growth_events FROM anon, authenticated;
REVOKE ALL ON public.user_attribution FROM anon, authenticated;

GRANT ALL ON public.visit_sessions TO service_role;
GRANT ALL ON public.growth_events TO service_role;
GRANT ALL ON public.user_attribution TO service_role;

DROP POLICY IF EXISTS "Service role full access to visit_sessions" ON public.visit_sessions;
CREATE POLICY "Service role full access to visit_sessions" ON public.visit_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to growth_events" ON public.growth_events;
CREATE POLICY "Service role full access to growth_events" ON public.growth_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to user_attribution" ON public.user_attribution;
CREATE POLICY "Service role full access to user_attribution" ON public.user_attribution
  FOR ALL TO service_role USING (true) WITH CHECK (true);
