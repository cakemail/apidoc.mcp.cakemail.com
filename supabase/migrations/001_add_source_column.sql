-- ABOUTME: Adds a source column to the shared query_logs table.
-- ABOUTME: Run this on the kb.mcp Supabase project to support multi-server logging.

-- Add source column to distinguish which MCP server generated the log
alter table query_logs add column if not exists source text not null default 'kb';

-- Backfill: all existing rows came from the kb server
update query_logs set source = 'kb' where source = 'kb';

-- Index for filtering by source
create index if not exists query_logs_source_idx on query_logs (source);
