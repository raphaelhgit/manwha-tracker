// Import en masse depuis import-data.json vers l'API locale.
// À lancer dans le conteneur : node /tmp/import.mjs /tmp/import-data.json
import fs from 'fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const DATA_PATH = process.argv[2] || './import-data.json';
const DELAY_MS = Number(process.env.DELAY_MS || 750);

const items = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function fuzzyMatch(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const short = x.length <= y.length ? x : y;
  const long = x.length <= y.length ? y : x;
  return short.length >= 4 && long.includes(short);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const existing = await (await fetch(`${BASE}/api/manhwa`)).json();
  const seen = new Set(existing.map((r) => norm(r.title)));

  let created = 0;
  let withCover = 0;
  let skipped = 0;
  const noCover = [];

  for (const item of items) {
    const key = norm(item.title);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);

    const q = item.query || item.title;
    let cover = null;
    let source = 'manual';
    let externalId = null;

    try {
      const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const results = await res.json();
        const hit =
          results.find((r) => fuzzyMatch(r.title, q)) ||
          results.find((r) => fuzzyMatch(r.title, item.title)) ||
          null;
        if (hit && hit.cover) {
          cover = hit.cover;
          source = hit.source;
          externalId = hit.externalId;
        }
      }
    } catch (e) {
      console.warn('search fail', item.title, e.message);
    }

    try {
      const res = await fetch(`${BASE}/api/manhwa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          type: item.type,
          coverUrl: cover,
          source,
          externalId,
          status: 'en_cours',
          last_chapter: '',
          score: 0,
        }),
      });
      if (res.ok) {
        created++;
        if (cover) withCover++;
        else noCover.push(item.title);
        console.log(`${cover ? 'OK  ' : 'nocov'} [${item.type}] ${item.title}`);
      } else {
        console.warn('create fail', item.title, res.status);
      }
    } catch (e) {
      console.warn('create error', item.title, e.message);
    }

    await sleep(DELAY_MS);
  }

  console.log('\n=== Résumé ===');
  console.log(`Créés     : ${created}`);
  console.log(`Avec cover: ${withCover}`);
  console.log(`Sans cover: ${created - withCover}`);
  console.log(`Ignorés   : ${skipped} (déjà présents)`);
  if (noCover.length) console.log('Sans cover :\n - ' + noCover.join('\n - '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
