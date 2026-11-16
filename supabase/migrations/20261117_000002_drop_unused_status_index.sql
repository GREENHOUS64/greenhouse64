-- The admin inbox currently sorts by created_at only; no query filters by status.
-- Drop the unused composite index flagged on the freshly deployed project.
drop index if exists public.lead_requests_status_created_idx;
