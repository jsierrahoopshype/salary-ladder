Salary Ladder, a HoopsMatic game.

Spec: `docs/salary-ladder-spec.md`. Build plan: `docs/salary-ladder-build-plan.md`.

What's here so far:

- `shared/game.js`: the game logic (challengers, start, lives, score, replay check). The page, the server and the simulator all use this one file.
- `rules/rules.json`: lives, band, timer and the other settings (spec 15).
- `data/crosswalk.json`, `data/exclude.json`: hand-approved name matches (spec 24).
- `scripts/daily-job.mjs`: builds each day's salary snapshot and tomorrow's Daily puzzle (spec 17), from the Salary Finder's `data.json` and `roster_status.json`. Run every hour by `.github/workflows/daily.yml`; `pipeline/config.json` switches it off and on.
- `data/snapshots/2026-27/`, `daily/`: the dated salary snapshots and the Daily puzzles. Written only by the daily job, never overwritten.
- `tools/simulate.mjs`: the ladder simulator (spec 23).
- `test/`: run with `node --test`. No dependencies.
- `index.html`: the game page GitHub Pages serves (spec 2, 7 to 10, 16, 20). Built by `tools/build-page.mjs` from `page/` (template, styles, page code) and `shared/game.js`, so it is one file that runs the same game code as the server. Edit `page/` and rebuild; a test fails if `index.html` is out of date.
- `og-image.jpg`: the link-preview picture (X, Bluesky, WhatsApp…), drawn by `tools/build-og-image.mjs` from the approved wording. Redraw it when that wording changes.
- `docs/salary-ladder-copy.md`: every piece of text the player sees (build plan B3). The page reads it from `page/copy.js`; a test fails if the two differ.
- `workers/`: the two server Workers (game check, leaderboard) and the database tables (spec 12 to 14, 18). Deployed by `.github/workflows/deploy-workers.yml` on merge. API and admin links: `workers/README.md`. The page calls them at https://hoopsmatic.com/salary-ladder/api/ for start tickets, verification, the end-screen percentage, the contract question and the boards.
