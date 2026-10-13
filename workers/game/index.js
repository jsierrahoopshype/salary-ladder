// salary-ladder-game entry point. Cloudflare treats every export of this
// file as a handler, so it exports only the handlers; the logic (and what
// the tests use) is in game.js.
import { handle, scheduled } from './game.js';

export default {
  fetch: (request, env) => handle(request, env),
  scheduled: (event, env, ctx) => ctx.waitUntil(scheduled(event.cron, env)),
};
