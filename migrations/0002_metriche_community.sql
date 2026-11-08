CREATE TABLE community_items (
  source_id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('comment','message')),
  post_id TEXT,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','replied')),
  fetched_at INTEGER NOT NULL
);
CREATE INDEX community_items_status_idx ON community_items (status, created_at);
CREATE INDEX community_items_post_idx ON community_items (post_id, created_at);
--> statement-breakpoint
CREATE TABLE metric_snapshots (
  post_id TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  reactions INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, captured_at)
);
