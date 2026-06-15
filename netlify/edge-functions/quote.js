export default async function handler(request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get('symbol') || '').toUpperCase().trim();
  const mode   = url.searchParams.get('mode') || 'quote';

  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=120' };

  if (!symbol) return new Response(JSON.stringify({ ok: false, error: 'No symbol' }), { status: 400, headers: cors });

  const yhHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
  };

  try {
    if (mode === 'search') {
      const r = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=6&newsCount=0&enableFuzzyQuery=true`, { headers: yhHeaders });
      const d = await r.json();
      return new Response(JSON.stringify({ ok: true, data: d?.quotes || [] }), { headers: cors });
    }

    if (mode === 'fundamentals') {
      const modules = 'price,summaryDetail,defaultKeyStatistics,financialData,assetProfile,calendarEvents';
      const r = await fetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&formatted=false`, { headers: yhHeaders });
      if (!r.ok) throw new Error(`YH ${r.status}`);
      const d = await r.json();
      const result = d?.quoteSummary?.result?.[0];
      if (!result) throw new Error('no result');
      return new Response(JSON.stringify({ ok: true, data: result }), { headers: cors });
    }

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
// Netlify needs this inline export — the netlify.toml [[edge_functions]]
// block alone is not always sufficient for the function to register.
export const config = { path: "/api/quote" };
