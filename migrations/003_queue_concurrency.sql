-- =============================================================================
-- Migration 003: Queue Concurrency & Lease Optimization
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_publications_concurrency_lease 
ON publications(channel_id, status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_jobs_active_historical
ON jobs(status, is_historical);
