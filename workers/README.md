# Salary Ladder server Workers

Two Cloudflare Workers (build plan B2, spec 12 to 14 and 18). They copy the behaviour of the two 73-9 Workers with Salary Ladder's own secrets. Deployed only by `.github/workflows/deploy-workers.yml` when a change to `workers/` or `shared/game.js` is merged to `main`.

| Worker | Route | What it does |
|---|---|---|
| `salary-ladder-game` (`game/`) | `hoopsmatic.com/salary-ladder/api/*` | start tickets, replays every game with `shared/game.js`, the four time rules, result tokens, game records, the end-screen percentage, the daily totals job, the CSV download |
| `salary-ladder-board` (`board/`) | `hoopsmatic.com/salary-ladder/api/board*` | the boards, in one Durable Object; the 73-9 name filter; admin scrub and remove |

The board route is more specific, so Cloudflare sends `/salary-ladder/api/board…` to the board Worker and everything else under `/salary-ladder/api/` to the game Worker.

## Secrets (Cloudflare dashboard only, never in this repo)

Both Workers need the same two: `VERIFY_SECRET` (signs tickets and result tokens; must match on both) and `ADMIN_KEY`. Until they're set, both answer `{"ok":false,"error":"not configured"}` and the page says "Rankings are resting".

## API (the page uses these from build plan C2)

| Call | Body | Answer |
|---|---|---|
| `POST /salary-ladder/api/start` | `{mode: "daily" \| "unlimited"}` | `{ticket, day, number}`; Unlimited also `{seed, start, rules}` to play with |
| `POST /salary-ladder/api/finish` | `{ticket, picks: [{c, ms}], novote: [pick indexes already voted on this device]}` | `{result, token, rank: {pct, games, early}}` |
| `POST /salary-ladder/api/contract` | `{ticket, id}` (an NBA ID from the last pair) | `{saved}` |
| `GET /salary-ladder/api/status` | | `{configured, recording, day}` |
| `GET /salary-ladder/api/board?mode=daily\|unlimited&name=&handle=` | | top 50 per board, plus `me` (your rank) when a name is given |
| `POST /salary-ladder/api/board/submit` | `{token, name, handle}` | `{ranks}` per board |

`c` is 0 for the incumbent, 1 for the challenger, 2 for a timeout (always 8,000 ms). Errors are `{ok:false, error}`; the page treats any of them as "Rankings are resting" (or "Score not verified, retry" for `not verified`).

Timing: a result token lasts 15 minutes and works once. The same game can be re-sent for up to 30 hours (back-credit, quiet re-verify) and gets the same result with a fresh token. A game must first be sent within 24 hours of its ticket.

## Admin links (open in a browser; `KEY` is the admin key)

| What | Link |
|---|---|
| Hide a name on every board (stays hidden after deploys) | `https://hoopsmatic.com/salary-ladder/api/board/admin/scrub?key=KEY&name=NAME` |
| Undo that | `…/board/admin/scrub?key=KEY&name=NAME&remove=1` |
| See a name's rows | `…/board/admin/find?key=KEY&name=NAME` (or `&handle=@x`) |
| Delete a name's rows (all boards, or one with `&board=u:week:2026-10-12`) | `…/board/admin/remove?key=KEY&name=NAME` |
| Download totals for the Trade Machine | `https://hoopsmatic.com/salary-ladder/api/admin/totals?key=KEY&table=pairs` (or `contracts`, `gaps`, `accuracy`) |
| Run the totals job now | `…/api/admin/run?key=KEY` |

There is no way to insert a score by hand (spec 12.2).

## Switches

- `"recording": false` in `rules/rules.json`, or `RECORDING = "off"` in `game/wrangler.toml`: start and finish answer "resting"; nothing is written.
- Any database error is answered quietly as "resting"; the game keeps playing.

## Tests

`node --test` runs the Workers' real code against stand-ins for D1 and the Durable Object on Node's built-in SQLite (`test/helpers/cloudflare.mjs`). Before this was first merged, both Workers were also run in Cloudflare's local runtime (`wrangler dev`) end to end.
