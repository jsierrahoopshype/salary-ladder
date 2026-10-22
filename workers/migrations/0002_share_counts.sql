-- Share tagging (HoopsMatic Badges game contract, requirement 7): games
-- started from a share link (?ref=share-salaryladder-<channel>), as a total
-- per day, game and channel. No device ID, no IP address, nothing per game.
CREATE TABLE share_counts (
  day     TEXT NOT NULL,           -- game day (9 AM ET), YYYY-MM-DD
  game    TEXT NOT NULL,           -- salaryladder
  channel TEXT NOT NULL,           -- x | bsky | fb | wa | reddit | tg | copy
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, game, channel)
);
