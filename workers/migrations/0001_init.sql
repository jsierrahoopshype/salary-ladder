-- Salary Ladder game-check database (Cloudflare D1). Spec 13, 14, 18.
-- Applied by the deploy Action (wrangler d1 migrations apply). Never edit a
-- migration once merged; add a new numbered file instead.

-- One-time game codes (spec 13.1 step 5): the verified result of each game,
-- so the same game sent again gets the same answer. Kept 48 hours.
CREATE TABLE codes (
  code       TEXT PRIMARY KEY,
  picks_hash TEXT NOT NULL,
  result     TEXT NOT NULL,          -- JSON of the verified result
  created    INTEGER NOT NULL        -- ms, server time of the first finish
);
CREATE INDEX codes_created ON codes (created);

-- Game records (spec 14.1): one per verified game, no user or device ID.
-- Kept 7 days, then deleted once the daily totals job has counted them.
CREATE TABLE games (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,
  mode       TEXT NOT NULL,          -- 'daily' | 'unlimited'
  day        TEXT NOT NULL,          -- game day (9 AM ET), YYYY-MM-DD
  season     TEXT NOT NULL,
  rv         INTEGER NOT NULL,       -- rules version
  data_date  TEXT NOT NULL,          -- salary-data date
  score      INTEGER NOT NULL,
  rung       INTEGER NOT NULL,
  total_ms   INTEGER NOT NULL,
  lives_used INTEGER NOT NULL,
  finished   INTEGER NOT NULL,
  -- JSON [[incumbent, incumbentSalary, challenger, challengerSalary,
  --        choice 0/1/2, correct 0/1, vote 0/1], ...]
  picks      TEXT NOT NULL,
  contract   INTEGER,                -- NBA ID picked in "Which contract would you rather have?"
  created    INTEGER NOT NULL
);
CREATE INDEX games_day ON games (day, id);
CREATE INDEX games_mode_day ON games (mode, day);

-- Score counts per mode and day for "Higher than X% of today's players"
-- (spec 9), rebuilt every 5 minutes from the game records.
CREATE TABLE score_dist (
  mode    TEXT NOT NULL,
  day     TEXT NOT NULL,
  counts  TEXT NOT NULL,             -- JSON [[score, games], ...]
  total   INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (mode, day)
);

-- Totals (spec 14.2), kept. A is always the lower NBA ID.
CREATE TABLE pair_totals (
  season TEXT NOT NULL, rv INTEGER NOT NULL, data_date TEXT NOT NULL,
  a INTEGER NOT NULL, sa INTEGER NOT NULL, b INTEGER NOT NULL, sb INTEGER NOT NULL,
  shown INTEGER NOT NULL, picked_a INTEGER NOT NULL, picked_b INTEGER NOT NULL,
  correct INTEGER NOT NULL, timeouts INTEGER NOT NULL,
  PRIMARY KEY (season, rv, data_date, a, sa, b, sb)
);
CREATE TABLE contract_totals (
  season TEXT NOT NULL, rv INTEGER NOT NULL, data_date TEXT NOT NULL,
  a INTEGER NOT NULL, sa INTEGER NOT NULL, b INTEGER NOT NULL, sb INTEGER NOT NULL,
  prefer_a INTEGER NOT NULL, prefer_b INTEGER NOT NULL,
  PRIMARY KEY (season, rv, data_date, a, sa, b, sb)
);
CREATE TABLE gap_totals (
  season TEXT NOT NULL, rv INTEGER NOT NULL, gap TEXT NOT NULL,  -- '0-2' ... '8-10', '10+'
  right_ INTEGER NOT NULL, wrong INTEGER NOT NULL, timeouts INTEGER NOT NULL,
  PRIMARY KEY (season, rv, gap)
);
CREATE TABLE accuracy_totals (
  season TEXT NOT NULL, rv INTEGER NOT NULL, mode TEXT NOT NULL,
  bucket INTEGER NOT NULL,           -- accuracy rounded down to 5 points, games with 20+ picks
  games INTEGER NOT NULL,
  PRIMARY KEY (season, rv, mode, bucket)
);

-- Where the totals job is for each day, so it can stop and pick up again
-- without counting anything twice.
CREATE TABLE job_state (
  day     TEXT PRIMARY KEY,
  last_id INTEGER NOT NULL,
  done    INTEGER NOT NULL
);
