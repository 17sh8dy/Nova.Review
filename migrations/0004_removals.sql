-- A notice that a moderator removed someone's review or suggestion, shown only to that person
-- (accounts only: a guest has no way to come back and read it). reason is optional.
CREATE TABLE removals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT    NOT NULL,
  product    TEXT    NOT NULL,
  kind       TEXT    NOT NULL CHECK (kind IN ('review','suggestion')),
  title      TEXT    NOT NULL,
  reason     TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX removals_by_account ON removals (account_id, created_at DESC);
