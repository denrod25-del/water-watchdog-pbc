-- County search cache: stores EPA SDWIS results per (state, county) for 7 days
CREATE TABLE public.county_search_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL,
  county_name text NOT NULL,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  system_count integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (state_code, county_name)
);

CREATE INDEX idx_county_cache_lookup
  ON public.county_search_cache (state_code, county_name);

ALTER TABLE public.county_search_cache ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read any cached search (results are non-sensitive public data)
CREATE POLICY "Authenticated users can read cache"
  ON public.county_search_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- No client-side write policies: writes happen server-side via the service role
-- (which bypasses RLS), keeping the cache tamper-proof from clients.

CREATE TRIGGER update_county_search_cache_updated_at
  BEFORE UPDATE ON public.county_search_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();