// The game's calendar (spec 10, 12.1): every day, week and month turns over
// at 9:00 AM US Eastern, following daylight saving. Dates are 'YYYY-MM-DD'.

const ET = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
});

export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The game day live at `ms`: before 9 AM ET it's still the previous day. */
export function gameDay(ms) {
  const p = {};
  for (const q of ET.formatToParts(new Date(ms))) p[q.type] = q.value;
  const date = `${p.year}-${p.month}-${p.day}`;
  return Number(p.hour) < 9 ? addDays(date, -1) : date;
}

/** The Weekly board a game day belongs to: weeks start Monday 9 AM ET. */
export function weekOf(day) {
  const dow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}

/** The Monthly board: months start on the 1st at 9 AM ET. */
export function monthOf(day) {
  return day.slice(0, 7);
}

/** The same date `months` months earlier, clamped to that month's last day. */
export function monthsBefore(day, months) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}
