#!/usr/bin/env node
/**
 * Remplit les aliases manquants depuis AniList / MangaDex (external_id).
 * Usage (dans le conteneur ou avec DATA_DIR) :
 *   node backend/backfill-aliases.mjs
 *   node backend/backfill-aliases.mjs --force   # écrase aliases existants
 */
import { listManhwa, updateManhwa } from './db.js';
import { aliasesFromTitles, parseAliases } from './fuzzy.js';

const force = process.argv.includes('--force');
const ANILIST_URL = 'https://graphql.anilist.co';
const MANGADEX_URL = 'https://api.mangadex.org';

const QUERY = `
query ($id: Int) {
  Media(id: $id, type: MANGA) {
    title { romaji english native }
  }
}
`;

async function fetchAniList(id) {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { id: Number(id) } }),
  });
  if (!res.ok) throw new Error(`AniList ${res.status}`);
  const json = await res.json();
  const t = json?.data?.Media?.title;
  if (!t) return [];
  return [t.english, t.romaji, t.native].filter(Boolean);
}

async function fetchMangaDex(id) {
  const res = await fetch(`${MANGADEX_URL}/manga/${id}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`MangaDex ${res.status}`);
  const json = await res.json();
  const attrs = json?.data?.attributes || {};
  const titles = Object.values(attrs.title || {});
  const alts = (attrs.altTitles || []).flatMap((o) => Object.values(o));
  return [...titles, ...alts].filter(Boolean);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

const rows = listManhwa();
let updated = 0;
let skipped = 0;

for (const row of rows) {
  const existing = parseAliases(row.aliases);
  if (existing.length && !force) {
    skipped += 1;
    continue;
  }
  if (!row.source || !row.external_id) {
    skipped += 1;
    continue;
  }
  if (row.source !== 'anilist' && row.source !== 'mangadex') {
    skipped += 1;
    continue;
  }

  try {
    const titles =
      row.source === 'anilist'
        ? await fetchAniList(row.external_id)
        : await fetchMangaDex(row.external_id);
    const aliases = aliasesFromTitles(row.title, titles);
    if (!aliases.length) {
      skipped += 1;
      continue;
    }
    updateManhwa(row.id, { aliases });
    updated += 1;
    console.log(`OK #${row.id} ${row.title} → ${aliases.length} alias`);
    await sleep(250);
  } catch (err) {
    console.warn(`FAIL #${row.id} ${row.title}:`, err.message);
    await sleep(500);
  }
}

console.log(`Done — updated=${updated} skipped=${skipped}`);
