-- Billing orders and subscriptions for package purchases

CREATE TABLE IF NOT EXISTS public.billing_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.users(id),
    plan_id TEXT NOT NULL CHECK (plan_id IN ('topup', 'monthly', 'unlimited')),
    status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'submitted', 'approved', 'rejected', 'cancelled', 'expired')),
    expected_amount_tokens NUMERIC(20,6) NOT NULL,
    expected_credits INTEGER NOT NULL DEFAULT 0,
    token_symbol TEXT,
    tx_hash TEXT UNIQUE,
    review_note TEXT,
    reviewed_by TEXT REFERENCES public.users(id),
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_orders_user_created_at ON public.billing_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_orders_status_created_at ON public.billing_orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.users(id),
    plan_id TEXT NOT NULL CHECK (plan_id IN ('monthly', 'unlimited')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    included_credits INTEGER NOT NULL DEFAULT 0,
    unlimited BOOLEAN NOT NULL DEFAULT FALSE,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ NOT NULL,
    source_order_id UUID REFERENCES public.billing_orders(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_status ON public.user_subscriptions(user_id, status, ends_at DESC);

DO $$ BEGIN
    ALTER TABLE public.transactions ADD COLUMN user_id TEXT REFERENCES public.users(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.transactions ADD COLUMN billing_order_id UUID REFERENCES public.billing_orders(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.transactions ADD COLUMN plan_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'pending_review', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.transactions ADD COLUMN reviewed_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.transactions ADD COLUMN reviewed_by TEXT REFERENCES public.users(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.transactions ADD COLUMN review_note TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_user_created_at ON public.transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status_created_at ON public.transactions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_billing_order_id ON public.transactions(billing_order_id);

ALTER TABLE public.billing_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.billing_orders TO anon, authenticated, service_role;
GRANT ALL ON public.user_subscriptions TO anon, authenticated, service_role;
