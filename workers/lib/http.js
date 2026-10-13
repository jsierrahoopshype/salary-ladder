// Responses and browser access for both Workers.

// The page is served from hoopsmatic.com, so its calls are same-origin; the
// GitHub Pages preview address is allowed too. Anything else gets no CORS
// header, so a copied page elsewhere can't use these Workers from a browser.
const ORIGINS = new Set(['https://hoopsmatic.com', 'https://jsierrahoopshype.github.io']);

export function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function csv(text, filename) {
  return new Response(text, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  if (!ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/** Wraps a handler: preflight, CORS headers, and no error ever escapes. */
export async function serve(request, handler) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  let res;
  try {
    res = await handler();
  } catch (err) {
    // Quiet by design (spec 18.2): the page shows "Rankings are resting".
    console.error(err);
    res = json({ ok: false, error: 'resting' }, 503);
  }
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(request))) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

export async function readJson(request) {
  try {
    const text = await request.text();
    if (text.length > 64 * 1024) return null; // a game is a few KB at most
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Path after the API prefix: '/salary-ladder/api/finish' -> '/finish'. */
export function apiPath(url) {
  const p = new URL(url).pathname.replace(/\/+$/, '');
  return p.replace(/^\/salary-ladder\/api/, '') || '/';
}
