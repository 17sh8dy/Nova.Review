-- PRIVACY: account_id, author_hash and voter_key never leave the Worker. Public responses are
-- built from explicit column lists (see worker/index.ts), not SELECT *.

-- One row per Nova Account that has used the site. display_name is a cache of the Nova name,
-- refreshed on every signed-in request; the account itself lives in Nova.Help.
CREATE TABLE profiles (
  account_id        TEXT PRIMARY KEY,
  display_name      TEXT,
  notify            INTEGER NOT NULL DEFAULT 1,
  default_show_name INTEGER NOT NULL DEFAULT 1,
  updated_at        INTEGER NOT NULL
);

-- Written by a Nova Account (account_id set) or a guest (author_hash set, guest_name optional).
CREATE TABLE reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product     TEXT    NOT NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       TEXT    NOT NULL,
  body        TEXT    NOT NULL,
  account_id  TEXT,
  guest_name  TEXT,
  author_hash TEXT,
  show_name   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  edited_at   INTEGER,
  CHECK ((account_id IS NOT NULL) <> (author_hash IS NOT NULL))
);
CREATE UNIQUE INDEX reviews_one_per_account ON reviews (product, account_id) WHERE account_id IS NOT NULL;
CREATE UNIQUE INDEX reviews_one_per_guest   ON reviews (product, author_hash) WHERE author_hash IS NOT NULL;
CREATE INDEX reviews_by_product ON reviews (product, created_at DESC);
CREATE INDEX reviews_by_account ON reviews (account_id);

CREATE TABLE suggestions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product     TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  body        TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open','planned','in_progress','done','declined')),
  account_id  TEXT,
  guest_name  TEXT,
  author_hash TEXT,
  show_name   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  CHECK ((account_id IS NOT NULL) <> (author_hash IS NOT NULL))
);
CREATE INDEX suggestions_by_product ON suggestions (product, created_at DESC);
CREATE INDEX suggestions_by_account ON suggestions (account_id);

-- voter_key is 'a:<account id>' or 'g:<salted ip hash>'. One vote per voter per suggestion.
CREATE TABLE votes (
  suggestion_id INTEGER NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  voter_key     TEXT    NOT NULL,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (suggestion_id, voter_key)
);
CREATE INDEX votes_by_voter ON votes (voter_key, created_at);

-- Account-only. kind = 'status'.
CREATE TABLE notifications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    TEXT    NOT NULL,
  kind          TEXT    NOT NULL,
  product       TEXT    NOT NULL,
  suggestion_id INTEGER,
  message       TEXT    NOT NULL,
  read          INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX notifications_by_account ON notifications (account_id, created_at DESC);
