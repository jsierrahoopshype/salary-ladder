# Salary Ladder: build plan

**Status:** APPROVED by Jorge on October 8, 2026, with five changes folded in:
1. deploys only through GitHub Actions;
2. Cloudflare setup by clicks, not commands;
3. all salary-ladder steps run in one session, one PR at a time;
4. discovery folded into the shared-Worker session;
5. repo settings listed right before the step that needs them.

**Based on:** `docs/salary-ladder-spec.md` (approved October 8, 2026).

## Ground rules

- **This session builds every salary-ladder step, one after another:** A3, then B1, B2, B3, then C2. Each step is **its own pull request**, and Jorge merges it before the next step starts.
- **Steps that change another repo get their own session, started only with Jorge's OK:** A1 (salary-season-finder), A2 (nba-headshots), C1 (hoopsmatic-worker, plus the privacy page if it lives there). Reading other repos read-only is allowed where a step says so.
- **Deploys happen only through GitHub Actions, on merge to `main`. Jorge never deploys from his computer.**
  - The shared Worker (hoopsmatic-worker) already deploys this way.
  - The game's two Workers get an Action in this repo that deploys them whenever `workers/` or the shared game logic changes on `main`.
  - Merging is the deploy, so nothing unmerged can ever go live.
- **Cloudflare setup is done by clicking in the dashboard**, never by typing commands.
- **Secrets never go in chat, in commits, or in any file in any repo.** They go only into the Cloudflare dashboard or GitHub's secrets page.

---

## The map: what runs when

```
START
 │
 ├── A1  salary-season-finder: new roster_status.json     (own session)      ─┐
 ├── A2  nba-headshots: refresh missing faces             (own session)       │ all three can
 ├── C1  hoopsmatic-worker: state check → report → STOP   (own session)       │ start now, in
 │        → after OK: /salary-ladder/ route, sitemap,                         │ parallel with
 │          and privacy page if it lives there                               ─┘ this session
 │
 └── THIS SESSION, one PR at a time:
       A3  data pipeline + shared game logic
        ↓ (merged)
       B1  game page
        ↓ (merged)
       B2  server Workers + deploy Action      ← Cloudflare setup by Jorge before merging
        ↓ (merged = deployed; Jorge adds the two secrets in the dashboard)
       B3  all screen wording                  ← Jorge approves the text
        ↓ (merged)
       C2  real data on, daily job on, page talks to the server   (needs A1 merged)
 │
 ├── C4  privacy page (only if it is NOT in hoopsmatic-worker; own session)
 ├── C3  end-to-end test (Jorge, on phone and computer, no commands)
 └── C5  Search Console (Jorge)
 │
LAUNCH (gate below)
 │
 ├── D1  "play next" cross-promo card   (tell Jorge before touching)
 ├── D2  social post drafts             (Jorge confirms each one)
 ├── D3  first calibration review       (after 5,000+ games and 1+ week)
 └── D4  career version interview       (after the 45 amounts are settled)
```

**What waits for what:**
- In this session each step waits for the previous PR to be merged.
- C2 also waits for A1 to be merged and producing its file.
- C3 waits for B2 deployed, C1 live and C2 merged.
- Launch waits for everything in the gate.
- A1, A2 and C1 can run any time, in parallel with this session.

---

## Steps in other repos (own sessions, start any time with Jorge's OK)

### A1. New Salary Finder file `roster_status.json`

- **Repo:** salary-season-finder. **Its own session.**
- **What it does:** adds `data/roster_status.json` to the existing daily build, exactly as spec section 25 describes:
  - current team, contract type, current salary, dead money, total, birth date;
  - the built-in check that current salary + dead money = the `data.json` salary;
  - tests in that repo.

  New file only; `data.json` and everything else stay exactly as they are.
- **Jorge does:**
  - Start the session with the prompt below. Review and merge its PR.
  - After the next 06:00 UTC run, check that the file exists: https://github.com/jsierrahoopshype/salary-season-finder/blob/main/data/roster_status.json
- **Blocks:** C2 and launch. Nothing earlier waits for it; A3, B1 and B2 use a stand-in.
- **Hand-off prompt:**
  > Work in jsierrahoopshype/salary-season-finder. Add a new file data/roster_status.json written by the same daily build that writes data/data.json, following section 25 of https://github.com/jsierrahoopshype/salary-ladder/blob/main/docs/salary-ladder-spec.md. New file only: do not change data.json or any existing output. Add the current_salary + dead_money = total = data.json check and tests. Open a PR; don't merge.

### A2. Refresh nba-headshots

- **Repo:** nba-headshots. **Its own session.**
- **What it does:** adds faces for the 105 first-contract players and the 9 veterans listed in spec section 4.3. It updates `players_all.json` and the `face-tight` folder.
- **Missing faces:** some 2026 rookies may not have official NBA headshots yet. The session reports them; those players stay out of the game until their face exists.
- **Jorge does:**
  - Start the session and merge its PR.
  - If that repo's refresh can only run on a computer (its README describes a Windows pipeline), the session must first look for a way to run it as a GitHub Action instead, and ask before anything else.
- **Blocks:** launch only.
- **Hand-off prompt:**
  > Work in jsierrahoopshype/nba-headshots. Add face-tight headshots for the players listed in section 4.3 of https://github.com/jsierrahoopshype/salary-ladder/blob/main/docs/salary-ladder-spec.md (the 105 first-contract players and the 9 veterans), matching by NBA ID. Report anyone whose official headshot doesn't exist yet. Prefer running the refresh as a GitHub Action; ask before anything that would need Jorge's computer. Open a PR; don't merge.

### C1. Shared Worker: check, report, stop, then route + sitemap (+ privacy page)

- **Repo:** hoopsmatic-worker (https://github.com/jsierrahoopshype/hoopsmatic-worker). **Its own session. Shared with Alberto.**
- **Part 1, read-only (touches nothing):**
  1. **Worker state check:** main's latest commit, recent merges, open PRs, unmerged branches, and the status of the latest deploy Action run.
  2. **Report where each of these lives:**
     - the route pattern other HoopsMatic games use (e.g. `/salary-season-finder/`);
     - the sitemap(s) and their `<lastmod>` pattern;
     - https://hoopsmatic.com/robots.txt;
     - https://hoopsmatic.com/privacy;
     - the games "play next" cross-promo module.
  3. **STOP and wait for Jorge's OK.**
- **Part 2, after the OK:**
  - serve https://hoopsmatic.com/salary-ladder/ from this repo's GitHub Pages the same way the other games are served;
  - add the sitemap entry with a correct `<lastmod>` and, if needed, the sitemap line in robots.txt;
  - **if the privacy page lives in this repo, also do C4 here** (spec section 19), so it's one session;
  - nothing else in the shared Worker changes. The game's own Workers keep their separate route, `/salary-ladder/api/*`.
- **Jorge does:**
  - Approve after Part 1. Review the PR with Alberto and merge.
  - **That's all. The repo's own GitHub Action deploys on merge; you don't deploy anything.**
  - Then open https://hoopsmatic.com/salary-ladder/ to check the page loads. Before B1 is merged it may show an empty or placeholder page.
- **Hand-off prompt:**
  > Work in jsierrahoopshype/hoopsmatic-worker (shared with Alberto). Part 1, read-only: run the Worker state check (main's latest commit, recent merges, open PRs, unmerged branches, latest deploy Action status), then report where the route pattern for other HoopsMatic games, the sitemap(s), robots.txt, the privacy page and the games "play next" module live. STOP and wait for my OK. Part 2, only after my OK: add the /salary-ladder/ route and the sitemap entry per sections 2 and 18.1 of https://github.com/jsierrahoopshype/salary-ladder/blob/main/docs/salary-ladder-spec.md, and, if the privacy page lives in this repo, the section 19 privacy update. Change nothing else. Open a PR; don't merge. Deploys happen through the repo's Action on merge.

---

## Steps in this session (salary-ladder, one PR at a time)

### A3. Data pipeline and shared game logic

- **Reads** salary-season-finder and nba-headshots **read-only**.
- **What it builds:**
  - **Name matching:** `data/crosswalk.json` and `data/exclude.json` from spec section 24, plus the matching script with the section 4.2 rules.
  - **Snapshot builder:** the daily copy of the pool, `data/snapshots/2026-27/YYYY-MM-DD.json`, with the section 17 safety checks.
  - **Daily puzzle builder:** `daily/YYYY-MM-DD.json`. It never overwrites an existing file.
  - **`rules/rules.json`** version 1: 5 lives, ±10%, 8 s, start window 5th–25th percentile with at least 15 neighbours, recording on.
  - **One shared game-logic module (JavaScript)** used by both the page and the server: challenger, start, seeding, lives, timer rules, score, replay.
  - **`tools/simulate.py`** for calibration later.
  - **The daily GitHub Action** (07:30 UTC, retries until 10:00 UTC, opens an issue when something's wrong). It's built but **switched off** until C2.
  - **A stand-in for the roster file** until A1 lands: current team and status from the future-salaries sheet. Switching to `roster_status.json` is one setting.
  - **Tests,** run automatically on every PR: matching (including the father/son cases), the ~66-climb ladder check, seed reproducibility, file immutability.
- **Jorge does:** review and merge the PR.

### Before B1: one repo setting

- **Turn on GitHub Pages** so you can try the game on your phone:
  1. Open https://github.com/jsierrahoopshype/salary-ladder/settings/pages
  2. Under "Build and deployment", set Source to **Deploy from a branch**.
  3. Set Branch to **main** and folder **/ (root)**, then click **Save**.
- The preview will then be at https://jsierrahoopshype.github.io/salary-ladder/. That address is only for testing; the page's canonical tag still points to https://hoopsmatic.com/salary-ladder/.

### B1. The game page

- **Attaches https://github.com/jsierrahoopshype/nba-polymarket read-only** to copy its look. If that repo is private and the session can't read it, it will ask you.
- **What it builds:** everything the player sees, mobile first, no scrolling during play:
  - intro with the "streak at stake" line;
  - Daily and Unlimited, the cards (headshot, name, team, position, exact age), the 8-second timer bar and number, hearts, rung, score;
  - the 1.5-second reveal with ✓/✗ marks (never colour alone);
  - the end screen: score, rung, lives, time, percentage, personal best per mode, name entry, the contract question, the share card with the full link;
  - device storage, the reload-counts-as-timeout rule, arrow keys on desktop;
  - canonical and og:url set to https://hoopsmatic.com/salary-ladder/
- **The page plays completely without the server.** Until C2, the end screen shows "Rankings are resting".
- **No new fonts, scripts or embeds.** If nba-polymarket uses an outside font, the page reuses only what hoopsmatic.com already loads, or the session flags it to you first.
- **Jorge does:** try the preview on your phone after the PR's changes are on `main` (or from the PR's preview notes). Review and merge.

### Before merging B2: Cloudflare setup (clicks only)

**Merging B2 deploys the Workers, so do these first.** The dashboard's labels sometimes move; if a name below doesn't match exactly, look for the closest one.

**1. Create the database**
1. Open https://dash.cloudflare.com and pick the HoopsMatic account.
2. In the left sidebar, open **Storage & Databases → D1 SQL Database**. On some layouts it's under **Workers & Pages → D1**.
3. Click **Create** (or "Create Database"), type the name **salary-ladder**, leave the location on automatic, and click **Create**.
4. On the database's page, copy the **Database ID** and paste it in this chat. **It is not a secret**; it goes into the Workers' settings file.

**2. Create the deploy token (minimum permissions)**
1. Open https://dash.cloudflare.com/profile/api-tokens. That's the same as clicking your profile icon at the top right, then **My Profile → API Tokens**.
2. Click **Create Token**, then next to **Create Custom Token** click **Get started**.
3. **Token name:** `salary-ladder deploy (GitHub Actions)`
4. **Permissions.** Click "+ Add more" for each row:
   - **Account** · **Workers Scripts** · **Edit** (deploys the two Workers, their storage unit and the once-a-day job)
   - **Account** · **D1** · **Edit** (sets up the database tables)
   - **Zone** · **Workers Routes** · **Edit** (adds the `hoopsmatic.com/salary-ladder/api/*` route)
5. **Account Resources:** Include → your HoopsMatic account.
6. **Zone Resources:** Include → Specific zone → **hoopsmatic.com**.
7. Leave the IP filtering and TTL fields empty. Click **Continue to summary**, then **Create Token**.
8. **Copy the token now.** Cloudflare shows it only once. Don't paste it in chat; it goes straight into GitHub, below.
9. If the first deploy fails with a permissions error, the fix is usually adding **Account · Account Settings · Read** to the same token: on the token list, click "Edit". Confidence on the exact minimum set is moderate.

**3. Find your Account ID**
- Open https://dash.cloudflare.com, then **Workers & Pages**. The **Account ID** is shown on the right side of the overview page. Copy it. It isn't a secret, but it goes into GitHub next to the token.

**4. Put both into GitHub**
1. Open https://github.com/jsierrahoopshype/salary-ladder/settings/secrets/actions
2. Click **New repository secret**. Name: `CLOUDFLARE_API_TOKEN`; Secret: the token from step 2. Click **Add secret**.
3. Click **New repository secret** again. Name: `CLOUDFLARE_ACCOUNT_ID`; Secret: the Account ID. Click **Add secret**.

### B2. Server Workers and their deploy Action

- **Jorge attaches at the start of B2:** "two files both named index.js. One is from the 73-9-gameserver folder (Daily 73-9 boards, name filter with acrostic/elongation rules, admin scrub). The other is from the 73-9-leaderboard folder (signed result tokens, one row per name, unverified-high-score rejection)."
- **What it builds** (code in `workers/`, so unlike 73-9 it's backed up in GitHub):
  - **Game-check Worker `salary-ladder-game`:**
    - start tickets, replay with the shared game logic, all four time rules, signed result tokens, quiet re-verify;
    - one-time codes (48 h), the game record (2 writes per game);
    - the once-a-day totals job, the admin CSV download.
  - **Leaderboard Worker `salary-ladder-board`:**
    - one Durable Object, name-gated boards (Daily for Daily mode; Daily, Weekly, Monthly and All-time for Unlimited, all at 9 AM ET), top 50 plus your own rank;
    - the full 73-9 name filter, one row per name, rejection of high scores without a token, admin scrub and remove.
  - **Database:** the D1 tables, created automatically by the deploy Action.
  - **"Recording off" switch.** All errors are handled quietly, so the site and the game never break.
  - **If the secrets aren't set yet,** the Workers answer "not configured" and the game shows "Rankings are resting". Nothing breaks.
  - **The deploy Action** (`.github/workflows/deploy-workers.yml`): on every merge to `main` that changes `workers/` or the shared game logic, it applies database changes and deploys both Workers. It uses the two GitHub secrets above. It never touches secrets stored in the Cloudflare dashboard.
  - **Tests** (run on every PR):
    - page-vs-server agreement on 1,000 games;
    - each time rule (299 ms pick, 690 ms average, 8,001 ms pick that isn't a timeout, total time longer than server time);
    - token expiry and re-verify;
    - the 73-9 name-filter cases;
    - play with the server switched off.
- **Jorge does:**
  1. Complete the Cloudflare setup above **before** merging.
  2. Review and merge the PR. **The merge deploys.** Then watch the run turn green at https://github.com/jsierrahoopshype/salary-ladder/actions
  3. **Add the two secrets in the dashboard (clicks only), right after the first deploy:**
     - **Make the values in your password manager's generator:** 64 characters, letters and numbers only (no symbols, to avoid copy problems). Make two: one called "Salary Ladder signing secret", one called "Salary Ladder admin key". Save both there. **Never reuse 73-9's.**
     - Open https://dash.cloudflare.com, then **Workers & Pages**, then click **salary-ladder-game**.
     - Go to **Settings → Variables and Secrets**, click **Add**.
     - Set Type to **Secret**, Variable name `VERIFY_SECRET`, and paste the signing secret as the value. Click **Deploy** (or Save).
     - Click **Add** again: Type **Secret**, Variable name `ADMIN_KEY`, value = the admin key. Click **Deploy**.
     - **Repeat for salary-ladder-board with the same two values.** The leaderboard checks tokens signed by the game-check Worker, so the signing secret must match.
  4. Tell me when it's done; I'll check that the Workers answer correctly. Later deploys from GitHub keep these secrets.

### B3. All screen wording

- **What it builds:** `docs/salary-ladder-copy.md` with every piece of text the player sees:
  - intro, how to play (values read from the rules file), reveal and end-screen lines;
  - errors and "Rankings are resting", name entry, "Score not verified, retry", the streak line;
  - the share card, and the cross-promo card text "Salary Ladder: Who gets paid more? Climb to the top."
  - The page is then updated to use exactly this text.
- **Jorge does:** read, edit or approve, then merge. **Launch waits for this.**

### Before C2: one repo setting

- **Let the daily job save files and open issues:**
  1. Open https://github.com/jsierrahoopshype/salary-ladder/settings/actions
  2. Scroll to **Workflow permissions**, choose **Read and write permissions**, and click **Save**.
- **And confirm A1 is merged** and https://github.com/jsierrahoopshype/salary-season-finder/blob/main/data/roster_status.json exists.

### C2. Real data on, daily job on, page connected

- **What it does:**
  - switches from the stand-in to `roster_status.json`;
  - recounts the pool and re-runs the ~66-climb check;
  - **switches on** the 07:30 UTC daily Action;
  - builds and checks the first real snapshot and Daily puzzle;
  - points the page at `https://hoopsmatic.com/salary-ladder/api/`, so scores, rankings, boards and votes start working.
- **Jorge does:** review and merge.

---

## Final checks and launch

### C4. Privacy page (only if it is not in hoopsmatic-worker)

- **Repo:** wherever C1's report says https://hoopsmatic.com/privacy lives. **Its own session, with Jorge's OK.** It adds everything in spec section 19.
- **Must be live before launch.** If the page is in hoopsmatic-worker, this was already done in C1.

### C3. End-to-end test (Jorge, no commands)

On your phone and your computer, at https://hoopsmatic.com/salary-ladder/:
1. Play a Daily and an Unlimited game to the end.
2. Put a name on a board. Then play again and wait a few minutes before typing the name; it should still go through (the expired-token check).
3. Nothing scrolls during play on a small phone.
4. **Recording off:** I flip `recording: off` in the rules file through a small PR you merge. The game must keep playing, with "Rankings are resting". Then I flip it back.
5. **Admin tools:** I give you the admin links, which use the admin key from your password manager. Download the CSV; scrub a test name and undo it.

### C5. Search Console (Jorge)

1. Open https://search.google.com/search-console and pick the hoopsmatic.com property.
2. **Sitemaps** (left menu): enter the sitemap URL from C1's report and click **Submit**.
3. **URL Inspection** (top search bar): paste https://hoopsmatic.com/salary-ladder/ and click **Request indexing**.

### Launch gate

Launch only when all of these are true:
- A1, A2 (or the rookies without faces accepted as left out), A3, B1, B2, B3, C1 and C2 are merged;
- the privacy page is live;
- C3 passed;
- the C5 sitemap is submitted.

---

## After launch

- **D1. "Play next" cross-promo card.** The session for whichever repo holds the module (from C1's report) tells Jorge exactly what it will change before touching anything. Card text, which Jorge confirms: "Salary Ladder: Who gets paid more? Climb to the top."
- **D2. Social post drafts.** For whichever accounts Jorge chooses; **each one confirmed by Jorge before posting**. No emojis, no hashtags, no em dashes, one idea per post.
- **D3. First calibration review** (salary-ladder; rules file only). After at least 5,000 games and at least a week: read the accuracy totals, run `tools/simulate.py`, recommend lives. During a season lives only go up. Jorge decides.
- **D4. Career-earnings version.** Its own short interview first. It needs the 45 same-team amounts settled by the sheet owner, the Cam Whitmore merge, and a recount after A2.

---

## Everything Jorge does, in order

| When | What | Link |
|---|---|---|
| Now | Merge the docs PR (spec + this plan) | https://github.com/jsierrahoopshype/salary-ladder/pulls |
| Any time | Start sessions A1, A2, C1 with their prompts; merge their PRs (C1: approve after the report, review with Alberto; its Action deploys) | https://github.com/jsierrahoopshype/salary-season-finder · https://github.com/jsierrahoopshype/nba-headshots · https://github.com/jsierrahoopshype/hoopsmatic-worker |
| After A3's PR | Merge | https://github.com/jsierrahoopshype/salary-ladder/pulls |
| Before B1 | Turn on GitHub Pages (main, root) | https://github.com/jsierrahoopshype/salary-ladder/settings/pages |
| B1 | Make sure nba-polymarket is readable; try the preview on your phone; merge | https://github.com/jsierrahoopshype/nba-polymarket · https://jsierrahoopshype.github.io/salary-ladder/ |
| Before merging B2 | Create the D1 database (paste its ID in chat); create the deploy token; copy the Account ID; add both to GitHub secrets | https://dash.cloudflare.com · https://dash.cloudflare.com/profile/api-tokens · https://github.com/jsierrahoopshype/salary-ladder/settings/secrets/actions |
| B2 start | Attach the two 73-9 index.js files (gameserver + leaderboard) | this chat |
| After merging B2 | Watch the deploy go green; make two 64-character values in your password manager; add `VERIFY_SECRET` and `ADMIN_KEY` to both Workers in the dashboard | https://github.com/jsierrahoopshype/salary-ladder/actions · https://dash.cloudflare.com |
| B3 | Approve the wording; merge | `docs/salary-ladder-copy.md` |
| Before C2 | Actions: Read and write permissions; confirm A1's file exists | https://github.com/jsierrahoopshype/salary-ladder/settings/actions |
| C2 | Merge | https://github.com/jsierrahoopshype/salary-ladder/pulls |
| C4 (if separate) | Approve and merge the privacy update | https://hoopsmatic.com/privacy |
| C3 | Run the end-to-end test | https://hoopsmatic.com/salary-ladder/ |
| C5 | Submit the sitemap; request indexing | https://search.google.com/search-console |
| After launch | Confirm the cross-promo change and text; confirm each post; decide lives after the calibration review | this chat |
