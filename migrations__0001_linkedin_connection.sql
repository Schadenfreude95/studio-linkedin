CREATE TABLE linkedin_connections (
  user_id TEXT PRIMARY KEY NOT NULL,
  member_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  token_cipher TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  scopes TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE linkedin_oauth_states (
  state TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
