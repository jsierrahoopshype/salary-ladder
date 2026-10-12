Salary Ladder, a HoopsMatic game.

Spec: `docs/salary-ladder-spec.md`. Build plan: `docs/salary-ladder-build-plan.md`.

What's here so far:

- `shared/game.js`: the game logic (challengers, start, lives, score, replay check). The page, the server and the simulator all use this one file.
- `rules/rules.json`: lives, band, timer and the other settings (spec 15).
- `data/crosswalk.json`, `data/exclude.json`: hand-approved name matches (spec 24).
- `scripts/daily-job.mjs`: builds each day's salary snapshot and tomorrow's Daily puzzle (spec 17). Run by `.github/workflows/daily.yml`, switched off until launch prep (`pipeline/config.json`).
- `tools/simulate.mjs`: the ladder simulator (spec 23).
- `test/`: run with `node --test`. No dependencies.
