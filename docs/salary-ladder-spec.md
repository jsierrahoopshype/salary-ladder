# Salary Ladder: game spec

**Status:** APPROVED by Jorge on October 8, 2026, with the section 27 answers folded in. Building starts only after the build plan (`docs/salary-ladder-build-plan.md`) is approved.
**Written:** October 8, 2026, from the design interview.
**Data counts as of:** Salary Finder `data.json` built 2026-10-07 19:43 UTC (commit `72f9a98`); nba-headshots player index generated 2026-07-28.

Plain-English rules for every part of the game. A developer should be able to build it from this document without guessing. Section 27 records how each item left open during the interview was settled.

---

## 1. The game in one paragraph

Two NBA players are on screen: the **incumbent** (your current rung) and a **challenger**. You tap the one you think makes more money in 2026-27. If you pick the incumbent and you're right, you stay on the same rung. If you pick the challenger and you're right, he becomes the new incumbent and you climb. A wrong pick, or running out of the 8 seconds, costs one of your 5 lives. You start near the bottom of the salary ladder and try to reach the highest-paid player. Your score is the salary of your last incumbent. There is a Daily version (the same ladder for everyone each day) and an Unlimited version. Every answer also quietly adds to anonymous vote totals that show which players fans think are paid more or less than they really are, for the HoopsMatic Trade Machine.

---

## 2. Name, address, search engines

- **Name:** Salary Ladder
- **Address:** https://hoopsmatic.com/salary-ladder/
- **Canonical tag and og:url:** `https://hoopsmatic.com/salary-ladder/`. Never `jsierrahoopshype.github.io`.
- **Sitemap:** the page is listed in a sitemap with an accurate `<lastmod>`. The date changes only when the page itself changes (its HTML, title, description or how-to-play text). Daily puzzle data changing does **not** change `<lastmod>`. The build follows whatever pattern the other HoopsMatic games use: either an entry in the existing sitemap or a small `https://hoopsmatic.com/salary-ladder/sitemap.xml`. Either way, the sitemap must be listed in https://hoopsmatic.com/robots.txt and submitted in Google Search Console (https://search.google.com/search-console).
- **No new third-party scripts, fonts or embeds.** Headshots and logos load from Jorge's own nba-headshots GitHub Pages site (already used by other HoopsMatic tools). Any other outside resource must be flagged to Jorge first.

---

## 3. Modes and what ships first

| Mode | Season data | Ships |
|---|---|---|
| Daily | 2026-27 salaries | **First release** |
| Unlimited | 2026-27 salaries | **First release** |
| Daily, career earnings | Career earnings through 2025-26 | Later (section 22) |
| Unlimited, career earnings | Career earnings through 2025-26 | Later (section 22) |

Daily and Unlimited follow the same ladder rules (section 6), lives, timer and scoring. They differ only in how the start player and challengers are chosen (sections 10 and 11) and which leaderboards they feed (section 12).

---

## 4. Data sources and player matching

### 4.1 Sources (all read-only; this game never writes to them)

- **Salaries:** https://github.com/jsierrahoopshype/salary-season-finder, file `data/data.json`. It's rebuilt daily at 06:00 UTC by that repo's GitHub Action. Read from `https://raw.githubusercontent.com/jsierrahoopshype/salary-season-finder/main/data/data.json`.
- **Roster status (new file, launch blocker):** `data/roster_status.json` in the same repo, added in a separate Salary Finder session with Jorge's OK. It gives each player's current team, contract type and birth date. Spec in section 25.
- **Headshots:** https://github.com/jsierrahoopshype/nba-headshots. It provides the player index (`players/metadata/players_all.json`) and the tight face crops in `players/headshots/face-tight/` (file name `{nba_id}-{slug}.webp`). Images are served from `https://jsierrahoopshype.github.io/nba-headshots/players/headshots/face-tight/{nba_id}-{slug}.webp`.

### 4.2 Matching players (by NBA ID, never by name alone)

`data.json` has **no NBA ID**. Its stats sheet's "NB CODE" column is a name too. Players are linked to NBA IDs (and so to headshots) like this:

1. **Automatic match only when all three are true:**
   - exactly one person in the NBA's full player list (5,127 players, in nba-headshots `legends.json` plus `players_all.json`) has that name, after removing accents, punctuation and capital letters;
   - the NBA ID's era fits the player's first season (NBA IDs are handed out roughly in order, so a 2022 rookie can't have a 1970s ID);
   - no other salary-data name already claims the same NBA ID.
2. **Everything else goes through a hand-checked list** in this repo, `data/crosswalk.json` (salary name → NBA ID, with a note on who approved it and when). A small `data/exclude.json` lists names that must never be matched.
3. **A new name that matches nothing safely is left out of the game** (never guessed), and the daily job opens a GitHub issue in this repo listing it for Jorge to review.
4. **Fuzzy spelling matching is never automatic.** In testing it paired "Marcus E. Williams" with Marvin Williams and "Brice Williams" with Brandon Williams.

**Father/son traps already found.** The salary data drops "Jr." on some names:
- "Jabari Smith" matches the father (NBA ID 2074) by name, but the money belongs to Jabari Smith Jr. (1631095).
- "Kevin Porter" matches Kevin Porter Sr. (77876), but the money belongs to Kevin Porter Jr. (1629645).
- "Tim Hardaway" and "Jaren Jackson" in the 1990s are the fathers.

The crosswalk handles all of these.

**Data issue to pass to the Salary Finder owner (not fixed here):** Cam Whitmore appears under two spellings. His 2024-25 row is filed as "Cameron Whitmore", which splits his career total ($6.76M shown, $10.14M actual). The crosswalk merges both spellings into NBA ID 1641715.

The approved crosswalk entries are listed in section 24.

### 4.3 2026-27 counts (high confidence)

- **638** players have a 2026-27 salary in `data.json`. **524** of them have a face-tight headshot.
  - How the 524 were matched: 513 automatic; 2 father/son fixes; 1 settled by era (Brandon Williams); 4 approved spelling fixes (Nic Claxton, Santi Aldama, Herbert Jones, Svi Mykhailiuk); 4 approved hand entries (Dennis Schröder, Ronald Holland II, Bub Carrington, Brandon "BJ" Boston).
  - **The 114 without a headshot:**
    - **105 on their first NBA contract**, 28 of them two-way. That's the 2026 draft class (AJ Dybantsa, Darryn Peterson, Cameron Boozer…), undrafted rookies, and a few older first-timers like Alpha Diallo and Khalifa Diop.
    - **9 who were paid before:** Hayden Gray, Gabe McGlothan, Bez Mbeng, Phillip Wheeler, Malik Williams, Tyreke Key, Vasilije Micic, David Jones, Malachi Smith.
    - Cause: nba-headshots was last refreshed in July and its player list dates from Nov 2025. **Launch blocker:** refresh nba-headshots in its own session.
- **Across the 524:**
  - Lowest is $75,000 (Ethan Thompson, a partial or waived amount); highest is $62,587,158 (Stephen Curry).
  - Most common is $678,882, shared by 49 players (all two-way). There are 308 different amounts.
- **Game pool after the section 5 rules: about 448 players** (measured with a stand-in for the new roster file, so it will move slightly).
  - Lowest is $1,357,763 (rookie minimum); highest is $62,587,158 (Curry).
  - Biggest groups of identical salaries: $3,876,529 (17 players), $2,449,421 (16), $2,625,627 (12), $2,296,271 (11), $2,150,917 (10), $2,537,526 (10).
- **Two-team players count only the team they play for now.** Examples: Damian Lillard $13,398,800 (Portland; `data.json` adds Milwaukee's dead money for $35.9M), Bradley Beal $6,424,800 (Clippers), Klay Thompson $5,600,000 (Miami).
- **The headshot index's team is out of date** for 169 of the 524. The game always takes the team from the salary data or roster file, never from the headshot index.

---

## 5. Player pool rules (2026-27)

A player is in the pool when **all** of these are true:

1. He has a 2026-27 salary in `data.json`.
2. `roster_status.json` gives him a **current team**, and his contract type is anything other than `two_way` or `dead_money_only`. `unknown` counts as in if he has a current team.
3. He's matched to an NBA ID under section 4.2.
4. A face-tight headshot exists for that NBA ID.

**His salary for the game is `current_salary`:** what his current team pays him, with no dead money from former teams.

How each kind of player is handled:

| Player type | In or out | Notes |
|---|---|---|
| Minimum-salary veterans | In | Ties with identical amounts are never paired (section 6). |
| Rookie minimum ($1,357,763) | In, but **never shown** | Nobody else is within 10% of them, so they can't come up. 2 players today. |
| Rookie-scale contracts | In | |
| Non-guaranteed and partially guaranteed | In | Waived players drop out at the next daily update. |
| Two-way contracts | **Out** | Also unreachable anyway: all at the same $678,882. |
| Waived, paid only dead money | **Out** | e.g. Ricky Rubio, Didi Louzada today. |
| Waived and re-signed elsewhere | In, at the new team's amount only | |
| No current team | **Out** | |
| 2026 rookies | In once nba-headshots has their face | |
| 10-day contracts (mid-season) | In if the roster file gives a current team and a non-excluded contract type | |

---

## 6. Ladder rules

### 6.1 The challenger

- **Coin flip every pick:** 50% of the time the challenger earns more than the incumbent, 50% of the time less. Never tilted.
- **Band:** the challenger's salary is between 90% and 110% of the incumbent's.
- **Exact ties are never paired.** A challenger with exactly the incumbent's salary is never drawn.
- **No repeats:** a player shown in the last 10 picks isn't drawn again unless nobody else fits.
- **Empty side:** if the coin says "richer" but nobody richer is inside the band, the band widens just enough to include the next richer salary. The same goes for "poorer". If there's nobody poorer at all, the challenger is richer. (In testing with today's data, the band never ran dry on the way up.)
- The incumbent is never his own challenger.

### 6.2 Start

- **Every game starts on a low-rung player** drawn from those who:
  - sit between the 5th and 25th percentile of the pool's salaries, **and**
  - have at least 15 other players with a different salary within ±5% of theirs.
- Today that's **87 possible starters at 19 different amounts, from $2,296,271 to $2,880,960.** The window is recalculated each day from the current pool.
- **Daily:** one start player for everyone, fixed in the day's puzzle file.
- **Unlimited:** a new random start every game.

### 6.3 Climbing and the finish line

- Picking the challenger correctly: he becomes the incumbent and you go up one **rung**. The rung count is the number of climbs.
- Picking the incumbent correctly: you stay.
- You never move down, so your last incumbent is always the highest point you reached.
- **Finish:** the game ends in a win the moment your incumbent is the highest-paid player in the pool (Stephen Curry, $62,587,158, today). If several players are ever tied at the top salary, reaching any of them counts as the top.
- **Length** (simulated, a player who never misses): a median of **66 climbs** (61–72) and **132 picks** (114–151) from start to top.

---

## 7. Lives, timer, game over

- **5 lives.** You lose one for a wrong pick or for running out of time. At 0 lives the game is over.
- **8-second timer on every pick.** The clock starts only once the challenger card is fully on screen (after the reveal animation) and stops at the tap. A timeout counts as 8,000 ms and costs a life.
- **When you lose a life:** the reveal still shows both salaries, the losing card is marked with ✗ (and colour), one heart empties, and play continues with a new challenger after the reveal.
- **Game over:** the end screen (section 9).
- **The timer keeps running if you switch apps or tabs.** It can't be paused; pausing would allow looking salaries up.
- **Reloading or closing the page in the middle of a pick counts that pick as a timeout** (life lost). Then the game resumes from the saved state, so reloading can't be used to escape a hard pick.
- **Daily and Unlimited use identical lives and timer.**
- **Changing lives later:** only through the rules file (section 15). Lives may only be raised during a season, and may be reset only at the start of a new salary season.

---

## 8. What the cards show, and the reveal

**Each card shows:**
- the headshot (face-tight crop),
- the player's name,
- his current team,
- his position,
- his **age**, worked out on the day from `birth_date` in the roster file.

**Never shown during play, because each one gives the answer away:**
- salary,
- years in the league (for minimum contracts, years in the league sets the salary exactly),
- draft pick (it sets rookie-scale pay),
- contract type, cap percentage, salary rank, contract length.

**The reveal after each pick:**
- Both salaries appear, plus the gap in dollars and percent (e.g. "+$1.2M (+4.1%)").
- A ✓ or ✗ shows the result, with colour, but never colour alone.
- **It moves on automatically after 1.5 seconds.** The reveal time is not part of the 8 seconds.
- Money is written with 3 significant figures: $2.45M, $31.4M, $62.6M.

---

## 9. Score, end screen, share card

- **Score:** the salary of your last incumbent.
- **Ties are broken by total time** (the sum of every pick's time), fastest first. If both are identical to the millisecond, the earlier submission ranks higher.
- **The end screen shows:**
  - the score ("You reached $31.4M"), the player you reached, the rung, lives left and total time;
  - **"Higher than X% of today's players"** for that mode. It counts players below you plus half of those tied, out of everyone who played that mode today. It's refreshed every 5 minutes from the day's game records. Below 50 games it says "early numbers".
  - **Personal best**: your highest dollar score ever **in this mode** (one for Daily, one for Unlimited), with "New personal best!" when you beat it;
  - **the leaderboard prompt**: enter a display name to appear on the board (section 12);
  - **one optional tap: "Which contract would you rather have?"** comparing the last two players you saw (section 14);
  - the share button, and for Daily a link to play Unlimited.
- **Share card** (no player names, so it never spoils the day):

  ```
  Salary Ladder #12 · Oct 9
  I reached $31.4M (rung 34)
  ❤️❤️❤️🖤🖤 · 3:12
  https://hoopsmatic.com/salary-ladder/
  ```

  `#12` is the Daily number (#1 = launch day). For Unlimited the first line reads "Salary Ladder · Unlimited".

---

## 10. Daily mode

- **Reset:** 9:00 AM US Eastern, following US daylight saving (13:00 UTC in summer, 14:00 UTC in winter). That's the same as the Daily 73-9. "Today's" Daily runs from 9:00 AM ET to 9:00 AM ET the next day.
- **One official play per device per Daily.** After it ends, the page shows the end screen and points to Unlimited.
- **Same ladder for everyone:**
  - Each day has one frozen puzzle file, `daily/YYYY-MM-DD.json`. It holds the date, the Daily number, the rules version, the start player, a random seed, and the full pool with that day's salaries, teams, positions and birth dates.
  - Each challenger is chosen from the seed, the pick number and the current incumbent, so anyone making the same choices sees the same players.
- **Frozen all day:**
  - The puzzle file is built in the morning from that day's salary data and never rewritten. The build refuses to overwrite an existing daily file.
  - A trade or waiver later in the day shows up in the next day's puzzle.
  - The end screen says "Salaries as of Oct 8".
- **Streak:**
  - The number of Daily days in a row you've played; finishing isn't required.
  - A Daily counts once its game ends, by finishing or game over.
  - Missing a Daily day resets the streak to 0. Days follow the 9 AM ET boundary.
  - Kept only in the browser.
- **"Streak at stake" line** (copied from the Daily 73-9): on the intro screen, when you have an active streak and haven't played today's Daily, e.g. "🔥 5-day streak at stake".
- **No archive of past Dailies at launch.** The saved puzzle files make one easy to add later.

---

## 11. Unlimited mode

- New game any time.
- Each game gets a random start from the start window (section 6.2) and a server-issued random seed (section 13).
- **Salaries:** the newest daily data copy at the moment the game starts. A game in progress keeps its data even if a newer copy arrives; the next game uses the newest.
- It feeds the Unlimited Daily, Weekly, Monthly and All-time boards (section 12).

---

## 12. Leaderboards and display names (copied from the Daily 73-9)

### 12.1 Boards

| Mode | Boards |
|---|---|
| Daily | Daily board (one per Daily) |
| Unlimited | Daily, Weekly, Monthly, All-time |

- **All boundaries are at 9:00 AM Eastern.** Daily turns over each day. Weekly runs from Monday 9:00 AM ET. Monthly runs from the 1st at 9:00 AM ET. All-time counts since launch.
- All-time entries are labeled with their season ("2026-27"), because the pool and the lives can change between seasons.
- Ranking is by score, then total time (section 9).
- **Display: top 50 rows per board** (same as the Daily 73-9), plus your own rank if you have a name and you're outside the top 50.
- **Money on the boards is shown as "$31.42M"** (two decimals) next to total time. Sorting always uses the exact dollar amount.

### 12.2 Names (name-gated boards)

- **Only named scores appear on a board.** You must enter a display name (2 to 24 characters) and can add an optional @handle (cleaned of unsafe characters). Anonymous play still counts toward the end-screen percentage and the vote totals, but never appears on a board.
- **One name per device.**
- **Claiming a name later back-credits that day's best score.** The device keeps its own best verified game of the day for each mode (the start ticket plus the list of picks). When a name is claimed, the page re-sends that game, the server re-checks it, and the result is posted. **The device ID never leaves the device.**
- **The name filter:**
  - leet-speak is normalised before checking;
  - slurs are blocked anywhere in the name;
  - other bad words are blocked only as standalone words (so names like "Van Dyke" pass);
  - reversed spellings are checked;
  - acrostic attacks (offensive words spelled by the first letters of names stacked down the board) are hidden when the board is served;
  - elongated spellings are caught with pattern rules, not exact lists.
- **One board row per name.** The same @handle means the same person. Names that differ only by trailing digits (lemontree1, lemontree2) collapse into one row. The row keeps that person's best score.
- **Admin "scrub" endpoint** (needs the admin key): hides a name everywhere, survives redeploys, and can be undone.
- **Admin endpoint to remove entries.**
- **No manual score insertions**, even with screenshot evidence. Verification is the only way onto a board.

### 12.3 Code to copy

The two 73-9 Workers aren't in a GitHub repo. Jorge attaches them at build time (launch checklist, section 26). Salary Ladder copies their behaviour and their layout:
- a **game-check Worker** (replays and verifies games, issues signed result tokens);
- a **leaderboard Worker** that stores rows in one Durable Object (a single Cloudflare storage unit), so updates can't collide.

Salary Ladder gets **its own signing secret and its own admin key**, never 73-9's, so a leak in one game can't fake scores in the other.

---

## 13. Verification and anti-cheating

### 13.1 Flow

1. **Start:** when a game starts, the page asks the game-check Worker for a **start ticket**. The ticket is signed with HMAC-SHA256 and holds:
   - mode, date, rules version and salary-data date;
   - the server's start time;
   - a one-time random code;
   - for Unlimited, a random seed chosen by the server.

   Nothing is stored at this step.
2. **Finish:** when the game ends, the page sends the ticket plus the pick list (for each pick: which card was tapped, and the milliseconds taken; a timeout is recorded as 8,000).
3. **Replay:** the server loads the frozen puzzle file (Daily) or that day's saved salary copy (Unlimited). It re-plays every pick with the **same shared game code the page uses**: it rebuilds each challenger from the seed, re-checks every answer, counts the lives, and confirms the final score.
4. **Time rules.** The score is rejected if any of these fail:
   - a pick over 8,000 ms that wasn't recorded as a timeout;
   - a pick under **300 ms** (the fastest human reactions are about 200–250 ms, before even reading two names);
   - an average under **700 ms** per pick across the game;
   - a total time longer than the time that really passed on the server between the start ticket and the first finish call.
5. **Result token:** if the game passes, the server saves the one-time code with the verified result (kept 48 hours) and returns a **signed result token** (HMAC-SHA256, short expiry, single use) that describes exactly that score and time.
   - Sending the same game again returns the same result, which is what lets the device re-send its game later.
   - A different game sent with an already-used code is rejected.
6. **Leaderboard:** only accepts a score carrying a valid result token for exactly that score.
   - **High scores without a valid token are rejected outright.**
   - If the token has expired while the player types a name, the page quietly re-verifies (step 2 again with the saved game) before submitting, so slow typers aren't punished.
   - If verification fails, the player sees: "Score not verified, retry".

### 13.2 What this can't stop (accepted)

- A helper script that reads the public salaries and answers perfectly at human speed.
- Replaying the Daily in a private window to learn the answers, then submitting the good run.

Without accounts these can't be told apart from real play. The replay check stops **fake** scores; the admin tools handle the rest.

### 13.3 Privacy of verification

No IP addresses are stored. The one-time codes are random and expire after 48 hours. The device ID stays on the device and is never shown publicly or sent to the server.

---

## 14. Data for the Trade Machine

Everything is stored only as **totals**, with no user IDs and no device IDs.

### 14.1 What each game record holds (one record per verified game)

- mode, date, rules version, salary-data date;
- final score, rung, total time, lives used;
- each pick as (incumbent NBA ID + salary, challenger NBA ID + salary, which was tapped, right/wrong/timeout, gap size);
- the optional "Which contract would you rather have?" answer.

**One vote per pair per device:** the device remembers which pairs (both NBA IDs plus both salaries) it has already voted on, and leaves repeats out of the record. If a salary changes, the pair counts as new.

### 14.2 Totals built once a day

A scheduled job runs once a day after the 9 AM ET reset. It adds the day's records into:

- **Pair totals**, keyed by (season version, salary-data date, player A + salary, player B + salary), where A is the lower NBA ID. Counts: times shown, picked A, picked B, correct, timeouts.
  - Because both salaries are in the key, every vote carries the amounts actually shown. That answers "who do fans think is paid more than he really is" with the salaries as they were.
- **Contract preference totals** (the end-screen question): pair + which contract was preferred.
- **Accuracy by gap size** (0–2%, 2–4%, 4–6%, 6–8%, 8–10%): right / wrong / timeout counts. Used to calibrate lives (section 15).
- **Accuracy per game:** how many games ended at each accuracy level (5-point buckets, games with 20+ picks). This shows how good the best players are, which is what decides the finish rate.

Raw game records are kept 7 days (for re-verification and abuse checks), then deleted. Totals are kept.

### 14.3 Getting the data out

An admin-key endpoint downloads the totals as CSV. That is how the Trade Machine gets the data for now; an automatic feed can come later.

---

## 15. Rules file and changing settings after launch

- **One rules file in this repo**, `rules/rules.json`, holds: version, lives, band, timer seconds, the start window (percentiles and minimum neighbours), and `recording: on/off`.
- Changing a setting means editing this file, with no code change. The "How to play" text reads from the same file.
- **Each Daily puzzle copies the settings in force when it's built**, so a change takes effect at the next Daily. Unlimited picks it up at the next page load; a game in progress keeps its settings.
- **Every stored total and every board entry carries the rules version**, so numbers from before and after a change never mix.
- **Policy:**
  - Change one setting at a time, at most once a week, and only after at least 5,000 games.
  - **Lives may only go up during a season** and may be reset only at the start of a new salary season.
  - **The band stays at ±10%**: changing it changes the ladder length.
- **Calibration:**
  - Real accuracy comes from the section 14.2 totals.
  - The simulator used to write this spec is committed as `tools/simulate.py`. Feed it the real accuracy-per-game numbers and it predicts the finish rate for any number of lives, in days rather than the months it would take to count real finishers.
- **Target:** about 1 in 1,000 players reaches the top. With 5 lives that needs the best players to be right about **89%** of the time on salaries within 10% of each other (section 23). Jorge's view: regulars will learn the ~448-player pool over the season, so that is realistic. Measure after launch.

---

## 16. Saving on the device (browser storage only)

Kept on the device, never sent to the server unless stated:

- **Streak:** current streak, last Daily played.
- **Personal bests:** highest dollar score, one for Daily and one for Unlimited.
- **Display name and @handle:** sent only when submitting to a board.
- **Device ID:** random. Never sent and never shown.
- **Today's best verified game per mode** (start ticket + pick list): re-sent only for back-credit or re-verification.
- **List of pairs already voted:** used to leave repeat votes out of the game record.
- **An in-progress game:** for the reload rule in section 7.

Every read and write is wrapped so the game still works if the browser blocks storage (for example in private mode). In that case streaks and personal bests just aren't remembered.

---

## 17. Keeping salaries fresh

1. **Daily job in this repo (GitHub Action), 07:30 UTC:**
   - It checks that the Salary Finder's `data.json` (and `roster_status.json`) say they were built today.
   - If not, it retries until about 10:00 UTC. Then it keeps yesterday's data and opens a GitHub issue.
2. **It builds a small dated copy of the pool**, about 45 KB, e.g. `data/snapshots/2026-27/2026-10-08.json`, with only what the game needs: NBA ID, display name, team, position, birth date, game salary. **Dated copies are kept forever**; they're what verification and the Trade Machine totals rely on.
3. **Safety checks before publishing.** It refuses to publish, keeps yesterday's copy and opens an issue if:
   - the pool size changed by more than 10% from yesterday;
   - the top salary changed without a matching roster change;
   - the money doesn't add up: current salary plus dead money must equal `data.json`.

   New unmatched names are left out and listed in an issue.
4. **It builds today's Daily puzzle** from that copy, about 5 hours before the 9 AM ET release. If today's data never arrived, it builds from yesterday's copy so a Daily always exists. It never overwrites an existing puzzle file.
5. **Trades and waivers:**
   - A traded player shows his new team from the next copy on.
   - A waived player who signs elsewhere counts only his new contract.
   - A waived player left with only dead money drops out.
   - Nothing changes inside a Daily that has already been built.
6. **Preseason note:** today is October 8; the season starts around October 20. Non-guaranteed players (72 today) will be cut over the next two weeks. The daily update handles that automatically.

---

## 18. Hosting, Workers, cost and protecting hoopsmatic.com

### 18.1 Hosting

- **The game page** is served by this repo on GitHub Pages, at https://hoopsmatic.com/salary-ladder/ through the shared hoopsmatic.com Worker.
- **Shared Worker change:** adding the `/salary-ladder/` route touches the shared Worker (https://github.com/jsierrahoopshype/hoopsmatic-worker), which Jorge shares with Alberto. **The build prompt for that step must start by checking exactly where the Worker stands:** main's latest commit, recent merges, open PRs, unmerged branches, and deploy status. **Never deploy anything that isn't pushed first.**
- **The game's own server code runs in its own Workers** (game-check and leaderboard), on the route `hoopsmatic.com/salary-ladder/api/*`, deployed separately from the shared Worker. A crash in game code can't break the rest of the site.
- **Deploys happen only through GitHub Actions, never from anyone's computer.**
  - The shared Worker already deploys through its own Action when a change is merged to its `main`.
  - The game's two Workers deploy through an Action in this repo whenever `workers/` or the shared game logic changes on `main`.
  - Merging is the deploy; nothing unmerged is ever deployed.
- **Storage:**
  - Cloudflare D1 (database) holds game records, totals and used one-time codes.
  - A Durable Object holds leaderboard rows (as in 73-9).
  - Room for any extra board data (as 73-9's `LB` store does).
- **Fewer requests:** the page, its code and its styles are one file, the day's data is one file, and both are cached in the browser. Headshots load from GitHub Pages, so they don't count against Cloudflare requests.

### 18.2 The game never takes down hoopsmatic.com

- **The game plays fully without its server.** If the start, finish or board call fails, play continues and the end screen says "Rankings are resting. Score not recorded". One attempt, no retry loops.
- **If a database limit or error hits,** recording stops quietly and play carries on.
- **Kill switch:** `recording: off` in the rules file stops every server call from the game.
- **The hoopsmatic.com Cloudflare account is already on the Workers Paid plan** (same account as 73-9), so there's no daily request cap that could take the site offline.

### 18.3 Cost (account already on the paid plan)

**Per game:**

| What | Amount |
|---|---|
| Worker requests | about 4 on the first game (page, data, start, finish); about 2 on each replay |
| Database writes | **2** (the game record + its one-time code) |
| Extra writes when a named player sets a new best | 2–3 more |
| Once-a-day totals job | up to about 22,000 writes a day, whatever the traffic |
| End-screen percentage | database reads every 5 minutes (cheap and plentiful), not writes |

**Expected extra cost on top of the existing plan:**
- At a quiet launch: about **$0**.
- At 73-9-level traffic (about 347,000 games a day): about 42 million requests and 27 million writes a month. Writes stay inside the plan's included 50 million. That's about **$6–10 a month extra**, plus small Durable Object charges like 73-9's.
- For reference, Jorge's account paid $5/month flat before 73-9 and about $33 in 73-9's viral month.
- Confidence is moderate: Cloudflare's own docs disagree on whether 10 or 20 million requests a month are included (overage is $0.30 per extra million).

Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

---

## 19. Privacy

**https://hoopsmatic.com/privacy must be updated before launch.** It must cover what Salary Ladder stores on the server:

- **Anonymous game records:** each pick's players, salaries, choice and time; score, rung, total time. No user ID, no device ID, no IP. Kept 7 days, then deleted.
- **Anonymous totals**, kept: pair vote totals, contract-preference totals, accuracy counts, daily score counts for the end-screen percentage.
- **Display names, optional @handles and leaderboard scores** for players who choose to appear on a board. Kept with the board. Removable by the admin tools.
- **One-time game codes:** random, kept 48 hours.

Also state:
- what stays only on the device (streak, personal bests, name, device ID, saved game, voted pairs);
- that no accounts, logins, emails, ads, age checks, birthdates or locations are collected;
- that Cloudflare handles network traffic under its own policies, while the game itself stores no IP addresses.

---

## 20. Design

- **Match the look of Jorge's NBA Polymarket tracker**, https://github.com/jsierrahoopshype/nba-polymarket (colours, type, spacing, card style). The build attaches that repo **read-only** and copies its look; it never writes to it. If it uses a web font or outside resource, the build reuses only what hoopsmatic.com already loads and flags anything new to Jorge first.
- **Mobile first. No scrolling during play:** both cards, the timer bar, hearts, rung and current score all fit on one phone screen.
- **Layout:**
  - **The incumbent card always stays in the same spot**, the challenger card in the other, so the eye learns where "stay" and "climb" are.
  - **Timer:** a bar that empties over 8 seconds, turning to a warning colour in the last 3 seconds.
  - **Reveal:** salaries slide in on both cards, with the gap between them.
- **Controls:** tap either card. On desktop, also the left/right arrow keys.
- **Accessibility:** right/wrong never uses colour alone (✓/✗ icons); text contrast meets the usual minimum; the timer is also shown as a number.
- **No sound or vibration.**

---

## 21. Promotion

- **Cross-promo card** in the existing HoopsMatic games "play next" module. At build time, find where that module lives and **tell Jorge before touching it**; it's a separate, approved change on whichever repo holds it. Card text (Jorge confirms before it goes live): **"Salary Ladder: Who gets paid more? Climb to the top."**
- **Social posts** on Jorge's accounts, drafted **after launch** and confirmed by Jorge one by one before posting. No emojis, no hashtags, no em dashes.
- **HoopsHype articles from the collected data:** e.g. "the players fans think are paid more than they are". Built only from the anonymous totals.

---

## 22. Career-earnings version (later)

**Not in the first release.** It needs its own short interview to settle its rules. What's known so far:

- **Pool definition:**
  - first NBA season 1990-91 or later, taken from the stats sheet's first season. The salary file's years-in-league count restarts at 0 in 1990-91, so it can't be used; it let Michael Jordan in during testing.
  - salary data through 2025-26, NBA ID matched, face-tight headshot.
  - Players whose name is shared get an era check.
- **Count after the approved name fixes: 1,669 players.**
  - Lowest $20,000 (Caleb Homesley); highest $583,949,426 (LeBron James).
  - Most common $77,250 (33 players, all one short stint). 1,517 different totals.
- **Prerequisites:**
  - the 45 same-team amounts that grew by odd factors are settled by the sheet owner;
  - the Cam Whitmore merge;
  - a recount once nba-headshots is refreshed.
- **Pending 2025-26 rows affect the career version only:**
  - 18 players in the pool have a 2025-26 figure from the temporary sheet.
  - **73 exact repeat rows** (same man, season, team and figure to the dollar) are already counted once by the Salary Finder. 60 career-pool players have one; they need no action.
  - **45 same-team amounts that grew by odd factors** (for example Connaughton, Bufkin, Houstan) are a separate issue, waiting on the sheet owner. Until they're settled, career totals for those players may be wrong. This is the real blocker.
- **Ladder length at ±10%** (simulated, never-miss player, symmetric band):
  - from the $20,000 bottom: 451 picks (189 climbs);
  - with a $20M floor (642 players): 144 picks (66 climbs);
  - with a $50M floor (396 players): 106 picks (47 climbs).

  The career ladder needs a floor or a start rule like 2026-27's. To be decided in its own interview.

---

## 23. Simulation results (2026-27 rules)

Pool of 448; start rule as in section 6.2; band ±10%; 50/50 coin flip; ties excluded; 20,000 games per row.

**Perfect player:** 66 climbs (61–72), 132 picks (114–151). The band never needed widening.

**With 5 lives.** Accuracy here means the share of picks a player gets right, with timeouts counted as misses:

| Right per pick | Avg picks/game | Avg rung reached | Finish rate | Lives needed for 1 in 1,000 |
|---|---|---|---|---|
| 58% | 11.9 | 3.4 | ≈ 0 | 52 |
| 65% | 14.3 | 4.7 | ≈ 0 | 37 |
| 70% | 16.7 | 5.9 | 1 in 1.6 trillion | 28 |
| 75% | 20.0 | 7.5 | 1 in 3.8 billion | 21 |
| 80% | 24.9 | 10.0 | 1 in 12.6 million | 15 |
| 85% | 33.3 | 14.1 | 1 in 56,000 | 9 |
| 89% | about 45 | about 20 | 1 in 945 | 5 |
| 90% | 49.8 | 22.4 | 1 in 359 | 5 |

**Sensitivity:**
- Half a point of accuracy moves the finish rate about 1.6 times.
- 1% of picks timing out turns 1 in 1,550 into 1 in 3,758.

**What else would change the accuracy needed** (for reference only; the band and start are fixed):

| Change | Climbs | Accuracy needed for 1 in 1,000 with 5 lives |
|---|---|---|
| ±15% band | 46 | 84% |
| ±20% band | 35 | 80% |
| Start at the median, about $6M | 48 | 85% |
| Start at $15M | 29 | 76% |

**Confidence:** high on the ladder math. The real accuracy players reach is unknown until launch (section 15).

---

## 24. Approved name-matching entries

**Spelling fixes (approved):**

| Salary-data name | NBA ID | Headshot name |
|---|---|---|
| Nicolas Claxton | 1629651 | Nic Claxton |
| Patrick Mills | 201988 | Patty Mills |
| Herb Jones | 1630529 | Herbert Jones |
| Steve Smith (1991 #5, Michigan St) | 120 | Steven Smith |
| Louis Williams | 101150 | Lou Williams |
| Juan Hernangomez | 1627823 | Juancho Hernangomez |
| Ishmael Smith | 202397 | Ish Smith |
| Josh Primo | 1630563 | Joshua Primo |
| Santiago Aldama | 1630583 | Santi Aldama |
| Sviatoslav Mykhailiuk | 1629004 | Svi Mykhailiuk |
| Cameron Whitmore (merge with Cam Whitmore) | 1641715 | Cam Whitmore |
| Louis Amundson | 200811 | Lou Amundson |
| Wesley Iwundu | 1628411 | Wes Iwundu |
| Ishmail Wainright | 1630688 | Ish Wainright |
| Raymond Spalding | 1629034 | Ray Spalding |
| Walter Lemon Jr | 1627215 | Walt Lemon Jr. |
| Vince Hunter | 1626205 | Vincent Hunter |
| Eli Ndiaye | 1642947 | Eli John Ndiaye |

**Hand entries for 2026-27 (approved):**

| Salary-data name | NBA ID | Headshot name |
|---|---|---|
| Dennis Schroeder | 203471 | Dennis Schröder |
| Ron Holland | 1641842 | Ronald Holland II |
| Carlton Carrington | 1642267 | Bub Carrington |
| BJ Boston | 1630527 | Brandon Boston |

**Father/son fixes (approved):**

| Salary-data name | NBA ID | Headshot name |
|---|---|---|
| Jabari Smith | 1631095 | Jabari Smith Jr. |
| Kevin Porter (2019-20 on) | 1629645 | Kevin Porter Jr. |

**Same-name cases settled by era (all approved):**

| Name | Salary data | NBA ID picked | The other person with the name |
|---|---|---|---|
| Gerald Henderson | 2009-10 to 2017-18, CHA/PHI/POR, 2009 #12 Duke | 201945 | 76993 (older, no headshot) |
| Johnny Davis | 2022-23 to 2024-25, WAS, 2022 #10 Wisconsin | 1631098 | 76526 (older, no headshot) |
| Brandon Williams | 2021-22 to 2026-27, DAL/GSW/POR, undrafted, Arizona | 1630314 | 1585 (late 1990s, no headshot) |
| Nate Williams | 2023-24 to 2025-26, GSW/HOU, undrafted | 1631466 | 78561 (1970s, no headshot) |
| David Johnson | 2021-22, TOR, 2021 #47 Louisville | 1630525 | 77139 (older, no headshot) |
| George King | 2018-19 to 2021-22, DAL/PHX, 2018 #59 Colorado | 1628994 | 77268 (older, no headshot) |

**Never matched** (in `data/exclude.json`):

| Salary-data name | Why |
|---|---|
| Marcus D. Williams (2006 #22, UConn) | Fuzzy match wrongly gave Marvin Williams. He is really 200766, who has no headshot. |
| Marcus E. Williams (2007 #33, Arizona) | Fuzzy match wrongly gave Marvin Williams. No NBA ID found, no headshot. |
| Steven Smith (2006-07 PHI, La Salle) | Not Steve Smith (120). |
| Marcus Thornton II (2017-18, William & Mary) | Not Marcus Thornton (201977, LSU). |

---

## 25. New Salary Finder file: `data/roster_status.json` (launch blocker)

To be added in a separate Salary Finder session with Jorge's OK. Nothing in this repo touches the Salary Finder. It's a **new file only**; nothing existing changes.

- **Written by the same daily build that writes `data.json`**, in the same run, so both describe the same moment.
- **Top level:**
  - `built`: identical to `data.json`'s `meta.built`
  - `season`: "2026-27"
- **One entry per player with 2026-27 money**, using exactly the same `player` name as `data.json`:
  - `team`: the team he plays for now, from Cyro's current-salaries sheet (its one TEAM per player). `null` if he has no current contract.
  - `contract`: one of `guaranteed`, `non_guaranteed`, `partial`, `two_way`, `ten_day`, `dead_money_only`, `unknown`. Taken from the status column of whichever source sheet has one; `unknown` if none does.
  - `current_salary`: what his current team pays him.
  - `dead_money`: a list of `{team, amount}` owed by former teams.
  - `total`: must equal his `data.json` 2026-27 salary.
  - `birth_date`: from the Finder's bio sheet (YYYY-MM-DD), for exact age on the cards.
- **Built-in check:** for every player, `current_salary` + the sum of `dead_money` = `total` = the `data.json` salary. Otherwise the Finder build flags it.
- **How the game uses it:** section 5.

---

## 26. Launch checklist

**Blockers (separate sessions or decisions):**

1. **nba-headshots refresh** (separate session) for the 105 first-contract players and the 9 veterans listed in section 4.3: https://github.com/jsierrahoopshype/nba-headshots
2. **New Salary Finder file `data/roster_status.json`**, including `birth_date` (separate session, Jorge's OK): https://github.com/jsierrahoopshype/salary-season-finder. Spec in section 25.
3. **Privacy page updated** for the anonymous game records and totals, vote totals, display names, @handles and leaderboard scores stored on the server: https://hoopsmatic.com/privacy (section 19).
4. **73-9 files:** at build time, Jorge attaches two files both named index.js. One is from the 73-9-gameserver folder (Daily 73-9 boards, name filter with acrostic/elongation rules, admin scrub). The other is from the 73-9-leaderboard folder (signed result tokens, one row per name, unverified-high-score rejection).
5. **Cloudflare plan:** already on Workers Paid (same account as 73-9). No action. Expected extra cost noted in section 18.3.

**Build and setup:**

6. **Shared Worker route** for `/salary-ladder/`, preceded by the Worker state check: main's latest commit, recent merges, open PRs, unmerged branches, deploy status. https://github.com/jsierrahoopshype/hoopsmatic-worker. It deploys through its own GitHub Action on merge; never deploy anything unmerged.
7. Game-check and leaderboard Workers deployed by this repo's GitHub Action on `hoopsmatic.com/salary-ladder/api/*`, with **new** secrets (signing secret, admin key) added in the Cloudflare dashboard, never 73-9's.
8. D1 database and Durable Object created; the once-a-day totals job scheduled.
9. Daily data job running in this repo (GitHub Actions), with its first snapshot and first Daily puzzle built and checked.
10. `rules/rules.json` at version 1: 5 lives, ±10% band, 8 s timer, start window 5th–25th percentile with at least 15 neighbours, recording on.
11. `data/crosswalk.json` and `data/exclude.json` filled from section 24.
12. Canonical and og:url set to https://hoopsmatic.com/salary-ladder/
12a. Look copied from https://github.com/jsierrahoopshype/nba-polymarket (attached read-only).
13. Sitemap entry with an accurate `<lastmod>`; sitemap listed in https://hoopsmatic.com/robots.txt; submitted in Google Search Console: https://search.google.com/search-console
14. **Tests:**
    - The page and the server replay agree on 1,000 recorded games.
    - Each time rule rejects what it should (299 ms pick, 690 ms average, 8,001 ms non-timeout, total time longer than server time).
    - Expired-token re-verify works.
    - The name filter passes the 73-9 test cases.
    - The game plays with the server switched off.
15. Mobile check on a small phone: nothing scrolls during play.

**After launch:**

16. Cross-promo card in the HoopsMatic games "play next" module: find where it lives, tell Jorge before touching it, card text "Salary Ladder: Who gets paid more? Climb to the top." (Jorge confirms; separate approved change).
17. Social posts drafted after launch, each confirmed by Jorge before posting. No emojis, no hashtags, no em dashes.
18. First calibration review after at least 5,000 games and at least 1 week (section 15).

---

## 27. Items settled at approval (October 8, 2026)

| # | Question | Decision |
|---|---|---|
| 1 | Design reference | https://github.com/jsierrahoopshype/nba-polymarket, attached read-only at build time; copy its look; mobile first. |
| 2 | Personal best | One per mode (Daily, Unlimited). |
| 3 | Board money display | "$31.42M" plus total time; sorting uses the exact amount. |
| 4 | Rows per board | Top 50 plus your own rank (same as the Daily 73-9). |
| 5 | Trade Machine data | CSV download behind the admin key. |
| 6 | Games cross-promo | Find where the "play next" module lives at build time and tell Jorge before touching it. Card text: "Salary Ladder: Who gets paid more? Climb to the top." Jorge confirms. |
| 7 | Social posts | Drafted after launch; Jorge confirms each one. No emojis, no hashtags, no em dashes. |
| 8 | Sound or vibration | None. |
| 9 | Screen wording | Written in the build, shown to Jorge before launch. |
| 10 | Career version | Its own short interview later. |
| 11 | Pending 2025-26 rows | Two separate issues. 73 = exact repeat rows, already counted once by the Salary Finder (no action). 45 = same-team amounts that grew by odd factors (Connaughton, Bufkin, Houstan), waiting on the sheet owner; blocks the career version only. |
| 12 | One official Daily play per device per day | Approved. |
| 13 | Timer keeps running when you switch apps or tabs | Approved. |
| 14 | Reloading or closing mid-pick counts as a timeout | Approved. |
