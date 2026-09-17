// Repasse sur les entrées sans cover et tente de la récupérer (plus lent).
// node /tmp/backfill-covers.mjs /tmp/import-data.json
import fs from 'fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const DATA_PATH = process.argv[2] || './import-data.json';
const DELAY_MS = Number(process.env.DELAY_MS || 1600);

const aliases = new Map();
try {
  for (const it of JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))) {
    if (it.query) aliases.set(norm(it.title), it.query);
  }
} catch {
  /* pas de fichier alias */
}

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

async function searchOnce(q) {
  const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  return res.json();
}

async function main() {
  const rows = await (await fetch(`${BASE}/api/manhwa`)).json();
  const todo = rows.filter((r) => !r.cover_path);
  console.log(`${todo.length} entrées sans cover`);

  let fixed = 0;
  const stillNo = [];

  for (const row of todo) {
    const q = aliases.get(norm(row.title)) || row.title;
    let hit = null;
    for (let attempt = 0; attempt < 2 && !hit; attempt++) {
      const results = await searchOnce(q);
      hit =
        results.find((r) => r.cover && fuzzyMatch(r.title, q)) ||
        results.find((r) => r.cover && fuzzyMatch(r.title, row.title)) ||
        null;
      if (!hit) await sleep(DELAY_MS);
    }

    if (hit) {
      const res = await fetch(`${BASE}/api/manhwa/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coverUrl: hit.cover,
          source: hit.source,
          externalId: hit.externalId,
        }),
      });
      if (res.ok) {
        fixed++;
        console.log(`OK  ${row.title}`);
      } else {
        console.warn('put fail', row.title, res.status);
        stillNo.push(row.title);
      }
    } else {
      stillNo.push(row.title);
      console.log(`--  ${row.title}`);
    }
    await sleep(DELAY_MS);
  }

  console.log('\n=== Backfill ===');
  console.log(`Covers ajoutées : ${fixed}`);
  console.log(`Toujours sans   : ${stillNo.length}`);
  if (stillNo.length) console.log(' - ' + stillNo.join('\n - '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
