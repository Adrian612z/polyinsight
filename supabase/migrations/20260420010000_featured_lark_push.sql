DO $$ BEGIN
    ALTER TABLE public.featured_analyses
      ADD COLUMN lark_push_status TEXT
        CHECK (lark_push_status IN ('pending', 'sent', 'failed'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.featured_analyses
      ADD COLUMN lark_push_sent_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.featured_analyses
      ADD COLUMN lark_push_last_attempt_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.featured_analyses
      ADD COLUMN lark_push_last_error TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.featured_analyses
      ADD COLUMN lark_push_payload JSONB;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_featured_lark_push_status
  ON public.featured_analyses(lark_push_status, created_at DESC);
