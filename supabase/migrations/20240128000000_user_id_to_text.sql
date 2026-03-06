-- Drop RLS policies that reference user_id as UUID
DROP POLICY IF EXISTS "Users can view their own analysis records" ON public.analysis_records;
DROP POLICY IF EXISTS "Users can insert their own analysis records" ON public.analysis_records;
DROP POLICY IF EXISTS "Users can update their own analysis records" ON public.analysis_records;

-- Change user_id from UUID to TEXT to support Privy user IDs (did:privy:xxx)
ALTER TABLE public.analysis_records
  ALTER COLUMN user_id DROP DEFAULT,
  ALTER COLUMN user_id SET DATA TYPE TEXT;
