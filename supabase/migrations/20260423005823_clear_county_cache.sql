-- Wipe county_search_cache: previous entries were polluted by an EPA query bug
-- (4-filter URL returned an error JSON, was treated as "0 rows", or returned 500
-- statewide rows due to silently-ignored county filter). Force fresh fetches.
DELETE FROM public.county_search_cache;
