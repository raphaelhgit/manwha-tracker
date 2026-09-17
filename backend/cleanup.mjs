// Nettoyage doublons + reclasse Shadow Slave + enrichit covers manquantes.
// Usage dans le conteneur: node /tmp/cleanup.mjs
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Groupes de doublons connus — on garde l'entrée avec cover, sinon la plus récente */
const DUP_GROUPS = [
  ['solo max level newbie', 'im the max level newbie'],
  ['mercenary enrollment', 'high school mercenary'],
  [
    'the dark magician transmigrates after 6666 years',
    '66666 years advent of the dark mage',
    '66 666 years advent of the dark mage',
  ],
];

async function main() {
  const list = await (await fetch(`${BASE}/api/manhwa`)).json();
  console.log('total', list.length);

  // Shadow Slave → light_novel
  const shadow = list.find((r) => norm(r.title) === 'shadow slave');
  if (shadow && shadow.type !== 'light_novel') {
    await fetch(`${BASE}/api/manhwa/${shadow.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'light_novel' }),
    });
    console.log('OK Shadow Slave → light_novel');
  }

  // Dedup
  for (const group of DUP_GROUPS) {
    const matches = list.filter((r) => group.includes(norm(r.title)));
    if (matches.length < 2) continue;
    matches.sort((a, b) => {
      const ac = a.cover_path ? 1 : 0;
      const bc = b.cover_path ? 1 : 0;
      if (bc !== ac) return bc - ac;
      return b.id - a.id;
    });
    const keep = matches[0];
    for (const drop of matches.slice(1)) {
      await fetch(`${BASE}/api/manhwa/${drop.id}`, { method: 'DELETE' });
      console.log(`dup delete "${drop.title}" (keep "${keep.title}")`);
    }
  }

  // Enrich covers for entries without one
  const fresh = await (await fetch(`${BASE}/api/manhwa`)).json();
  let enriched = 0;
  for (const row of fresh) {
    if (row.cover_path) continue;
    const q = row.title;
    try {
      const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) continue;
      const results = await res.json();
      const hit = results.find((r) => r.cover) || null;
      if (!hit?.cover) {
        console.log('no cover', row.title);
        continue;
      }
      await fetch(`${BASE}/api/manhwa/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coverUrl: hit.cover,
          source: hit.source,
          externalId: hit.externalId,
        }),
      });
      enriched++;
      console.log('cover OK', row.title);
    } catch (e) {
      console.warn('enrich fail', row.title, e.message);
    }
    await sleep(600);
  }

  const end = await (await fetch(`${BASE}/api/manhwa`)).json();
  console.log(JSON.stringify({
    total: end.length,
    withCover: end.filter((r) => r.cover_path).length,
    lightNovels: end.filter((r) => r.type === 'light_novel').map((r) => r.title),
    enriched,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
