-- Signal Labs v2 AAA Upgrade — Database Migrations
-- Run these against your Supabase project

-- ═══════════════════════════════════════════
-- DATA CACHE (Phase 1)
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.data_cache (
  cache_key TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_data_cache_expires ON public.data_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_data_cache_source ON public.data_cache (source_name);

-- ═══════════════════════════════════════════
-- REPORT SCHEDULES (Phase 4)
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  industry TEXT NOT NULL,
  company TEXT,
  country TEXT DEFAULT 'United States',
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  stage TEXT,
  team TEXT,
  pains JSONB DEFAULT '[]',
  decision TEXT,
  competitors TEXT,
  advantage TEXT,
  tier TEXT DEFAULT 'free',
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  last_token TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schedules_active ON public.report_schedules (active, next_run_at);
CREATE INDEX IF NOT EXISTS idx_schedules_email ON public.report_schedules (email);

-- ═══════════════════════════════════════════
-- API KEYS (Phase 5)
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  key TEXT UNIQUE NOT NULL,
  tier TEXT DEFAULT 'free',
  active BOOLEAN DEFAULT true,
  rate_limit INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON public.api_keys (key) WHERE active = true;

-- ═══════════════════════════════════════════
-- WEBHOOKS (Phase 5)
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES public.api_keys(id),
  url TEXT NOT NULL,
  event TEXT DEFAULT 'report.completed',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON public.webhooks (active, event);

-- ═══════════════════════════════════════════
-- REPORT VERSIONS (Phase 5)
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.report_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_token TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  token TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  industry TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_versions_original ON public.report_versions (original_token, version DESC);
CREATE INDEX IF NOT EXISTS idx_versions_email ON public.report_versions (email);

-- ═══════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════
ALTER TABLE public.data_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_versions ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (server-side only)
CREATE POLICY IF NOT EXISTS "service_role_all_cache" ON public.data_cache FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_role_all_schedules" ON public.report_schedules FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_role_all_api_keys" ON public.api_keys FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_role_all_webhooks" ON public.webhooks FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_role_all_versions" ON public.report_versions FOR ALL USING (true);

-- Authenticated users can see their own schedules
CREATE POLICY IF NOT EXISTS "user_own_schedules" ON public.report_schedules
  FOR SELECT USING (auth.jwt() ->> 'email' = email);

-- Authenticated users can see their own report versions
CREATE POLICY IF NOT EXISTS "user_own_versions" ON public.report_versions
  FOR SELECT USING (auth.jwt() ->> 'email' = email);
