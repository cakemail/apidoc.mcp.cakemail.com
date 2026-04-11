-- ABOUTME: Adds an account_id column to query_logs for tracking per-account usage.
-- ABOUTME: Populated from the JWT's account_id claim during tool call logging.

-- Add account_id column to track which Cakemail account the user was operating on
alter table query_logs add column if not exists account_id text;

-- Index for filtering by account
create index if not exists query_logs_account_id_idx on query_logs (account_id);
