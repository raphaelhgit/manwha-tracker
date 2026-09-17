// Enrichit cover + summary pour les entrées existantes (priorité Webtoon).
// Usage: node enrich-metadata.mjs [BASE_URL]
const BASE = process.argv[2] || process.env.BASE_URL || 'http://127.0.0.1:3000';
const DELAY = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchScore(resultTitle, query) {
  const x = norm(query);
  const y = norm(resultTitle);
  if (!x || !y) return 0;
  if (x === y) return 100;
  if (y.startsWith(`${x} `) || y.startsWith(`${x}:`)) return 60;
  if (x.startsWith(`${y} `) || x.startsWith(`${y}:`)) return 60;
  const short = x.length <= y.length ? x : y;
  const long = x.length <= y.length ? y : x;
  if (short.length >= 4 && long.includes(short)) return 40;
  return 0;
}

function fuzzy(a, b) {
  return matchScore(a, b) >= 40;
}

function bestMatch(results, title, sourceFilter) {
  let best = null;
  let bestScore = 0;
  for (const r of results) {
    if (sourceFilter && r.source !== sourceFilter) continue;
    const score = matchScore(r.title, title);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return bestScore >= 40 ? best : null;
}

function pickHits(results, title) {
  const webtoon = bestMatch(results, title, 'webtoon');
  const exact = bestMatch(results, title);
  const fallback = results.find((r) => r.cover || r.summary) || null;
  return { webtoon, best: webtoon || exact || fallback };
}

function isWebtoonCover(row) {
  return row.source === 'webtoon' || String(row.cover_path || '').startsWith('webtoon-');
}

async function main() {
  const list = await (await fetch(`${BASE}/api/manhwa`)).json();
  let covers = 0;
  let webtoonCovers = 0;
  let summaries = 0;
  let skipped = 0;

  for (const row of list) {
    const q = row.title;
    let hits = { webtoon: null, best: null };
    try {
      const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) hits = pickHits(await res.json(), q);
    } catch (e) {
      console.warn('search fail', q, e.message);
    }

    if (!hits.best) {
      console.log('--', q);
      await sleep(DELAY);
      continue;
    }

    const patch = {};
    const summarySrc = hits.webtoon?.summary || hits.best.summary;

    if (hits.webtoon?.cover && (!row.cover_path || !isWebtoonCover(row))) {
      patch.coverUrl = hits.webtoon.cover;
      patch.source = hits.webtoon.source;
      patch.externalId = hits.webtoon.externalId;
    } else if (!row.cover_path && hits.best.cover) {
      patch.coverUrl = hits.best.cover;
      patch.source = hits.best.source;
      patch.externalId = hits.best.externalId;
    }

    if ((!row.summary || !row.summary.trim()) && summarySrc) {
      patch.summary = summarySrc;
    }

    if (Object.keys(patch).length === 0) {
      skipped++;
      await sleep(300);
      continue;
    }

    const put = await fetch(`${BASE}/api/manhwa/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!put.ok) {
      console.warn('PUT fail', q, put.status, await put.text());
      await sleep(DELAY);
      continue;
    }

    if (patch.coverUrl) {
      covers++;
      if (patch.source === 'webtoon') webtoonCovers++;
    }
    if (patch.summary) summaries++;
    console.log('OK', q, hits.best.source, Object.keys(patch).join('+'));
    await sleep(DELAY);
  }

  console.log(
    JSON.stringify({ covers, webtoonCovers, summaries, skipped, total: list.length }, null, 2)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
