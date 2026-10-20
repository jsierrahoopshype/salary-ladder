// Every piece of text the player sees (build plan B3). The approved wording
// is docs/salary-ladder-copy.md; a test fails if this file and that doc
// differ by a single character, so change both together.
//
// {braces} are filled in by the page: numbers from the rules file, the
// season, dates, scores. tools/build-page.mjs also puts the texts named in
// page/index.html (title, labels, buttons) into the page, and inlines this file
// into index.html.

export const COPY = {
  // Search results, browser tab and link previews
  'meta.title': 'Salary Ladder: Who gets paid more? | HoopsMatic',
  'meta.description': 'Two NBA players, one question: who makes more in 2026-27? Climb from the bottom of the salary ladder to the highest-paid player. A new Daily every morning.',
  'meta.ogTitle': 'Salary Ladder: Who gets paid more?',
  'meta.ogDescription': 'Two NBA players, one question: who makes more in 2026-27? Climb to the top of the salary ladder.',

  // Every screen
  'app.name': 'Salary Ladder',
  'app.loading': 'Loading salaries…',
  'app.loadFailed': "Couldn't load the salaries. Check your connection and reload.",
  'app.noscript': 'Salary Ladder needs JavaScript.',
  'mode.daily': 'Daily',
  'mode.dailyNumbered': 'Daily #{number}',
  'mode.unlimited': 'Unlimited',
  'salariesAsOf': 'Salaries as of {date}',

  // Intro
  'intro.tagline': 'Who gets paid more in {season}?',
  'intro.howto.1': 'Two players, paid within {band}% of each other. Tap the one who makes more in {season}.',
  'intro.howto.2': "Pick the challenger and you're right: he becomes your player and you climb a rung. Pick your player and you're right: you stay where you are.",
  'intro.howto.3': 'A wrong pick or a timeout costs a life. {lives} lives, {seconds} seconds a pick.',
  'intro.howto.4': 'Your score is the salary of the last player you reach. The top of the ladder is the highest-paid player in the NBA.',
  'intro.streakAtStake': '🔥 {n}-day streak at stake',
  'intro.streak': '🔥 {n}-day streak',
  'intro.playDaily': 'Play the Daily',
  'intro.playDailyNumbered': 'Play the Daily #{number}',
  'intro.continueDaily': "Continue today's Daily",
  'intro.dailyDone': "See today's Daily result",
  'intro.playUnlimited': 'Play Unlimited',
  'intro.continueUnlimited': 'Continue Unlimited',
  'intro.modes': 'Daily: the same ladder for everyone, one play a day, new at 9 AM ET. Unlimited: as many games as you like.',

  // Playing
  'play.question': 'Who gets paid more?',
  'play.rung': 'Rung',
  'play.score': 'Score',
  'play.livesLabel': '{lives} of {max} lives left',
  'play.seconds': '{n}s',
  'play.keys': 'Arrow keys: ← your player · challenger →',
  'card.incumbent': 'Your player',
  'card.challenger': 'Challenger',
  'card.age': 'Age {age}',
  'card.paidMore': 'Paid more',

  // The reveal after each pick
  'result.climb': '✓ Right. Up to rung {rung}',
  'result.top': '✓ Right. You reached the top!',
  'result.hold': '✓ Right. You hold your rung',
  'result.wrong': '✗ Wrong. {left}',
  'result.timeout': "✗ Time's up. {left}",
  'lives.one': '1 life left',
  'lives.other': '{n} lives left',
  'lives.gameOver': 'Game over',

  // End screen
  'end.reached': 'You reached',
  'end.top': 'Top of the ladder',
  'end.newBest': 'New personal best!',
  'end.summary': 'You reached rung {rung} · {left}/{lives} lives left · {time}',
  'end.best': 'Personal best ({mode}): {score}',
  'end.rank': "Higher than {pct}% of today's players",
  'end.rankEarly': "Higher than {pct}% of today's players (early numbers)",
  'end.resting': 'Rankings are down right now. Score not recorded.',
  'end.share': 'Share result',
  'end.playUnlimited': 'Play Unlimited',
  'end.playAgain': 'Play again',
  'end.home': 'Home',
  'end.nextDaily': 'New Daily at 9 AM ET',

  // "Which contract would you rather have?"
  'contract.question': 'Which contract would you rather have?',
  'contract.thanks': 'Thanks, noted.',

  // Name entry for the boards
  'name.label': 'Your name for the boards',
  'name.placeholder': 'Display name',
  'name.handlePlaceholder': '@handle (optional)',
  'name.save': 'Save name',
  'name.length': 'Names are 2 to 24 characters.',
  'name.refused': "That name can't go on the boards. Pick another.",
  'name.savedResting': 'Saved on this device. Rankings are down right now, so it is not on a board yet.',
  'name.checking': 'Checking your score…',
  'name.notVerified': 'Score not verified, retry',
  'name.retry': 'Retry',
  'name.posted': "You're on the boards.",
  'name.rankLine': '{board}: #{rank}',

  // The boards
  'board.title': 'Boards',
  'board.today': 'Today',
  'board.week': 'This week',
  'board.month': 'This month',
  'board.allTime': 'All-time {season}',
  'board.colRank': '#',
  'board.colName': 'Name',
  'board.colScore': 'Score',
  'board.colTime': 'Time',
  'board.you': 'Your rank: #{rank}',
  'board.youMark': '(you)',
  'board.weekOf': 'Week of {date}',
  'board.empty': 'No names on this board yet.',
  'board.resting': 'Rankings are down right now.',

  // Share window
  'share.dialog': 'Share your result',
  'share.close': 'Close',
  'share.link': 'Link',
  'share.copyLink': 'Copy',
  'share.on': 'Share on {platform}',
  'share.download': 'Download',
  'share.copyImage': 'Copy image',
  'share.more': 'More',
  'share.moreFailed': 'Share unavailable. Use the buttons above.',
  'share.saved': 'Saved to your downloads.',
  'share.imageCopied': 'Image copied. Paste it anywhere.',
  'share.imageBlocked': 'Copy blocked here. Use Download.',
  'share.textCopied': 'Text + link copied.',
  'share.textBlocked': 'Copy blocked here.',

  // Share card text (spec 9): no player names, so it never spoils the Daily
  'shareText.dailyHead': 'Salary Ladder #{number} · {date}',
  'shareText.dailyHeadNoNumber': 'Salary Ladder · {date}',
  'shareText.unlimitedHead': 'Salary Ladder · Unlimited',
  'shareText.line': 'I reached {score} (rung {rung})',

  // Share picture (drawn in capitals)
  'image.tagline': 'Guess the bigger NBA salary and climb to the highest-paid player.',
  'image.climbedTo': 'I climbed to',
  'image.stayedAt': 'I stayed at',
  'image.start': 'Start',
  'image.rung': 'Rung {rung}',
  'image.rungLabel': 'Rung',
  'image.lives': 'Lives',
  'image.time': 'Time',
  'image.footer': 'Climb your own ladder at hoopsmatic.com/salary-ladder',

  // Not on this page: the HoopsMatic "play next" card (build plan D1)
  'promo.card': 'Salary Ladder: Who gets paid more? Climb to the top.',
};

/** The text for `key`, with its {braces} filled from `vars`. */
export function T(key, vars = {}) {
  return (COPY[key] ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * The same, as HTML: the wording is escaped and the values go in as given,
 * so the caller can bold a number (and must escape any value from data).
 */
export function TH(key, vars = {}) {
  return (COPY[key] ?? '').split(/(\{\w+\})/).map((part) => {
    const k = /^\{(\w+)\}$/.exec(part)?.[1];
    if (k && k in vars) return String(vars[k]);
    return part.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }).join('');
}
