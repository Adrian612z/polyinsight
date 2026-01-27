-- Create analysis_records table
CREATE TABLE IF NOT EXISTS public.analysis_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid(),
    event_url TEXT NOT NULL,
    analysis_result TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_analysis_records_user_id ON public.analysis_records(user_id);
CREATE INDEX IF NOT EXISTS idx_analysis_records_created_at ON public.analysis_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_records_status ON public.analysis_records(status);

-- Enable RLS
ALTER TABLE public.analysis_records ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Users can view their own analysis records" ON public.analysis_records;
CREATE POLICY "Users can view their own analysis records" ON public.analysis_records
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own analysis records" ON public.analysis_records;
CREATE POLICY "Users can insert their own analysis records" ON public.analysis_records
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own analysis records" ON public.analysis_records;
CREATE POLICY "Users can update their own analysis records" ON public.analysis_records
    FOR UPDATE USING (auth.uid() = user_id);
    
-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_records TO service_role;
