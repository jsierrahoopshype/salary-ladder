# Salary Ladder: build plan

**Status:** DRAFT for Jorge's approval. Nothing gets built until this plan is approved.
**Based on:** `docs/salary-ladder-spec.md` (approved October 8, 2026).

The work is split into **Claude Code hand-offs**. Each one is a single session with one job.

- **One repo per session.** A step that changes another repo (salary-season-finder, nba-headshots, hoopsmatic-worker, or wherever the privacy page and the "play next" module live) gets **its own session, started only with Jorge's OK**. Reading other repos read-only is allowed where a step says so.
- **Every session pushes to its own branch and opens a pull request.** Jorge (or Alberto, for the shared Worker) merges. Nothing reaches `main` without that.
- **Nothing is ever deployed before it's pushed and merged.** All Cloudflare deploys happen from Jorge's computer, the same way 73-9 is deployed.
- **Secrets never go in chat, in commits or in files in any repo.**
- **Links to the spec point at the `claude/happy-feynman-x9fcfn` branch** until the spec and this plan are merged into `main`; after that, use the `main` links.

---

## The map: what runs when

```
START (plan approved)
 │
 ├── A1  salary-season-finder: new roster_status.json        ─┐
 ├── A2  nba-headshots: refresh missing faces                 │  all four
 ├── A3  salary-ladder: data pipeline + shared game logic     │  in parallel
 └── A4  read-only discovery: Worker state, privacy page,     │
         sitemap/robots, "play next" module                  ─┘
 │
 ├── B1  salary-ladder: game page          (needs A3)        ─┐  in parallel
 ├── B2  salary-ladder: server Workers     (needs A3 + 73-9)  │
 └── B3  salary-ladder: all screen wording (needs nothing)   ─┘
 │
 ├── C1  hoopsmatic-worker: /salary-ladder/ route + sitemap   (needs A4)
 ├── C2  salary-ladder: switch to real data, daily job on     (needs A1, A3, B1)
 ├── C3  Jorge: Cloudflare setup + deploy + test              (needs B2, C1, C2)
 ├── C4  privacy page update                                  (needs A4; must be live before launch)
 └── C5  Jorge: Search Console                                (needs C1 live)
 │
LAUNCH (gate: everything in A–C done, wording approved, privacy live)
 │
 ├── D1  "play next" cross-promo card   (tell Jorge before touching)
 ├── D2  social post drafts             (Jorge confirms each one)
 ├── D3  first calibration review       (after 5,000+ games and 1+ week)
 └── D4  career version interview       (after the 45 amounts are settled)
```

---

## Phase A: start all four at once

### A1. New Salary Finder file `roster_status.json`

- **Repo:** salary-season-finder. **Its own session, with Jorge's OK.**
- **What it does:** adds `data/roster_status.json` to the existing daily build, exactly as spec section 25 describes (current team, contract type, current salary, dead money, total, birth date). It also adds the built-in check that current salary + dead money = the `data.json` salary.
  - New file only; `data.json` and everything else stay exactly as they are.
  - Adds tests in that repo's own test folder.
- **Jorge does:**
  - Start the session with the hand-off prompt below.
  - Review and merge the pull request.
  - After the next 06:00 UTC run, check the file is there: https://github.com/jsierrahoopshype/salary-season-finder/blob/main/data/roster_status.json
- **Blocks:** C2 and launch. **Does not block** A3, B1 or B2, which use a stand-in until this lands.
- **Hand-off prompt:**
  > Work in jsierrahoopshype/salary-season-finder. Add a new file data/roster_status.json written by the same daily build that writes data/data.json, following section 25 of https://github.com/jsierrahoopshype/salary-ladder/blob/claude/happy-feynman-x9fcfn/docs/salary-ladder-spec.md. New file only: do not change data.json or any existing output. Add the current_salary + dead_money = total = data.json check and tests. Open a PR; don't merge.

### A2. Refresh nba-headshots

- **Repo:** nba-headshots. **Its own session, with Jorge's OK.**
- **What it does:** adds faces for the 105 players on their first NBA contract and the 9 veterans listed in spec section 4.3. It updates `players_all.json` and the `face-tight` folder.
- **Heads-up:** some 2026 rookies may not have official NBA headshots published yet. The session reports which ones are still missing. Those players simply stay out of the game until their face exists; nothing else waits for them.
- **Jorge does:**
  - Start the session.
  - If the refresh has to run on your computer (the repo's README describes a pipeline run on Windows), follow the commands the session gives you. Push, then merge the pull request.
- **Blocks:** launch (it's on the checklist). Nothing in the build waits for it.
- **Hand-off prompt:**
  > Work in jsierrahoopshype/nba-headshots. Add face-tight headshots for the players listed in section 4.3 of https://github.com/jsierrahoopshype/salary-ladder/blob/claude/happy-feynman-x9fcfn/docs/salary-ladder-spec.md (the 105 first-contract players and the 9 veterans), matching by NBA ID. Report anyone whose official headshot doesn't exist yet. Open a PR; don't merge.

### A3. Data pipeline and shared game logic

- **Repo:** salary-ladder. Reads salary-season-finder and nba-headshots **read-only**.
- **What it does:**
  - **Name matching:** `data/crosswalk.json` and `data/exclude.json` filled from spec section 24, plus the matching script with the section 4.2 rules (automatic only when unique, the era fits, and the NBA ID isn't already claimed).
  - **Snapshot builder:** the daily copy of the pool (`data/snapshots/2026-27/YYYY-MM-DD.json`), with the section 17 safety checks.
  - **Daily puzzle builder** (`daily/YYYY-MM-DD.json`). It never overwrites an existing file.
  - **`rules/rules.json`** at version 1: 5 lives, ±10%, 8 s, start window 5th–25th percentile with at least 15 neighbours, recording on.
  - **One shared game-logic module (JavaScript)** that both the page and the server use: challenger choice, start choice, seeding, lives, timer rules, score, replay. One copy means the page and the server can never disagree.
  - **`tools/simulate.py`**: the simulator used for the spec, for calibration later.
  - **The daily GitHub Action** (07:30 UTC, retries to 10:00 UTC, opens an issue when something's wrong). It's built but **not switched on** until C2.
  - **Stand-in data** until A1 lands: current team and status taken from the future-salaries sheet, as in the spec's simulation. The switch to `roster_status.json` is one setting.
  - **Tests:** matching (including the father/son cases), the 66-climb ladder check, seed reproducibility, and file immutability.
- **Jorge does:** review and merge the pull request.
- **Blocks:** B1, B2, C2.

### A4. Read-only discovery (no changes anywhere)

- **Repos:** hoopsmatic-worker and whatever else it finds, **read-only**. Its own session.
- **What it does:**
  - **Worker state check** for https://github.com/jsierrahoopshype/hoopsmatic-worker: main's latest commit, recent merges, open PRs, unmerged branches, and deploy status.
  - **How other HoopsMatic games are wired:** how they're routed (e.g. `/salary-season-finder/`), and which sitemap pattern they use.
  - **Where these live:** https://hoopsmatic.com/robots.txt, the sitemap(s), https://hoopsmatic.com/privacy, and the games "play next" cross-promo module.
- **Output:** a short report to Jorge. **It touches nothing.**
- **Jorge does:** read the report and decide who changes the Worker (you or Alberto).
- **Blocks:** C1, C4, D1.

---

## Phase B: build the game (after A3)

### B1. The game page

- **Repo:** salary-ladder. Attaches https://github.com/jsierrahoopshype/nba-polymarket **read-only** to copy its look.
- **What it does:** everything the player sees, mobile first, with no scrolling during play:
  - intro screen with the "streak at stake" line;
  - Daily and Unlimited, the two cards (headshot, name, team, position, exact age), the 8-second timer bar and number, hearts, rung and current score;
  - the 1.5-second reveal with both salaries and the gap, and ✓/✗ marks so colour is never the only signal;
  - end screen: score, rung, lives, time, percentage, personal best per mode, name entry, the contract question, the share card with the full link;
  - device storage, the reload-counts-as-timeout rule, arrow keys on desktop;
  - canonical and og:url set to https://hoopsmatic.com/salary-ladder/
- **The page plays completely without the server.** Server calls are added in C2/C3; until then the end screen shows "Rankings are resting".
- **No new fonts, scripts or embeds.** If nba-polymarket uses an outside font, the session reuses only what hoopsmatic.com already loads, or flags it to Jorge before adding anything.
- **Jorge does:**
  - Make sure this session can read nba-polymarket. If it's private, it may need attaching.
  - Try the preview link on your phone. Review and merge the pull request.
- **Runs alongside:** B2 and B3.

### B2. Server Workers (game check + leaderboard)

- **Repo:** salary-ladder (the Worker code lives in this repo under `workers/`, so unlike 73-9 it's backed up in GitHub).
- **What it does:** copies the 73-9 behaviour and layout from the two attached files:
  - **Game-check Worker:**
    - start tickets, replay with the shared game logic, all four time rules, signed result tokens, quiet re-verify for slow typers;
    - one-time codes kept 48 hours, the game record (2 writes per game);
    - the once-a-day totals job, the admin CSV download.
  - **Leaderboard Worker:**
    - one Durable Object, name-gated boards (Daily for Daily mode; Daily, Weekly, Monthly and All-time for Unlimited, all turning over at 9 AM ET), top 50 plus your own rank;
    - the full 73-9 name filter, one row per name, rejection of high scores without a token, admin scrub and admin remove.
  - **Database:** the D1 tables, and the "recording off" switch.
  - **Never takes the site down:** all errors are handled quietly.
  - **Tests:** the 1,000-game page-vs-server agreement check, every time rule (299 ms pick, 690 ms average, 8,001 ms pick that isn't a timeout, total time longer than server time), token expiry and re-verify, the 73-9 name-filter cases, and play with the server switched off.
- **Jorge does:**
  - **At the start of the session, attach the two 73-9 files:** "two files both named index.js. One is from the 73-9-gameserver folder (Daily 73-9 boards, name filter with acrostic/elongation rules, admin scrub). The other is from the 73-9-leaderboard folder (signed result tokens, one row per name, unverified-high-score rejection)."
  - Review and merge the pull request. Nothing is deployed in this step.
- **Runs alongside:** B1 and B3.

### B3. All screen wording

- **Repo:** salary-ladder (one file, `docs/salary-ladder-copy.md`).
- **What it does:** every piece of text the player sees:
  - intro, how to play (lives, timer and band read from the rules file), reveal and end-screen lines;
  - error and "rankings are resting" messages, the name-entry and verification messages ("Score not verified, retry"), the streak line;
  - the share card, and the cross-promo card text "Salary Ladder: Who gets paid more? Climb to the top."
- **Jorge does:** read it and approve or edit. **Launch waits for this approval.**
- **Runs alongside:** B1 and B2; can start right away.

---

## Phase C: connect, deploy, launch

### C1. Shared Worker: `/salary-ladder/` route and sitemap

- **Repo:** hoopsmatic-worker. **Its own session, with Jorge's OK. Coordinate with Alberto.**
- **The session must start with the Worker state check:** main's latest commit, recent merges, open PRs, unmerged branches, and deploy status. If anything is unexpected, it stops and reports.
- **What it does:**
  - serves https://hoopsmatic.com/salary-ladder/ from this repo's GitHub Pages, the same way the other games are served (per A4's report);
  - adds the sitemap entry with a correct `<lastmod>` and, if needed, the sitemap line in https://hoopsmatic.com/robots.txt.
  - Nothing else in the shared Worker changes. The game's own Workers keep their separate route (`/salary-ladder/api/*`).
- **Jorge does:**
  - Review the pull request with Alberto and merge.
  - **Deploy from your computer only after the merge is pushed:** `git pull`, then the same deploy command you normally use for hoopsmatic-worker.
  - Then open https://hoopsmatic.com/salary-ladder/ to check the page loads.
- **Needs:** A4. Can run alongside phase B.

### C2. Switch to real data and turn the daily job on

- **Repo:** salary-ladder.
- **What it does:**
  - switches from the stand-in to `roster_status.json` (once A1 is merged and producing the file);
  - recounts the pool and re-runs the simulator check (about 66 climbs);
  - switches on the 07:30 UTC daily Action;
  - builds and checks the first real snapshot and Daily puzzle;
  - points the page's server address at `https://hoopsmatic.com/salary-ladder/api/`.
- **Jorge does, before this session:**
  - **GitHub Pages:** https://github.com/jsierrahoopshype/salary-ladder/settings/pages, set to publish from the `main` branch (the session tells you which folder).
  - **Actions permissions:** https://github.com/jsierrahoopshype/salary-ladder/settings/actions, under "Workflow permissions" choose "Read and write permissions". This lets the daily job save files and open issues.
  - Review and merge the pull request.
- **Needs:** A1, A3, B1.

### C3. Cloudflare setup, deploy, end-to-end test (Jorge, with the session guiding)

- **Repo:** salary-ladder (code already merged). **Done from your computer.**
- **Jorge does, step by step.** The session gives exact commands; these are the same tools you use for 73-9.
  1. Get the merged code: `git pull` in your salary-ladder folder.
  2. **Create the database:** in the Cloudflare dashboard https://dash.cloudflare.com go to Workers & Pages, then D1 SQL Database, then Create, and name it `salary-ladder`. Or run `npx wrangler d1 create salary-ladder`. Give the session the database ID it shows. **The ID is not a secret; the keys below are.**
  3. **Make two new random secrets.** Run this twice and save each result in your password manager: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. One is the signing secret, the other the admin key. **Never reuse 73-9's.**
  4. **Store them in Cloudflare, for both Workers:** `npx wrangler secret put VERIFY_SECRET` and `npx wrangler secret put ADMIN_KEY`, pasting each value when asked. Never paste them into chat or any file.
  5. **Deploy both Workers:** `npx wrangler deploy` in each Worker folder. This creates the Durable Object, the database tables and the once-a-day job, and adds the `hoopsmatic.com/salary-ladder/api/*` route.
  6. **Run the test checklist** with the session, on your phone and computer:
     - a Daily game and an Unlimited game; a name on the board;
     - a slow name entry (token expiry);
     - recording switched off (the game keeps playing);
     - the admin CSV download; admin scrub and undo;
     - nothing scrolls on a small phone.
- **Expected cost:** about $0 extra at a quiet launch; about $6–10 a month extra at 73-9-level traffic (spec section 18.3). The account is already on the paid plan, so there's nothing to buy.
- **Needs:** B2, C1, C2.

### C4. Privacy page update

- **Repo:** whichever one holds https://hoopsmatic.com/privacy (found in A4). **Its own session, with Jorge's OK.**
- **What it does:** adds everything in spec section 19:
  - anonymous game records (7 days), anonymous totals, display names, @handles and leaderboard scores, one-time codes (48 hours);
  - what stays only on the device; that no IP addresses are stored by the game.
- **Jorge does:** review, merge, deploy as usual. **Must be live before launch.**
- **Needs:** A4. Can run any time after that.

### C5. Search Console (Jorge)

- **Jorge does:**
  - In https://search.google.com/search-console, open the hoopsmatic.com property and go to Sitemaps.
  - Submit the sitemap URL from C1. Then use URL Inspection on https://hoopsmatic.com/salary-ladder/ and click "Request indexing".
- **Needs:** C1 live.

### Launch gate

Launch only when all of these are true:
- A1, A2, C1, C2, C3 and C4 are done;
- the B3 wording is approved;
- the privacy page is live;
- the test checklist in C3 passed.

---

## Phase D: after launch

### D1. "Play next" cross-promo card

- **Repo:** whichever holds the module (found in A4). **Its own session. The session tells Jorge where it lives and what it will change before touching anything.**
- **Card text** (Jorge confirms): "Salary Ladder: Who gets paid more? Climb to the top."

### D2. Social post drafts

- **Repo:** none (drafts only).
- **Rules:** drafted after launch, for whichever accounts Jorge chooses. **Each post confirmed by Jorge before posting.** No emojis, no hashtags, no em dashes. One idea per post.

### D3. First calibration review

- **Repo:** salary-ladder (rules file only, if anything changes).
- **When:** after at least 5,000 games and at least one week.
- **What it does:** reads the accuracy totals (admin CSV), runs `tools/simulate.py`, and recommends lives (only up, never down, during the season). Jorge decides.

### D4. Career-earnings version

- **Its own short interview first.** Needs the 45 same-team amounts settled by the sheet owner, the Cam Whitmore merge, and a recount after A2.

---

## Everything Jorge does, in one list

| When | What | Where |
|---|---|---|
| Now | Approve this plan | This chat |
| Phase A | Start sessions A1 (salary-season-finder) and A2 (nba-headshots); merge their PRs | https://github.com/jsierrahoopshype/salary-season-finder · https://github.com/jsierrahoopshype/nba-headshots |
| Phase A | Read the A4 report; decide who changes the shared Worker (you or Alberto) | report in chat |
| Phase A–B | Merge A3, B1, B2 PRs; try the B1 preview on your phone | https://github.com/jsierrahoopshype/salary-ladder/pulls |
| B1 start | Make sure the session can read nba-polymarket | https://github.com/jsierrahoopshype/nba-polymarket |
| B2 start | Attach the two 73-9 index.js files (gameserver + leaderboard) | the B2 session |
| B3 | Approve the screen wording | `docs/salary-ladder-copy.md` |
| C1 | Review with Alberto, merge, deploy hoopsmatic-worker from your computer **after** pushing | https://github.com/jsierrahoopshype/hoopsmatic-worker |
| Before C2 | Turn on GitHub Pages; give Actions read-and-write permission | https://github.com/jsierrahoopshype/salary-ladder/settings/pages · https://github.com/jsierrahoopshype/salary-ladder/settings/actions |
| C3 | Create the D1 database, make and store two new secrets, deploy both Workers, run the tests | https://dash.cloudflare.com |
| C4 | Approve and publish the privacy page update | https://hoopsmatic.com/privacy |
| C5 | Submit the sitemap and request indexing | https://search.google.com/search-console |
| After launch | Confirm the cross-promo change and card text; confirm each social post; decide on lives after the calibration review | chat |
