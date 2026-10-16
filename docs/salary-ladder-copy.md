# Salary Ladder: screen wording

**Status:** for Jorge's approval (build plan B3). Launch waits for this.

Every piece of text the player sees, screen by screen. The page shows exactly this text: it reads it from `page/copy.js`, and a test fails if that file and this document differ by a single character.

**To change a line,** edit the **Text** column (in the PR, or tell me in chat) and I update `page/copy.js` to match. Leave the **Key** column alone; it's how the page finds the line.

**{Braces}** are filled in by the page: numbers from `rules/rules.json`, the season, dates, scores, names. Keep them, though you can move them within the line.

**House rules used here:** no em dashes, no emojis except the streak flame and the share text's hearts (both from 73-9, spec 9 and 10), ✓ and ✗ always next to the colour (spec 8). Money is written with 3 significant figures ($2.45M, $31.4M), and like $31.42M on the boards (spec 8 and 12).

## Search results, browser tab and link previews

Fixed text in the page. The season is written in, so it changes by hand each season.

The link-preview picture (`og-image.jpg`, 1200×630) shows three lines from this doc, in capitals: `app.name`, `play.question` and `image.footer`. Its description for screen readers is `meta.ogTitle`. Changing any of them means redrawing the picture with `node tools/build-og-image.mjs`.

| Text | Shows | Key |
|---|---|---|
| Salary Ladder: Who gets paid more? \| HoopsMatic | Browser tab and Google result title | `meta.title` |
| Two NBA players, one question: who makes more in 2026-27? Climb from the bottom of the salary ladder to the highest-paid player. A new Daily every morning. | Google result text | `meta.description` |
| Salary Ladder: Who gets paid more? | Title on link previews (X, Bluesky, WhatsApp…) | `meta.ogTitle` |
| Two NBA players, one question: who makes more in 2026-27? Climb to the top of the salary ladder. | Text on link previews | `meta.ogDescription` |

## Every screen

| Text | Shows | Key |
|---|---|---|
| Salary Ladder | Page heading; top of the play screen; share picture title (in capitals) | `app.name` |
| Loading salaries… | While the salaries load | `app.loading` |
| Couldn't load the salaries. Check your connection and reload. | If the salaries fail to load | `app.loadFailed` |
| Salary Ladder needs JavaScript. | Browsers with JavaScript off | `app.noscript` |
| Daily | Daily before it has a number (until launch); personal best line | `mode.daily` |
| Daily #{number} | Top of the play screen, end-screen footer, share picture (in capitals) | `mode.dailyNumbered` |
| Unlimited | Same places, Unlimited games | `mode.unlimited` |
| Salaries as of {date} | Intro and end-screen footers. {date} is like "Oct 8" | `salariesAsOf` |

## Intro

How to play is a numbered list. Its numbers come from `rules/rules.json` and are shown in bold, so changing the rules file changes this text by itself: today {band} is 10, {lives} is 5, {seconds} is 8. {season} is 2026-27.

| Text | Shows | Key |
|---|---|---|
| Who gets paid more in {season}? | Under the heading (shown in capitals) | `intro.tagline` |
| Two players, paid within {band}% of each other. Tap the one who makes more in {season}. | How to play, 1 | `intro.howto.1` |
| Pick the challenger and you're right: he becomes your player and you climb a rung. Pick your player and you're right: you stay where you are. | How to play, 2 | `intro.howto.2` |
| A wrong pick or a timeout costs a life. {lives} lives, {seconds} seconds a pick. | How to play, 3 | `intro.howto.3` |
| Your score is the salary of the last player you reach. The top of the ladder is the highest-paid player in the NBA. | How to play, 4 | `intro.howto.4` |
| 🔥 {n}-day streak at stake | Streak line (spec 10): you have a streak and haven't played today's Daily | `intro.streakAtStake` |
| 🔥 {n}-day streak | Streak line: you've already played today's Daily | `intro.streak` |
| Play the Daily | Daily button before launch (no number yet) | `intro.playDaily` |
| Play the Daily #{number} | Daily button | `intro.playDailyNumbered` |
| Continue today's Daily | Daily button, game in progress | `intro.continueDaily` |
| See today's Daily result | Daily button, today's Daily already played | `intro.dailyDone` |
| Play Unlimited | Unlimited button | `intro.playUnlimited` |
| Continue Unlimited | Unlimited button, game in progress | `intro.continueUnlimited` |
| Daily: the same ladder for everyone, one play a day, new at 9 AM ET. Unlimited: as many games as you like. | Small print under the buttons | `intro.modes` |

## Playing

Nothing here may push the screen into scrolling on a small phone, so keep these short.

| Text | Shows | Key |
|---|---|---|
| Who gets paid more? | Above the two cards | `play.question` |
| Rung | Label on the rung counter | `play.rung` |
| Score | Label on the current score | `play.score` |
| {lives} of {max} lives left | Read aloud by screen readers for the hearts | `play.livesLabel` |
| {n}s | Seconds left, next to the timer bar | `play.seconds` |
| Arrow keys: ← your player · challenger → | Under the cards, computers only | `play.keys` |
| Your player | Top of your current player's card | `card.incumbent` |
| Challenger | Top of the challenger's card | `card.challenger` |
| Age {age} | On each card, after the position | `card.age` |
| Paid more | Tag on the richer card during the reveal | `card.paidMore` |

## The reveal after each pick

Shown for 1.5 seconds under the cards. ✓ and ✗ always go with the colour, never colour alone (spec 8). {left} is one of the three lives lines.

| Text | Shows | Key |
|---|---|---|
| ✓ Right. Up to rung {rung} | Right, on the challenger | `result.climb` |
| ✓ Right. You reached the top! | Right, and that climb reaches the highest-paid player | `result.top` |
| ✓ Right. You hold your rung | Right, on your own player | `result.hold` |
| ✗ Wrong. {left} | Wrong pick | `result.wrong` |
| ✗ Time's up. {left} | The 8 seconds ran out | `result.timeout` |
| 1 life left | {left} with one life left | `lives.one` |
| {n} lives left | {left} with more than one | `lives.other` |
| Game over | {left} when that was the last life | `lives.gameOver` |

## End screen

The big number is the score (like $31.4M). Screen readers hear "You reached" before it; it isn't shown, because the page has no small labels above headings.

| Text | Shows | Key |
|---|---|---|
| You reached | Read aloud before the score | `end.reached` |
| Top of the ladder | Badge when you reach the top; also on the share picture | `end.top` |
| New personal best! | Badge when you beat your personal best in this mode | `end.newBest` |
| You reached rung {rung} · {left}/{lives} lives left · {time} | Line under the score. {time} is like 3:12 | `end.summary` |
| Personal best ({mode}): {score} | Personal best, one per mode. {mode} is Daily or Unlimited | `end.best` |
| Higher than {pct}% of today's players | Share of today's players in this mode you beat | `end.rank` |
| Higher than {pct}% of today's players (early numbers) | The same, while fewer than 50 games have been played today | `end.rankEarly` |
| Rankings are down right now. Score not recorded. | Instead of the percentage, whenever rankings are off | `end.resting` |
| Share result | Button | `end.share` |
| Play Unlimited | Button after a Daily; also in the share window | `end.playUnlimited` |
| Play again | Button after an Unlimited game; also in the share window | `end.playAgain` |
| Home | Button | `end.home` |
| New Daily at 9 AM ET | Added to the footer after a Daily | `end.nextDaily` |

## Which contract would you rather have?

One optional tap on the end screen, between the last two players you saw (spec 14).

| Text | Shows | Key |
|---|---|---|
| Which contract would you rather have? | Heading | `contract.question` |
| Thanks, noted. | After tapping one | `contract.thanks` |

## Name entry for the boards

The two name refusals also come from the leaderboard Worker word for word; a test checks they match.

| Text | Shows | Key |
|---|---|---|
| Your name for the boards | Heading of the name box | `name.label` |
| Display name | Grey hint in the name field | `name.placeholder` |
| @handle (optional) | Grey hint in the handle field | `name.handlePlaceholder` |
| Save name | Button | `name.save` |
| Names are 2 to 24 characters. | Name too short or too long | `name.length` |
| That name can't go on the boards. Pick another. | The name filter refuses it | `name.refused` |
| Saved on this device. Rankings are down right now, so it is not on a board yet. | Saved while rankings are off | `name.savedResting` |
| Checking your score… | While the score is re-checked before posting | `name.checking` |
| Score not verified, retry | The re-check failed (spec 13.1, word for word) | `name.notVerified` |
| Retry | Button next to that message | `name.retry` |
| You're on the boards. | Posted. One rank line per board follows | `name.posted` |
| {board}: #{rank} | Like "This week: #12". {board} is a board name below | `name.rankLine` |

## The boards

Daily games have one board, titled with the Daily's name (like "Daily #12"). Unlimited has four. Money on the boards is shown like $31.42M.

| Text | Shows | Key |
|---|---|---|
| See the boards | Button on the end screen | `board.open` |
| Boards | Heading | `board.title` |
| Today | Unlimited: today's board (turns over at 9 AM ET) | `board.today` |
| This week | Unlimited: weekly board (from Monday 9 AM ET) | `board.week` |
| This month | Unlimited: monthly board (from the 1st, 9 AM ET) | `board.month` |
| All-time {season} | Unlimited: all-time board, labeled with its season | `board.allTime` |
| # | Column | `board.colRank` |
| Name | Column | `board.colName` |
| Score | Column | `board.colScore` |
| Time | Column | `board.colTime` |
| Your rank: #{rank} | Under the top 50, when your name is further down | `board.you` |
| (you) | After your own name on a board (your row is also highlighted) | `board.youMark` |
| Week of {date} | Under the tabs on This week, with the Monday it started | `board.weekOf` |
| No names on this board yet. | A board with nobody on it yet | `board.empty` |
| Rankings are down right now. | When the boards can't be loaded | `board.resting` |

## Share window

The same window as Spend $15 and the Daily 73-9: the picture, the link with Copy, the X, Bluesky, Facebook, WhatsApp, Reddit and Telegram buttons (each shows the platform's name), then Download, Copy image and More.

| Text | Shows | Key |
|---|---|---|
| Share your result | Read aloud when the window opens | `share.dialog` |
| Close | Read aloud for the × button | `share.close` |
| Link | Read aloud for the link field | `share.link` |
| Copy | Button next to the link: copies the share text and the link | `share.copyLink` |
| Share on {platform} | Read aloud for each platform button | `share.on` |
| Download | Button: saves the picture | `share.download` |
| Copy image | Button: copies the picture | `share.copyImage` |
| More | Button, on phones that can share files: opens the phone's own share sheet with the picture | `share.more` |
| Share unavailable. Use the buttons above. | When the phone's share sheet can't open | `share.moreFailed` |
| Saved to your downloads. | After Download | `share.saved` |
| Image copied. Paste it anywhere. | After Copy image | `share.imageCopied` |
| Copy blocked here. Use Download. | Copy image refused by the browser | `share.imageBlocked` |
| Text + link copied. | After Copy | `share.textCopied` |
| Copy blocked here. | Copy refused by the browser | `share.textBlocked` |

## Share text

What Copy puts on the clipboard and what the platform buttons post (spec 9). No player names, so it never spoils the Daily. The third line is the hearts (❤️ for lives left, 🖤 for lives lost) and the total time; the fourth is https://hoopsmatic.com/salary-ladder/. X adds @hoopshype on its own line and Bluesky adds @hoopshypeofficial.bsky.social; the others add nothing.

Example:

```
Salary Ladder #12 · Oct 9
I reached $31.4M (rung 34)
❤️❤️❤️🖤🖤 · 3:12
https://hoopsmatic.com/salary-ladder/
```

| Text | Shows | Key |
|---|---|---|
| Salary Ladder #{number} · {date} | First line, Daily | `shareText.dailyHead` |
| Salary Ladder · {date} | First line, Daily before launch (no number yet) | `shareText.dailyHeadNoNumber` |
| Salary Ladder · Unlimited | First line, Unlimited | `shareText.unlimitedHead` |
| I reached {score} (rung {rung}) | Second line | `shareText.line` |

## Share picture

The 73-9 card look, 1080×1350. Top to bottom: the title; the line saying what the game is; the headshot of the player you climbed to (the play cards' face2 crop, then the face crop, then his team's logo, then initials) with "I climbed to", his name and the score; the climb, one bar per rung won from the start salary to the score, both labelled; tiles for rung, lives and time; which game it was; the bottom line. The labels, the tile labels, which game and the bottom line are drawn in capitals; the line under the title and "I climbed to" are not. The picture names the player you reached; the share text does not.

| Text | Shows | Key |
|---|---|---|
| Pick who gets paid more. Climb the NBA salary ladder. | Under the title: what the game is | `image.tagline` |
| I climbed to | Beside the headshot, above the player's name and salary | `image.climbedTo` |
| I stayed at | The same place, in a game that never left the first player (rung 0) | `image.stayedAt` |
| Start | Under the first bar of the climb (its salary is above it) | `image.start` |
| Rung {rung} | Under the last bar of the climb (after "Top of the ladder ·" when you reached it) | `image.rung` |
| Rung | Label of the rung tile | `image.rungLabel` |
| Lives | Label under the hearts | `image.lives` |
| Time | Label under the time | `image.time` |
| Climb your own ladder at hoopsmatic.com/salary-ladder | Bottom line | `image.footer` |

## Not on this page

For the HoopsMatic "play next" card (build plan D1). Jorge confirms it again before it goes live there.

| Text | Shows | Key |
|---|---|---|
| Salary Ladder: Who gets paid more? Climb to the top. | Cross-promo card | `promo.card` |

## What changed from the B1 page

- **How to play** rewritten: says a timeout costs a life, that the score is the salary of the last player you reach, and puts the 10% band in the first line.
- **New:** the small print explaining Daily and Unlimited on the intro, and "New Daily at 9 AM ET" in the footer after a Daily.
- **Share window:** the second Copy button now says **Copy image** (spec 20), so the two Copy buttons can be told apart.
- **New, for C2:** the end-screen percentage, the name re-check messages, the boards.
- Everything else is the B1 text, unchanged.
