CREATE TABLE IF NOT EXISTS [references] (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT NOT NULL,
  year INTEGER,
  doi TEXT,
  isbn TEXT,
  journal TEXT,
  publisher TEXT,
  source TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 1,
  raw TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doi ON [references](doi) WHERE doi IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_isbn ON [references](isbn) WHERE isbn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_source ON [references](source);
CREATE INDEX IF NOT EXISTS idx_created_at ON [references](created_at);
