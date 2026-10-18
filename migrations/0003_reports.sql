-- Content reports. A report never changes or hides content: an admin reviews it first.
-- reporter_key is 'a:<account id>' or 'g:<salted ip hash>' and never leaves the Worker.
CREATE TABLE reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type  TEXT    NOT NULL CHECK (target_type IN ('review','suggestion')),
  target_id    INTEGER NOT NULL,
  reason       TEXT    NOT NULL CHECK (reason IN ('spam','harassment','inappropriate','misleading','other')),
  note         TEXT,
  reporter_key TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed')),
  created_at   INTEGER NOT NULL
);
-- One report per person per item (a dismissed one still counts, so a dismissed report cannot be re-filed).
CREATE UNIQUE INDEX reports_one_per_reporter ON reports (target_type, target_id, reporter_key);
CREATE INDEX reports_open ON reports (status, target_type, target_id);
CREATE INDEX reports_by_reporter ON reports (reporter_key, created_at);
