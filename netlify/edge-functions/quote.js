export default async function handler(request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get('symbol') || '').toUpperCase().trim();
  const mode   = url.searchParams.get('mode') || 'quote';

  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=120' };

  if (!symbol) return new Response(JSON.stringify({ ok: false, error: 'No symbol' }), { status: 400, headers: cors });

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const yhHeaders = {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
  };

  // Yahoo's quoteSummary (v10) requires a session cookie + crumb token.
  // Without it, requests return 401 "Invalid Crumb". This fetches both
  // in one round-trip: hit finance.yahoo.com to get the "A1"/"A3" cookies,
  // then call getcrumb with those cookies to obtain the crumb token.
  async function getCrumb() {
    // Step 1: visit Yahoo to receive session cookies
    const r1 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' });
    const setCookie = r1.headers.get('set-cookie') || '';
    // Cloudflare Workers/Deno fetch only exposes one combined set-cookie header;
    // extract cookie pairs (name=value) before the first semicolon of each.
    const cookies = setCookie.split(/,(?=[^;]+=[^;]+)/).map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');

    // Step 2: request the crumb using those cookies
    const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, 'Cookie': cookies }
    });
    if (!r2.ok) return { crumb: null, cookies };
    const crumb = (await r2.text()).trim();
    return { crumb, cookies };
  }

  try {
    if (mode === 'search') {
      const r = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=6&newsCount=0&enableFuzzyQuery=true`, { headers: yhHeaders });
      const d = await r.json();
      return new Response(JSON.stringify({ ok: true, data: d?.quotes || [] }), { headers: cors });
    }

    if (mode === 'fundamentals') {
      const modules = 'price,summaryDetail,defaultKeyStatistics,financialData,assetProfile,calendarEvents';
      const { crumb, cookies } = await getCrumb();

      const qsUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&formatted=false`
        + (crumb ? `&crumb=${encodeURIComponent(crumb)}` : '');

      const r = await fetch(qsUrl, { headers: { ...yhHeaders, ...(cookies ? { Cookie: cookies } : {}) } });
      if (!r.ok) throw new Error(`YH ${r.status}`);
      const d = await r.json();
      const result = d?.quoteSummary?.result?.[0];
      if (!result) throw new Error('no result');
      return new Response(JSON.stringify({ ok: true, data: result }), { headers: cors });
    }

    // mode=quote — v8 chart meta, no auth required
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, { headers: yhHeaders });
    if (!r.ok) throw new Error(`YH ${r.status}`);
    const d = await r.json();
    const meta = d?.chart?.result?.[0]?.meta;
    if (!meta) throw new Error('no meta');
    return new Response(JSON.stringify({ ok: true, data: meta }), { headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 502, headers: cors });
  }
}

// Required: declares the path this edge function responds to.
export const config = { path: "/api/quote" };
