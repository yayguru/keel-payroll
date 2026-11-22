CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  handle TEXT NOT NULL,
  country TEXT NOT NULL,
  token TEXT NOT NULL,
  wallet TEXT NOT NULL UNIQUE,
  tasks TEXT NOT NULL,
  answers TEXT NOT NULL,
  consent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  amount_usd TEXT,
  amount_local TEXT,
  tx_hash TEXT,
  paid_at TEXT,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_sub_status ON submissions(status);
CREATE TABLE IF NOT EXISTS hits (ip_hash TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_hits ON hits(ip_hash, ts);
