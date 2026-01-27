-- Disable RLS to allow anon access (since we are using a mock admin user)
ALTER TABLE public.analysis_records DISABLE ROW LEVEL SECURITY;

-- Grant permissions to anon and authenticated roles
GRANT ALL ON public.analysis_records TO anon;
GRANT ALL ON public.analysis_records TO authenticated;
