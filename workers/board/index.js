// salary-ladder-board entry point. Cloudflare treats every export of this
// file as a handler or Durable Object class, so it exports only those; the
// logic (and what the tests use) is in board.js.
import { handle } from './board.js';

export { BoardDO } from './board.js';

export default {
  fetch: (request, env) => handle(request, env),
};
