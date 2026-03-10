-- Re-enable RLS on all tables
-- Backend uses service_role key (bypasses RLS)
-- Frontend no longer queries Supabase directly (goes through backend API)

-- 1. Enable RLS on all tables
ALTER TABLE public.analysis_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.featured_analyses ENABLE ROW LEVEL SECURITY;

-- 2. Revoke anon's write access (keep only service_role full access)
REVOKE ALL ON public.users FROM anon;
REVOKE ALL ON public.credit_transactions FROM anon;
REVOKE ALL ON public.analysis_records FROM anon;

-- 3. Allow anon to read featured_analyses (public discovery page)
REVOKE ALL ON public.featured_analyses FROM anon;
GRANT SELECT ON public.featured_analyses TO anon;

-- 4. Service role retains full access (used by backend)
GRANT ALL ON public.analysis_records TO service_role;
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.credit_transactions TO service_role;
GRANT ALL ON public.featured_analyses TO service_role;

-- 5. RLS policies for service_role (allow everything)
DROP POLICY IF EXISTS "Service role full access to analysis_records" ON public.analysis_records;
CREATE POLICY "Service role full access to analysis_records" ON public.analysis_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to users" ON public.users;
CREATE POLICY "Service role full access to users" ON public.users
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to credit_transactions" ON public.credit_transactions;
CREATE POLICY "Service role full access to credit_transactions" ON public.credit_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to featured_analyses" ON public.featured_analyses;
CREATE POLICY "Service role full access to featured_analyses" ON public.featured_analyses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. Anon can only read featured_analyses (for public discovery page)
DROP POLICY IF EXISTS "Anon can read featured analyses" ON public.featured_analyses;
CREATE POLICY "Anon can read featured analyses" ON public.featured_analyses
  FOR SELECT TO anon USING (is_active = true);
