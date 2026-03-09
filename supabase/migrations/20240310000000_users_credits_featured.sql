-- PolyInsight 产品化: 用户、积分、推荐表

-- 1. Users table
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    email TEXT,
    display_name TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    credit_balance INTEGER DEFAULT 300,
    referral_code TEXT UNIQUE,
    referred_by TEXT REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON public.users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON public.users(referred_by);

-- 2. Credit transactions ledger
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.users(id),
    amount INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('topup','analysis_spend','referral_commission','admin_grant','refund','signup_bonus')),
    reference_id TEXT,
    description TEXT,
    balance_after INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON public.credit_transactions(user_id, created_at DESC);

-- 3. Featured analyses for discovery page
CREATE TABLE IF NOT EXISTS public.featured_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_slug TEXT NOT NULL UNIQUE,
    event_title TEXT NOT NULL,
    category TEXT,
    polymarket_url TEXT NOT NULL,
    analysis_record_id UUID REFERENCES public.analysis_records(id),
    decision_data JSONB,
    mispricing_score NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_featured_active ON public.featured_analyses(is_active, mispricing_score DESC);

-- 4. Add credits_charged column to analysis_records
DO $$ BEGIN
    ALTER TABLE public.analysis_records ADD COLUMN credits_charged INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 5. Disable RLS on new tables (same as existing setup)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.featured_analyses DISABLE ROW LEVEL SECURITY;

-- 6. Grant access to anon and authenticated roles
GRANT ALL ON public.users TO anon, authenticated, service_role;
GRANT ALL ON public.credit_transactions TO anon, authenticated, service_role;
GRANT ALL ON public.featured_analyses TO anon, authenticated, service_role;
